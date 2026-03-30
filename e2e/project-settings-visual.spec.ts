import { expect, test, type APIRequestContext } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const VISUAL_PROJECT_NAME = "Playwright Visual Settings Project";
const VISUAL_PROJECT_DESCRIPTION = "Stable project fixture for settings layout screenshots.";

let VISUAL_SESSION: AuthSession | null = null;
let createdProjectId: string | null = null;

function authHeaders(session: AuthSession) {
    return { Authorization: `Bearer ${session.token}` };
}

async function cleanupProject(request: APIRequestContext) {
    if (!VISUAL_SESSION || !createdProjectId) return;
    await request.delete(`/api/projects/${createdProjectId}`, {
        headers: authHeaders(VISUAL_SESSION),
    }).catch(() => undefined);
    createdProjectId = null;
}

test.describe("project settings visual", () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: { width: 1366, height: 960 } });

    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        VISUAL_SESSION = await getOrCreateAuthSession(request, "project settings visual");
    });

    test.afterEach(async ({ request }) => {
        await cleanupProject(request);
    });

    test.beforeEach(async ({ page }) => {
        if (!VISUAL_SESSION) {
            throw new Error("Project settings visual auth session is not initialized.");
        }
        await seedAuthState(page, VISUAL_SESSION);
    });

    test("task health and general tabs stay visually stable", async ({ page }) => {
        test.setTimeout(120_000);
        if (!VISUAL_SESSION) {
            throw new Error("Project settings visual auth session is not initialized.");
        }

        await page.goto("/projects", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15_000 });

        await page.getByTestId("projects-new-button").click();
        const createDialog = page.getByRole("dialog");
        await expect(createDialog.getByTestId("projects-create-name-input")).toBeVisible({ timeout: 10_000 });
        await createDialog.getByTestId("projects-create-name-input").fill(VISUAL_PROJECT_NAME);
        await createDialog.getByTestId("projects-create-description-input").fill(VISUAL_PROJECT_DESCRIPTION);
        await createDialog.getByTestId("projects-create-submit-button").click();

        await expect(page).toHaveURL(/\/projects\/.+\/settings\?onboard=1/);
        const match = page.url().match(/\/projects\/([^/]+)\/settings/);
        createdProjectId = match?.[1] ?? null;
        expect(createdProjectId).toBeTruthy();

        await page.goto(`/projects/${createdProjectId}/settings?tab=task-health`, { waitUntil: "domcontentloaded" });
        const taskHealthSection = page.getByTestId("project-settings-task-health-section");
        await expect(taskHealthSection).toBeVisible({ timeout: 15_000 });
        await expect(taskHealthSection).toHaveScreenshot("project-settings-task-health-tab.png", {
            animations: "disabled",
            caret: "hide",
        });

        await page.getByTestId("project-settings-tab-general").click();
        const generalSection = page.getByTestId("project-settings-general-section");
        await expect(generalSection).toBeVisible({ timeout: 15_000 });
        await expect(generalSection).toHaveScreenshot("project-settings-general-tab.png", {
            animations: "disabled",
            caret: "hide",
        });
    });
});

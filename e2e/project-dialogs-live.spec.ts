import { expect, test, type APIRequestContext } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let PROJECT_DIALOGS_SESSION: AuthSession | null = null;
let createdProjectId: string | null = null;

function authHeaders(session: AuthSession) {
    return { Authorization: `Bearer ${session.token}` };
}

async function cleanupProject(request: APIRequestContext) {
    if (!PROJECT_DIALOGS_SESSION || !createdProjectId) return;
    await request.delete(`/api/projects/${createdProjectId}`, {
        headers: authHeaders(PROJECT_DIALOGS_SESSION),
    }).catch(() => undefined);
    createdProjectId = null;
}

test.describe("project dialogs live", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        PROJECT_DIALOGS_SESSION = await getOrCreateAuthSession(request, "project dialogs live");
    });

    test.afterEach(async ({ request }) => {
        await cleanupProject(request);
    });

    test.beforeEach(async ({ page }) => {
        if (!PROJECT_DIALOGS_SESSION) {
            throw new Error("Project dialogs live auth session is not initialized.");
        }
        await seedAuthState(page, PROJECT_DIALOGS_SESSION);
    });

    test("live project create and edit dialogs stay usable", async ({ page, request }) => {
        test.setTimeout(120_000);
        if (!PROJECT_DIALOGS_SESSION) {
            throw new Error("Project dialogs live auth session is not initialized.");
        }

        const projectName = `playwright_live_project_${Date.now()}`;
        const initialDescription = "Temporary project created from the live dialog smoke.";
        const updatedDescription = "Updated through the live edit dialog smoke.";

        await page.goto("/projects", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15_000 });

        await page.getByTestId("projects-new-button").click();
        const createDialog = page.getByRole("dialog");
        await expect(createDialog.getByTestId("projects-create-name-input")).toBeVisible({ timeout: 10_000 });
        await expect(createDialog.getByTestId("projects-create-submit-button")).toBeVisible();

        await createDialog.getByTestId("projects-create-name-input").fill(projectName);
        await createDialog.getByTestId("projects-create-description-input").fill(initialDescription);

        const createResponsePromise = page.waitForResponse((response) => {
            const { pathname } = new URL(response.url());
            return response.request().method() === "POST" && pathname === "/api/projects";
        });

        await createDialog.getByTestId("projects-create-submit-button").click();
        const createResponse = await createResponsePromise;
        expect(createResponse.ok()).toBeTruthy();

        await expect(page).toHaveURL(/\/projects\/.+\/settings\?onboard=1/);
        await expect(page.getByTestId("project-settings-page")).toBeVisible({ timeout: 15_000 });

        const match = page.url().match(/\/projects\/([^/]+)\/settings/);
        createdProjectId = match?.[1] ?? null;
        expect(createdProjectId).toBeTruthy();

        const createdProjectResponse = await request.get(`/api/projects/${createdProjectId}`, {
            headers: authHeaders(PROJECT_DIALOGS_SESSION),
        });
        expect(createdProjectResponse.ok()).toBeTruthy();
        const createdProject = await createdProjectResponse.json() as { name?: string; description?: string };
        expect(createdProject.name).toBe(projectName);
        expect(createdProject.description).toBe(initialDescription);

        await page.goto("/projects", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("projects-search-input")).toBeVisible({ timeout: 15_000 });
        await page.getByTestId("projects-search-input").fill(projectName);

        const row = page.locator("tbody tr", { hasText: projectName }).first();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.getByTestId("projects-row-actions-toggle").click();
        await page.getByTestId("projects-row-compact-edit-button").click();

        const editDialog = page.getByRole("dialog");
        await expect(editDialog.getByTestId("projects-edit-description-input")).toBeVisible({ timeout: 10_000 });
        await editDialog.getByTestId("projects-edit-description-input").fill(updatedDescription);

        const updateResponsePromise = page.waitForResponse((response) => (
            response.request().method() === "PUT"
            && response.url().includes(`/api/projects/${createdProjectId}`)
        ));

        await editDialog.getByTestId("projects-edit-save-button").click();
        const updateResponse = await updateResponsePromise;
        expect(updateResponse.ok()).toBeTruthy();
        await expect(editDialog).toHaveCount(0);

        const updatedProjectResponse = await request.get(`/api/projects/${createdProjectId}`, {
            headers: authHeaders(PROJECT_DIALOGS_SESSION),
        });
        expect(updatedProjectResponse.ok()).toBeTruthy();
        const updatedProject = await updatedProjectResponse.json() as { description?: string };
        expect(updatedProject.description).toBe(updatedDescription);
    });
});

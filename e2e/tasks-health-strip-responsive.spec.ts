import { expect, test, type Page } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

type ProjectRecord = {
    id: string;
    name: string;
};

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const RESPONSIVE_VIEWPORTS = [
    { name: "desktop wide", width: 1440, height: 900 },
    { name: "laptop", width: 1280, height: 800 },
    { name: "tablet portrait", width: 820, height: 1180 },
    { name: "mobile portrait", width: 390, height: 844 },
] as const;

let TASKS_RESPONSIVE_SESSION: AuthSession | null = null;

async function getAccessibleProjects(session: AuthSession, page: Page) {
    const response = await page.request.get("/api/projects", {
        headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as ProjectRecord[];
}

async function assertNoViewportOverflow(page: Page) {
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBeFalsy();
}

test.describe("tasks health strip responsive", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        TASKS_RESPONSIVE_SESSION = await getOrCreateAuthSession(request, "tasks health strip responsive");
    });

    for (const viewport of RESPONSIVE_VIEWPORTS) {
        test(`health strip stays usable at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
            if (!TASKS_RESPONSIVE_SESSION) {
                throw new Error("Tasks responsive auth session is not initialized.");
            }

            await seedAuthState(page, TASKS_RESPONSIVE_SESSION);
            await page.setViewportSize({ width: viewport.width, height: viewport.height });

            const projects = await getAccessibleProjects(TASKS_RESPONSIVE_SESSION, page);
            const targetProject = projects.find((project) => project.name === "Demo Team Visibility Project") ?? projects[0];
            test.skip(!targetProject, "No accessible project is available for responsive tasks validation.");

            await page.goto(`/tasks?project=${targetProject.id}`, { waitUntil: "domcontentloaded" });

            const healthStrip = page.getByTestId("tasks-health-summary-strip");
            await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
            await expect(healthStrip).toBeVisible();
            await expect(page.getByTestId("tasks-health-summary-scope")).toBeVisible();

            const stripBox = await healthStrip.boundingBox();
            expect(stripBox).not.toBeNull();
            if (!stripBox) return;

            expect(stripBox.width).toBeGreaterThan(120);
            expect(stripBox.width).toBeLessThanOrEqual(viewport.width - 24);

            const visibleChipCount = await page.getByTestId("tasks-health-summary-chip").count();
            expect(visibleChipCount).toBeLessThanOrEqual(2);

            const segmentButtons = page.locator("[data-testid^='tasks-health-summary-segment-']");
            await expect(segmentButtons.first()).toBeVisible();

            await segmentButtons.first().click();
            await expect(page.getByTestId("tasks-health-summary-clear-button")).toBeVisible();

            await page.getByTestId("tasks-health-summary-clear-button").click();
            await expect(page.getByTestId("tasks-health-summary-clear-button")).toHaveCount(0);

            await assertNoViewportOverflow(page);
        });
    }
});

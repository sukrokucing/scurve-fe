import { expect, test, type Page } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

type ProjectRecord = {
    id: string;
};

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let MOBILE_MENU_SESSION: AuthSession | null = null;

async function getAccessibleProjects(session: AuthSession, page: Page) {
    const response = await page.request.get("/api/projects", {
        headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as ProjectRecord[];
}

async function assertNoViewportOverflow(page: Page) {
    const hasViewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasViewportOverflow).toBeFalsy();
}

test.describe("menu hierarchy mobile", () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        MOBILE_MENU_SESSION = await getOrCreateAuthSession(request, "menu hierarchy mobile");
    });

    test.beforeEach(async ({ page }) => {
        if (!MOBILE_MENU_SESSION) {
            throw new Error("Menu hierarchy mobile auth session is not initialized.");
        }
        await seedAuthState(page, MOBILE_MENU_SESSION);
    });

    test("projects page keeps the mobile first fold readable", async ({ page }) => {
        await page.goto("/projects", { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("projects-page-setup-card")).toBeVisible();
        await expect(page.getByTestId("projects-page-table-card")).toBeVisible();
        await expect(page.getByTestId("projects-refresh-button")).toBeVisible();
        await expect(page.getByTestId("projects-new-button")).toBeVisible();
        await assertNoViewportOverflow(page);
    });

    test("tasks page keeps mobile controls and first fold hierarchy readable", async ({ page }) => {
        if (!MOBILE_MENU_SESSION) {
            throw new Error("Menu hierarchy mobile auth session is not initialized.");
        }

        const projects = await getAccessibleProjects(MOBILE_MENU_SESSION, page);
        test.skip(projects.length === 0, "No accessible project is available for mobile tasks hierarchy validation.");

        await page.goto(`/tasks?project=${projects[0].id}`, { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("tasks-page-context-card")).toBeVisible();
        await expect(page.getByTestId("tasks-page-primary-actions-card")).toBeVisible();
        await expect(page.getByTestId("tasks-secondary-insights-card")).toBeVisible();
        await expect(page.getByTestId("tasks-mobile-quick-controls")).toBeVisible();
        await expect(page.getByTestId("tasks-team-summary")).toBeVisible();
        await expect(page.getByTestId("tasks-new-button")).toBeVisible();
        await expect(page.getByTestId("tasks-quick-create-input")).toBeVisible();
        await assertNoViewportOverflow(page);
    });
});

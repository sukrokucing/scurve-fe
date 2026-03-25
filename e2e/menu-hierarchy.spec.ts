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

let MENU_HIERARCHY_SESSION: AuthSession | null = null;

async function getAccessibleProjects(session: AuthSession, page: Page) {
    const response = await page.request.get("/api/projects", {
        headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as ProjectRecord[];
}

test.describe("menu hierarchy", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        MENU_HIERARCHY_SESSION = await getOrCreateAuthSession(request, "menu hierarchy");
    });

    test.beforeEach(async ({ page }) => {
        if (!MENU_HIERARCHY_SESSION) {
            throw new Error("Menu hierarchy auth session is not initialized.");
        }
        await seedAuthState(page, MENU_HIERARCHY_SESSION);
    });

    test("projects page keeps setup-first and action-separated hierarchy", async ({ page }) => {
        await page.goto("/projects", { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("projects-page-setup-card")).toBeVisible();
        await expect(page.getByTestId("projects-page-table-card")).toBeVisible();
        await expect(page.getByTestId("projects-refresh-button")).toBeVisible();
        await expect(page.getByTestId("projects-new-button")).toBeVisible();

        const actionToggles = page.getByTestId("projects-row-actions-toggle");
        if (await actionToggles.count()) {
            await expect(actionToggles.first()).toBeVisible();
            await actionToggles.first().click();
            await expect(page.getByTestId("projects-row-settings-link").first()).toBeVisible();
            await expect(page.getByTestId("projects-row-dashboard-link").first()).toBeVisible();
        }
    });

    test("tasks page keeps context, primary actions, and secondary insights distinct", async ({ page }) => {
        if (!MENU_HIERARCHY_SESSION) {
            throw new Error("Menu hierarchy auth session is not initialized.");
        }

        const projects = await getAccessibleProjects(MENU_HIERARCHY_SESSION, page);
        test.skip(projects.length === 0, "No accessible project is available for tasks hierarchy validation.");

        await page.goto(`/tasks?project=${projects[0].id}`, { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("tasks-page-context-card")).toBeVisible();
        await expect(page.getByTestId("tasks-page-primary-actions-card")).toBeVisible();
        await expect(page.getByTestId("tasks-secondary-insights-card")).toBeVisible();
        await expect(page.getByTestId("tasks-team-summary")).toBeVisible();
        await expect(page.getByTestId("tasks-search-input")).toBeVisible();
        await expect(page.getByTestId("tasks-new-button")).toBeVisible();
        await expect(page.getByTestId("tasks-time-to-task-summary")).toBeVisible();
        await expect(page.getByTestId("tasks-health-summary-strip")).toBeVisible();
    });

    test("policy and access flow pages keep guided admin framing", async ({ page }) => {
        await page.goto("/settings/policy", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Access Policy" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("policy-page-intro-card")).toBeVisible();
        await expect(page.getByTestId("policy-page-audit-card")).toBeVisible();
        await expect(page.getByTestId("policy-page-matrix-section")).toBeVisible();
        await expect(page.getByTestId("policy-audit-log-button")).toBeVisible();
        await expect(page.getByTestId("rbac-scope-overview")).toBeVisible();
        await expect(page.getByTestId("rbac-controls-panel")).toBeVisible();

        await page.goto("/settings/flow", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Access Flow Explorer" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("access-flow-page-intro-card")).toBeVisible();
        await expect(page.getByTestId("access-flow-page-guidance-card")).toBeVisible();
        await expect(page.getByTestId("access-flow-page-explorer-section")).toBeVisible();
        await expect(page.getByTestId("access-flow-overview")).toBeVisible();
        await expect(page.getByTestId("access-flow-selected-summary")).toBeVisible();
        await expect(page.getByTestId("access-flow-filter-summary")).toBeVisible();
    });

    test("users and roles pages keep guided admin framing", async ({ page }) => {
        await page.goto("/settings/users", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("users-page-intro-card")).toBeVisible();
        await expect(page.getByTestId("users-page-scope-card")).toBeVisible();
        await expect(page.getByTestId("users-page-table-card")).toBeVisible();
        await expect(page.getByTestId("users-search-input")).toBeVisible();

        await page.goto("/settings/roles", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("roles-page-intro-card")).toBeVisible();
        await expect(page.getByTestId("roles-page-primary-actions-card")).toBeVisible();
        await expect(page.getByTestId("roles-page-table-card")).toBeVisible();
        await expect(page.getByTestId("roles-create-button")).toBeVisible();
    });
});

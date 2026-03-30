import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

type ProjectRecord = {
    id: string;
};

type MenuExpectation = {
    route: string;
    heading: string;
    readyTestId: string;
};

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let MENU_SHELL_SESSION: AuthSession | null = null;

function collectConsoleIssues(page: Page) {
    const issues: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
        const type = message.type();
        if (type !== "warning" && type !== "error") {
            return;
        }
        const text = message.text();
        if (/Failed to load resource: the server responded with a status of 429/i.test(text)) {
            return;
        }
        if (/XML Parsing Error: syntax error/i.test(text) && /\/api\/(users|projects)/i.test(text)) {
            return;
        }
        issues.push(`[${type}] ${text}`);
    });
    return issues;
}

function expectNoConsoleIssues(issues: string[], scenario: string) {
    const details = issues.length ? `\n${issues.join("\n")}` : "";
    expect(issues, `${scenario} emitted console warnings/errors.${details}`).toEqual([]);
}

async function getAccessibleProjects(session: AuthSession, page: Page) {
    const response = await page.request.get("/api/projects", {
        headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as ProjectRecord[];
}

async function visitMenus(page: Page, menus: MenuExpectation[]) {
    for (const menu of menus) {
        await page.goto(menu.route, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId(menu.readyTestId)).toBeVisible({ timeout: 15_000 });
    }
}

async function assertNoViewportOverflow(page: Page) {
    const hasViewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasViewportOverflow).toBeFalsy();
}

test.describe("menu shell smoke", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth smoke runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        MENU_SHELL_SESSION = await getOrCreateAuthSession(request, "menu shell smoke");
    });

    test.beforeEach(async ({ page }) => {
        if (!MENU_SHELL_SESSION) {
            throw new Error("Menu shell smoke auth session is not initialized.");
        }
        await seedAuthState(page, MENU_SHELL_SESSION);
    });

    test("desktop top-level menus and detail admin surfaces stay healthy", async ({ page }) => {
        if (!MENU_SHELL_SESSION) {
            throw new Error("Menu shell smoke auth session is not initialized.");
        }

        const issues = collectConsoleIssues(page);
        const projects = await getAccessibleProjects(MENU_SHELL_SESSION, page);
        const tasksRoute = projects.length > 0 ? `/tasks?project=${projects[0].id}` : "/tasks";

        await visitMenus(page, [
            { route: "/", heading: "Dashboard", readyTestId: "dashboard-kpi-total-projects-value" },
            { route: "/projects", heading: "Projects", readyTestId: "projects-page-table-card" },
            { route: tasksRoute, heading: "Tasks", readyTestId: "tasks-page-context-card" },
            { route: "/settings/users", heading: "User Management", readyTestId: "users-page-table-card" },
            { route: "/settings/roles", heading: "Roles", readyTestId: "roles-page-table-card" },
            { route: "/settings/policy", heading: "Access Policy", readyTestId: "policy-page-matrix-section" },
            { route: "/settings/flow", heading: "Access Flow Explorer", readyTestId: "access-flow-page-explorer-section" },
        ]);

        await page.goto(`/settings/users/${MENU_SHELL_SESSION.user.id}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "User Access Management" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("user-access-page-intro-card")).toBeVisible();
        await expect(page.getByTestId("user-access-page-identity-card")).toBeVisible();
        await expect(page.getByTestId("user-access-page-roles-section")).toBeVisible();
        await expect(page.getByTestId("user-access-page-permissions-section")).toBeVisible();

        await page.goto("/settings/policy", { waitUntil: "domcontentloaded" });
        await page.getByTestId("policy-audit-log-button").click();
        await expect(page.getByRole("heading", { name: "System Audit Log" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("policy-audit-log-intro-card")).toBeVisible();
        await expect(page.getByTestId("policy-audit-log-filters-card")).toBeVisible();
        await expect(page.getByTestId("policy-audit-log-results-section")).toBeVisible();
        await page.getByRole("button", { name: "Close" }).click();

        await page.waitForTimeout(300);
        expectNoConsoleIssues(issues, "Desktop menu shell");
    });

    test.describe("mobile", () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

        test("top-level menus stay readable without overflow", async ({ page }) => {
            if (!MENU_SHELL_SESSION) {
                throw new Error("Menu shell smoke auth session is not initialized.");
            }

            const issues = collectConsoleIssues(page);
            const projects = await getAccessibleProjects(MENU_SHELL_SESSION, page);
            const tasksRoute = projects.length > 0 ? `/tasks?project=${projects[0].id}` : "/tasks";

            const menus: MenuExpectation[] = [
                { route: "/", heading: "Dashboard", readyTestId: "dashboard-kpi-total-projects-value" },
                { route: "/projects", heading: "Projects", readyTestId: "projects-page-table-card" },
                { route: tasksRoute, heading: "Tasks", readyTestId: "tasks-mobile-quick-controls" },
                { route: "/settings/users", heading: "User Management", readyTestId: "users-page-table-card" },
                { route: "/settings/roles", heading: "Roles", readyTestId: "roles-page-table-card" },
                { route: "/settings/policy", heading: "Access Policy", readyTestId: "policy-page-matrix-section" },
                { route: "/settings/flow", heading: "Access Flow Explorer", readyTestId: "access-flow-page-explorer-section" },
            ];

            for (const menu of menus) {
                await page.goto(menu.route, { waitUntil: "domcontentloaded" });
                await expect(page.getByTestId(menu.readyTestId)).toBeVisible({ timeout: 15_000 });
                await assertNoViewportOverflow(page);
            }

            await page.waitForTimeout(300);
            expectNoConsoleIssues(issues, "Mobile menu shell");
        });
    });
});

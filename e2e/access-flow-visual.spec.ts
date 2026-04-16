import { expect, test, type Page, type Route } from "@playwright/test";

const SESSION = {
    token: "access-flow-visual-token",
    user: {
        id: "access-flow-visual-user",
        name: "Access Flow Visual User",
        email: "access-flow-visual@example.com",
    },
    permissions: ["*"],
};

async function seedVisualAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

function fulfillJson(route: Route, body: unknown, status = 200) {
    return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
    });
}

async function installAccessFlowVisualMocks(page: Page) {
    const users = [
        { id: "user-1", name: "Alex Analyst", email: "alex.analyst@example.com", provider: "local", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        { id: "user-2", name: "Jamie Builder", email: "jamie.builder@example.com", provider: "local", created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
        { id: "user-3", name: "Morgan Planner", email: "morgan.planner@example.com", provider: "local", created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" },
        { id: "user-4", name: "Taylor Architect", email: "taylor.architect@example.com", provider: "local", created_at: "2026-01-04T00:00:00Z", updated_at: "2026-01-04T00:00:00Z" },
        { id: "user-5", name: "Jordan Developer", email: "jordan.developer@example.com", provider: "local", created_at: "2026-01-05T00:00:00Z", updated_at: "2026-01-05T00:00:00Z" },
        { id: "user-6", name: "Casey Reviewer", email: "casey.reviewer@example.com", provider: "local", created_at: "2026-01-06T00:00:00Z", updated_at: "2026-01-06T00:00:00Z" },
        { id: "user-7", name: "Riley Tester", email: "riley.tester@example.com", provider: "local", created_at: "2026-01-07T00:00:00Z", updated_at: "2026-01-07T00:00:00Z" },
        { id: "user-8", name: "Sky Support", email: "sky.support@example.com", provider: "local", created_at: "2026-01-08T00:00:00Z", updated_at: "2026-01-08T00:00:00Z" },
        { id: "user-9", name: "Blake Operator", email: "blake.operator@example.com", provider: "local", created_at: "2026-01-09T00:00:00Z", updated_at: "2026-01-09T00:00:00Z" },
    ];
    const rolesByUserId: Record<string, Array<{ id: string; name: string; description: string; created_at: string; updated_at: string }>> = {
        "user-1": [
            {
                id: "role-project-owner",
                name: "project_owner",
                description: "Owns the project scope and key approvals.",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
            {
                id: "role-system-analyst",
                name: "system_analyst",
                description: "Shapes requirements and analysis decisions.",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
        ],
    };
    const permissionsByRoleId: Record<string, Array<{ id: string; name: string; description: string; created_at: string; updated_at: string }>> = {
        "role-project-owner": [
            {
                id: "perm-project-view",
                name: "project.view",
                description: "View project data",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
            {
                id: "perm-project-update",
                name: "project.update",
                description: "Update project settings",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
        ],
        "role-system-analyst": [
            {
                id: "perm-task-view",
                name: "task.view",
                description: "View task data",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
            {
                id: "perm-task-update",
                name: "task.update",
                description: "Update task data",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
        ],
    };

    await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname } = url;

        if (!pathname.startsWith("/api/")) {
            await route.continue();
            return;
        }

        if (pathname === "/api/auth/me" && request.method() === "GET") {
            return fulfillJson(route, SESSION.user);
        }

        if (pathname === "/api/users" && request.method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                headers: {
                    "X-Total-Count": String(users.length),
                },
                body: JSON.stringify(users),
            });
        }

        if (/^\/api\/rbac\/users\/[^/]+\/roles$/.test(pathname) && request.method() === "GET") {
            const userId = pathname.split("/").at(-2) ?? "";
            return fulfillJson(route, rolesByUserId[userId] ?? []);
        }

        if (/^\/api\/rbac\/roles\/[^/]+\/permissions$/.test(pathname) && request.method() === "GET") {
            const roleId = pathname.split("/").at(-2) ?? "";
            return fulfillJson(route, permissionsByRoleId[roleId] ?? []);
        }

        if (pathname === "/api/users/me/projects" && request.method() === "GET") {
            return fulfillJson(route, []);
        }

        if (pathname === "/api/notifications" && request.method() === "GET") {
            return fulfillJson(route, []);
        }

        if (pathname === "/api/notifications/unread-count" && request.method() === "GET") {
            return fulfillJson(route, { unread_count: 0 });
        }

        if (pathname === "/api/telemetry/events" && request.method() === "POST") {
            return route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
        }

        return fulfillJson(route, {});
    });
}

test.describe("access flow visual", () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: { width: 1280, height: 900 } });
    test.skip(({ browserName }) => browserName !== "chromium", "Visual baseline is maintained on chromium.");

    test.beforeEach(async ({ page }) => {
        await seedVisualAuthState(page);
        await installAccessFlowVisualMocks(page);
    });

    test("laptop focused explorer stays visually stable", async ({ page }) => {
        await page.goto("/settings/flow", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Access Flow Explorer" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("access-flow-default-focus-banner")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("access-flow-selected-summary")).toContainText("User: Alex Analyst");

        const explorerSection = page.getByTestId("access-flow-page-explorer-section");
        await expect(explorerSection).toHaveScreenshot("access-flow-laptop-focused-explorer.png", {
            animations: "disabled",
            caret: "hide",
        });
    });
});

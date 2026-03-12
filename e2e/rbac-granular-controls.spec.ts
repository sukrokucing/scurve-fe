import { expect, test, type Page } from "@playwright/test";

const SESSION = {
    token: "rbac-granular-token",
    user: {
        id: "rbac-user-id",
        name: "RBAC Granular User",
        email: "rbac-granular@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

type MockRole = {
    id: string;
    name: string;
    description: string;
    created_at: string;
};

type MockPermission = {
    id: string;
    name: string;
    description?: string;
};

async function seedAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

async function installRbacApiMocks(page: Page) {
    const roles: MockRole[] = [
        {
            id: "admin",
            name: "admin",
            description: "Administrative access",
            created_at: "2026-02-01T00:00:00.000Z",
        },
        {
            id: "viewer",
            name: "viewer",
            description: "Read-only access",
            created_at: "2026-02-01T00:00:00.000Z",
        },
    ];

    const permissions: MockPermission[] = [
        { id: "perm-project-view", name: "project.view", description: "View projects" },
        { id: "perm-project-update", name: "project.update", description: "Update projects" },
        { id: "perm-task-view", name: "task.view", description: "View tasks" },
        { id: "perm-task-delete", name: "task.delete", description: "Delete tasks" },
    ];

    const rolePermissionMap = new Map<string, Set<string>>([
        ["admin", new Set(permissions.map((permission) => permission.id))],
        ["viewer", new Set(["perm-project-view", "perm-task-view"])],
    ]);

    await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname } = url;
        const method = request.method();

        if (!pathname.startsWith("/api/")) {
            await route.continue();
            return;
        }

        const json = (body: unknown, status = 200) =>
            route.fulfill({
                status,
                contentType: "application/json",
                body: JSON.stringify(body),
            });

        if (pathname === "/api/auth/me" && method === "GET") {
            return json(SESSION.user);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/effective-permissions$/.test(pathname) && method === "GET") {
            return json({
                user_id: SESSION.user.id,
                roles: [{ id: "admin", name: "admin" }],
                permissions: SESSION.permissions,
            });
        }

        if (pathname === "/api/projects" && method === "GET") {
            return json([]);
        }

        if (pathname === "/api/rbac/roles" && method === "GET") {
            return json(roles);
        }

        if (pathname === "/api/rbac/permissions" && method === "GET") {
            return json(permissions);
        }

        const rolePermGetMatch = pathname.match(/^\/api\/rbac\/roles\/([^/]+)\/permissions$/);
        if (rolePermGetMatch && method === "GET") {
            const roleId = rolePermGetMatch[1];
            const assignedIds = rolePermissionMap.get(roleId) ?? new Set<string>();
            return json(permissions.filter((permission) => assignedIds.has(permission.id)));
        }

        const rolePermPostMatch = pathname.match(/^\/api\/rbac\/roles\/([^/]+)\/permissions$/);
        if (rolePermPostMatch && method === "POST") {
            const roleId = rolePermPostMatch[1];
            const payload = request.postDataJSON() as { permission_id: string };
            const assigned = rolePermissionMap.get(roleId) ?? new Set<string>();
            assigned.add(payload.permission_id);
            rolePermissionMap.set(roleId, assigned);
            return json({ ok: true }, 201);
        }

        const rolePermDeleteMatch = pathname.match(/^\/api\/rbac\/roles\/([^/]+)\/permissions\/([^/]+)$/);
        if (rolePermDeleteMatch && method === "DELETE") {
            const roleId = rolePermDeleteMatch[1];
            const permissionId = rolePermDeleteMatch[2];
            const assigned = rolePermissionMap.get(roleId) ?? new Set<string>();
            assigned.delete(permissionId);
            rolePermissionMap.set(roleId, assigned);
            return json({ ok: true });
        }

        return json({});
    });
}

test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    await installRbacApiMocks(page);
});

test("rbac granular controls govern matrix interactions", async ({ page }) => {
    await page.goto("/settings/policy");
    await expect(page.getByRole("heading", { name: "Access Policy" })).toBeVisible();

    const editToggle = page.getByTestId("rbac-edit-mode-toggle");
    const grantToggle = page.getByTestId("rbac-grant-toggle");
    const revokeToggle = page.getByTestId("rbac-revoke-toggle");

    await expect(editToggle).toBeVisible();
    await expect(grantToggle).toHaveCount(0);
    await expect(revokeToggle).toHaveCount(0);

    const viewerDeleteCell = page.getByTestId("rbac-permission-cell-viewer-perm-task-delete");
    await expect(viewerDeleteCell).toBeVisible();

    await editToggle.click();
    await expect(grantToggle).toBeVisible();
    await expect(revokeToggle).toBeVisible();
    await expect(grantToggle).toBeEnabled();
    await expect(revokeToggle).toBeEnabled();

    await editToggle.click();
    await expect(grantToggle).toHaveCount(0);
    await expect(revokeToggle).toHaveCount(0);
    await expect(viewerDeleteCell).toBeDisabled();

    await editToggle.click();
    await expect(grantToggle).toBeVisible();
    await expect(revokeToggle).toBeVisible();

    await page.getByTestId("rbac-role-filter-combobox").click();
    await page.getByPlaceholder("Search roles...").fill("viewer");
    await page.getByPlaceholder("Search roles...").press("Enter");
    await expect(page.getByText(/1 role\(s\)/)).toBeVisible();

    await page.getByTestId("rbac-resource-filter-combobox").click();
    await page.getByPlaceholder("Search resources...").fill("task");
    await page.getByPlaceholder("Search resources...").press("Enter");
    await expect(page.locator("table").getByText("task", { exact: true })).toBeVisible();
    await expect(page.locator("text=project.update")).toHaveCount(0);

    await page.getByTestId("rbac-assigned-only-toggle").click();
    await expect(page.locator("text=task.view")).toBeVisible();
    await expect(page.locator("text=task.delete")).toHaveCount(0);

    await page.getByTestId("rbac-assigned-only-toggle").click();
    await page.getByTestId("rbac-role-grant-visible-viewer").click();
    await expect(viewerDeleteCell.getByText("Allow")).toBeVisible();

    await revokeToggle.click();
    await expect(viewerDeleteCell).toBeDisabled();
});

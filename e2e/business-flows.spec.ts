import { expect, test } from "@playwright/test";

type FlowMeta = {
    id: string;
    priority: "P0" | "P1";
    title: string;
    route: string;
};

const FLOW_CATALOG: FlowMeta[] = [
    { id: "BF-01", priority: "P0", title: "Dashboard overview", route: "/" },
    { id: "BF-02", priority: "P0", title: "Projects management", route: "/projects" },
    { id: "BF-03", priority: "P0", title: "Tasks planning workflow", route: "/tasks" },
    { id: "BF-04", priority: "P0", title: "Access flow explorer to user access", route: "/settings/flow" },
    { id: "BF-05", priority: "P0", title: "Roles management", route: "/settings/roles" },
    { id: "BF-06", priority: "P0", title: "Policy matrix and audit log", route: "/settings/policy" },
    { id: "BF-07", priority: "P1", title: "Users management", route: "/settings/users" },
    { id: "BF-08", priority: "P1", title: "Auth entry points", route: "/login" },
];

const SESSION = {
    token: process.env.PLAYWRIGHT_AUTH_TOKEN ?? "flow-catalog-token",
    user: {
        id: process.env.PLAYWRIGHT_USER_ID ?? "flow-catalog-user",
        name: process.env.PLAYWRIGHT_USER_NAME ?? "Flow Catalog User",
        email: process.env.PLAYWRIGHT_USER_EMAIL ?? "flow-catalog@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

test.beforeEach(async ({ page }) => {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
});

test.describe("Business Flow Coverage", () => {
    test(`${FLOW_CATALOG[0].id} ${FLOW_CATALOG[0].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[0].route);
        await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
        await expect(page.getByText("Total Projects")).toBeVisible();
        await expect(page.getByText("Project Progress")).toBeVisible();
    });

    test(`${FLOW_CATALOG[1].id} ${FLOW_CATALOG[1].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[1].route);
        await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

        await page.getByRole("button", { name: "New project" }).click();
        const createDialog = page.getByRole("dialog", { name: "Create project" });
        await expect(createDialog).toBeVisible();
        await createDialog.getByRole("button", { name: "Close" }).click();

        const editButtons = page.getByRole("button", { name: "Edit" });
        if (await editButtons.count()) {
            await editButtons.first().click();
            const editDialog = page.getByRole("dialog", { name: "Edit project" });
            await expect(editDialog).toBeVisible();
            await editDialog.getByRole("button", { name: "Close" }).click();
        }

        const dashboardLinks = page.getByRole("link", { name: "Dashboard" });
        if (await dashboardLinks.count()) {
            await dashboardLinks.first().click();
            await expect(page).toHaveURL(/\/projects\/.+\/dashboard/);
            await expect(page.getByText("S-Curve Performance")).toBeVisible();
        }
    });

    test(`${FLOW_CATALOG[2].id} ${FLOW_CATALOG[2].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[2].route);
        await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

        await page.getByRole("button", { name: "New task" }).click();
        const createTaskDialog = page.getByRole("dialog", { name: "Create task" });
        await expect(createTaskDialog).toBeVisible();

        await expect(createTaskDialog.getByRole("radio", { name: "Today" })).toBeVisible();
        await expect(createTaskDialog.getByRole("radio", { name: "Duration" })).toBeVisible();
        await expect(createTaskDialog.getByRole("radio", { name: "Custom" })).toBeVisible();

        await createTaskDialog.getByRole("radio", { name: "Today" }).click();
        await createTaskDialog.getByRole("radio", { name: "Duration" }).click();
        await createTaskDialog.getByRole("radio", { name: "Custom" }).click();
        await createTaskDialog.getByRole("button", { name: "Cancel" }).click();

        await page.getByRole("button", { name: "Board" }).click();
        await page.getByRole("button", { name: "Gantt" }).click();
        await page.getByRole("button", { name: "List" }).click();
    });

    test(`${FLOW_CATALOG[3].id} ${FLOW_CATALOG[3].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[3].route);
        await expect(page.getByRole("heading", { name: "Access Flow Explorer" })).toBeVisible();

        const userSearchTrigger = page.getByTestId("access-flow-user-search-combobox");
        await expect(userSearchTrigger).toBeVisible();
        await userSearchTrigger.click();
        await page.getByPlaceholder("Type name or email...").fill("test");

        const userRows = page.getByTestId("access-flow-user-item");
        if (await userRows.count()) {
            await userRows.first().click();
            await expect(page.getByTestId("access-flow-manage-access-button")).toBeVisible();
        }

        const roleButton = page.getByRole("button", { name: /super_admin/i });
        if (await roleButton.count()) {
            await roleButton.first().click();
        }

        if (await page.getByTestId("access-flow-manage-access-button").count()) {
            await page.getByTestId("access-flow-manage-access-button").first().click();
            await expect(page).toHaveURL(/\/settings\/users\/.+/);
            await expect(page.getByRole("heading", { name: "User Access Management" })).toBeVisible();

            await page.getByRole("button", { name: "Assign Role" }).click();
            const assignRoleDialog = page.getByRole("dialog", { name: "Assign Role" });
            await expect(assignRoleDialog).toBeVisible();
            await assignRoleDialog.getByRole("button", { name: "Close" }).click();
        }
    });

    test(`${FLOW_CATALOG[4].id} ${FLOW_CATALOG[4].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[4].route);
        await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();

        await page.getByRole("button", { name: "Create Role" }).click();
        const createRoleDialog = page.getByRole("dialog", { name: "Create New Role" });
        await expect(createRoleDialog).toBeVisible();
        await createRoleDialog.getByRole("button", { name: "Close" }).click();

        let roleNameButton = page.getByRole("button", { name: "super_admin" }).first();
        if (!(await roleNameButton.count())) {
            roleNameButton = page.locator("tbody tr td button").first();
        }
        if (await roleNameButton.count()) {
            await roleNameButton.click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
        }
    });

    test(`${FLOW_CATALOG[5].id} ${FLOW_CATALOG[5].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[5].route);
        await expect(page.getByRole("heading", { name: "Access Policy" })).toBeVisible();

        await page.getByRole("button", { name: "Audit Log" }).click();
        const auditDialog = page.getByRole("dialog", { name: "System Audit Log" });
        await expect(auditDialog).toBeVisible();
        await expect(auditDialog.getByRole("button", { name: "Next" })).toBeVisible();
        await auditDialog.getByRole("button", { name: "Close" }).click();
    });

    test(`${FLOW_CATALOG[6].id} ${FLOW_CATALOG[6].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[6].route);
        await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

        await page.getByRole("textbox", { name: "Search by name or email..." }).fill("test@example.com");
        const manageLinks = page.getByRole("link", { name: "Manage Access" });
        if (await manageLinks.count()) {
            await manageLinks.first().click();
            await expect(page).toHaveURL(/\/settings\/users\/.+/);
            await expect(page.getByRole("heading", { name: "User Access Management" })).toBeVisible();
        }
    });

    test(`${FLOW_CATALOG[7].id} ${FLOW_CATALOG[7].title}`, async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

        await page.getByRole("link", { name: "Create one" }).click();
        await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    });
});

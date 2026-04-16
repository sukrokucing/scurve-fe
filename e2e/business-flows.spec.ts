import { expect, test, type Page } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

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

async function openTasksAdvancedIfClosed(page: Page) {
    const panel = page.getByTestId("tasks-advanced-filters-panel");
    if (await panel.isVisible().catch(() => false)) return;
    await page.getByTestId("tasks-advanced-filters-toggle").click();
    await expect(panel).toBeVisible();
}

async function clickTasksViewButton(page: Page, testId: string) {
    const panel = page.getByTestId("tasks-advanced-filters-panel");
    const button = panel.getByTestId(testId);
    await button.scrollIntoViewIfNeeded();
    await button.evaluate((element: HTMLElement) => element.click());
}

async function ensureTasksProjectSelected(page: Page) {
    const projectCombobox = page.getByTestId("tasks-project-combobox");
    if (!(await projectCombobox.isVisible().catch(() => false))) return;

    const currentLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
    if (currentLabel.trim() && !/select project/i.test(currentLabel)) return;

    await projectCombobox.click();
    const firstProjectOption = page.locator("[cmdk-item]").first();
    if (await firstProjectOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstProjectOption.click();
    }
}

async function openFirstProjectActions(page: Page) {
    const actionToggle = page.getByTestId("projects-row-actions-toggle").first();
    if (await actionToggle.isVisible().catch(() => false)) {
        await actionToggle.click();
        await expect(page.getByRole("menu").last()).toBeVisible();
    }
}

let FLOW_SESSION: AuthSession | null = null;

test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(180_000);
    FLOW_SESSION = await getOrCreateAuthSession(request, "business flow");
});

test.beforeEach(async ({ page }) => {
    if (!FLOW_SESSION) {
        throw new Error("Business flow session is not initialized.");
    }
    await seedAuthState(page, FLOW_SESSION);
});

test.describe("Business Flow Coverage", () => {
    test(`${FLOW_CATALOG[0].id} ${FLOW_CATALOG[0].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[0].route);
        await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Total Projects")).toBeVisible();
        await expect(page.getByText("Project Progress", { exact: true })).toBeVisible();
    });

    test(`${FLOW_CATALOG[1].id} ${FLOW_CATALOG[1].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[1].route);
        await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

        await page.getByRole("button", { name: "New project" }).click();
        const createDialog = page.getByRole("dialog", { name: "Create project" });
        await expect(createDialog).toBeVisible();
        await createDialog.getByRole("button", { name: "Close" }).click();

        const actionToggles = page.getByTestId("projects-row-actions-toggle");
        if (await actionToggles.count()) {
            await openFirstProjectActions(page);
            await page.getByRole("menu").last().getByTestId("projects-row-compact-edit-button").click();
            const editDialog = page.getByRole("dialog", { name: "Edit project" });
            await expect(editDialog).toBeVisible();
            await editDialog.getByRole("button", { name: "Close" }).click();
        }

        if (await actionToggles.count()) {
            await openFirstProjectActions(page);
            await page.getByRole("menu").last().getByTestId("projects-row-dashboard-link").click();
            await expect(page).toHaveURL(/\/projects\/.+\/dashboard/);
            await expect(page.getByTestId("project-dashboard-metric-combobox")).toBeVisible();
        }
    });

    test(`${FLOW_CATALOG[2].id} ${FLOW_CATALOG[2].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[2].route);
        await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible({ timeout: 15_000 });
        await ensureTasksProjectSelected(page);

        await page.getByTestId("tasks-new-button").click();
        const createTaskDialog = page.getByRole("dialog", { name: "Create task" });
        await expect(createTaskDialog).toBeVisible();

        await expect(createTaskDialog.getByRole("radio", { name: "Today" })).toBeVisible();
        await expect(createTaskDialog.getByRole("radio", { name: "Duration" })).toBeVisible();
        await expect(createTaskDialog.getByRole("radio", { name: "Custom" })).toBeVisible();

        await createTaskDialog.getByRole("radio", { name: "Today" }).click();
        await createTaskDialog.getByRole("radio", { name: "Duration" }).click();
        await createTaskDialog.getByRole("radio", { name: "Custom" }).click();
        await createTaskDialog.getByRole("button", { name: "Cancel" }).click();

        await openTasksAdvancedIfClosed(page);
        await clickTasksViewButton(page, "tasks-view-board-button");
        await openTasksAdvancedIfClosed(page);
        await clickTasksViewButton(page, "tasks-view-gantt-button");
        await expect(page.getByTestId("gantt-view-mode-combobox")).toBeVisible();
        await openTasksAdvancedIfClosed(page);
        await clickTasksViewButton(page, "tasks-view-list-button");
    });

    test(`${FLOW_CATALOG[3].id} ${FLOW_CATALOG[3].title}`, async ({ page }) => {
        await page.goto(FLOW_CATALOG[3].route);
        await expect(page.getByRole("heading", { name: "Access Flow Explorer" })).toBeVisible();

        const userSearchTrigger = page.getByTestId("access-flow-user-search-combobox");
        await expect(userSearchTrigger).toBeVisible();
        await userSearchTrigger.click();
        const userSearchInput = page
            .getByPlaceholder(/Search users\.\.\.|Type name or email\.\.\./i)
            .first();
        await expect(userSearchInput).toBeVisible();
        await userSearchInput.fill("test");

        const firstOption = page.getByRole("option").first();
        if (await firstOption.isVisible().catch(() => false)) {
            await firstOption.click();
        }
        await page.keyboard.press("Escape");

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

        await page.getByTestId("users-search-input").fill("test@example.com");
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

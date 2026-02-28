import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const E2E_SESSION = {
    token: "e2e-smoke-token",
    user: {
        id: "e2e-user-id",
        name: "E2E Smoke",
        email: "e2e-smoke@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

function collectConsoleIssues(page: Page) {
    const issues: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
        const type = message.type();
        if (type === "warning" || type === "error") {
            issues.push(`[${type}] ${message.text()}`);
        }
    });
    return issues;
}

async function seedAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, E2E_SESSION);
}

function expectNoConsoleIssues(issues: string[], scenario: string) {
    const details = issues.length ? `\n${issues.join("\n")}` : "";
    expect(issues, `${scenario} emitted console warnings/errors.${details}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
});

test("settings flow does not emit console warnings/errors", async ({ page }) => {
    const issues = collectConsoleIssues(page);

    await page.goto("/settings/flow");
    await expect(page.getByRole("heading", { name: "Access Flow Explorer" })).toBeVisible();

    const userRows = page.locator('div[role="button"][aria-pressed]');
    if (await userRows.count()) {
        await userRows.first().click();
        const manageAccessButton = page.getByRole("button", { name: "Manage Access" });
        await expect(manageAccessButton).toBeVisible();
        await manageAccessButton.click();
        await expect(page).toHaveURL(/\/settings\/users\/.+/);
    }

    await page.waitForTimeout(300);
    expectNoConsoleIssues(issues, "Access Flow");
});

test("projects dialogs do not emit console warnings/errors", async ({ page }) => {
    const issues = collectConsoleIssues(page);

    await page.goto("/projects");
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

    await page.waitForTimeout(300);
    expectNoConsoleIssues(issues, "Projects");
});

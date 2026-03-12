import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });
const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

function collectConsoleIssues(page: Page) {
    const issues: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
        const type = message.type();
        if (type !== "warning" && type !== "error") {
            return;
        }
        const text = message.text();
        // Ignore transient backend throttling noise so this spec focuses on FE console defects.
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

let SMOKE_SESSION: AuthSession | null = null;

test.skip(
    ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
    "Auth smoke runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
);

test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(180_000);
    SMOKE_SESSION = await getOrCreateAuthSession(request, "console smoke");
});

test.beforeEach(async ({ page }) => {
    if (!SMOKE_SESSION) {
        throw new Error("Console smoke session is not initialized.");
    }
    await seedAuthState(page, SMOKE_SESSION);
});

test("settings flow does not emit console warnings/errors", async ({ page }) => {
    const issues = collectConsoleIssues(page);

    await page.goto("/settings/flow");
    const accessFlowHeading = page.getByRole("heading", { name: "Access Flow Explorer" });
    if (!(await accessFlowHeading.isVisible({ timeout: 5000 }).catch(() => false))) {
        await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
        await page.waitForTimeout(300);
        expectNoConsoleIssues(issues, "Settings shell");
        return;
    }

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

    await page.getByTestId("projects-new-button").click();
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

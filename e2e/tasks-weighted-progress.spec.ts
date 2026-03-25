import { expect, test, type Locator, type Page } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let TASKS_WEIGHTED_SESSION: AuthSession | null = null;

async function ensureProjectSelected(page: Page): Promise<boolean> {
    const projectCombobox = page.getByTestId("tasks-project-combobox");
    const initialLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
    if (initialLabel.trim() && !/select project/i.test(initialLabel)) return true;

    await projectCombobox.click();
    const firstProjectOption = page.locator("[cmdk-item]:visible").first();
    if (await firstProjectOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstProjectOption.click();
        const selectedLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
        return Boolean(selectedLabel.trim()) && !/select project/i.test(selectedLabel);
    }

    await page.keyboard.press("Escape").catch(() => undefined);
    const currentLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
    return Boolean(currentLabel.trim()) && !/select project/i.test(currentLabel);
}

async function rowActionForTitle(page: Page, title: string, testId: string): Promise<Locator> {
    const row = page.locator("tbody tr").filter({ hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByTestId("tasks-row-actions-trigger").click();
    const locator = page.getByTestId(testId).last();
    await expect(locator).toBeVisible({ timeout: 15_000 });
    return locator;
}

test.describe("tasks weighted progress", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        TASKS_WEIGHTED_SESSION = await getOrCreateAuthSession(request, "tasks weighted progress");
    });

    test.beforeEach(async ({ page }) => {
        if (!TASKS_WEIGHTED_SESSION) {
            throw new Error("Tasks weighted-progress auth session is not initialized.");
        }
        await seedAuthState(page, TASKS_WEIGHTED_SESSION);
    });

    test("weighted task creation seeds starter progress components", async ({ page }) => {
        test.setTimeout(90_000);
        const uniqueSuffix = Date.now();
        const taskTitle = `Weighted Task ${uniqueSuffix}`;

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        const projectReady = await ensureProjectSelected(page);
        test.skip(!projectReady, "No accessible project is available for weighted-task test.");

        await page.getByTestId("tasks-new-button").click();
        await expect(page.getByRole("heading", { name: "Create task" })).toBeVisible({ timeout: 15_000 });
        await page.getByTestId("tasks-create-title-input").fill(taskTitle);
        await page.getByTestId("tasks-create-progress-method-weighted").click();
        await expect(page.getByTestId("tasks-create-weighted-template-checkbox")).toBeVisible();
        await expect(page.getByTestId("tasks-create-weighted-template-preview")).toContainText("Planning ready");
        await page.getByTestId("tasks-create-submit-button").evaluate((element) => {
            (element as HTMLButtonElement).click();
        });
        await expect(page.getByRole("heading", { name: "Create task" })).toHaveCount(0, { timeout: 15_000 });

        await page.getByTestId("tasks-search-input").fill(taskTitle);
        await rowActionForTitle(page, taskTitle, "tasks-row-edit-button").then((button) => button.evaluate((element) => {
            (element as HTMLElement).click();
        }));
        await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("tasks-weighted-progress-section")).toBeVisible();
        await expect(page.getByTestId("tasks-progress-component-row")).toHaveCount(3, { timeout: 15_000 });
        await expect(page.getByTestId("tasks-progress-component-name-input").nth(0)).toHaveValue("Planning ready");
        await expect(page.getByTestId("tasks-progress-component-name-input").nth(1)).toHaveValue("Execution complete");
        await expect(page.getByTestId("tasks-progress-component-name-input").nth(2)).toHaveValue("Review and sign-off");

        await page.getByRole("button", { name: /^Cancel$/i }).click();
        await rowActionForTitle(page, taskTitle, "tasks-row-delete-button").then((button) => button.evaluate((element) => {
            (element as HTMLElement).click();
        }));
        await page.getByTestId("tasks-delete-confirm-button").click();
        await expect(page.getByText(taskTitle)).toHaveCount(0, { timeout: 15_000 });
    });
});

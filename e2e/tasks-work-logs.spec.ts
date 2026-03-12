import { expect, test, type Locator, type Page } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let TASKS_WORK_LOGS_SESSION: AuthSession | null = null;

async function resolveQuickCreateInput(page: Page): Promise<Locator> {
    const byTestId = page.getByTestId("tasks-quick-create-input");
    if (await byTestId.isVisible({ timeout: 3000 }).catch(() => false)) {
        return byTestId;
    }
    const byLabel = page.getByRole("textbox", { name: /Quick add task title, then press Enter/i });
    await expect(byLabel).toBeVisible({ timeout: 15_000 });
    return byLabel;
}

async function resolveQuickCreateButton(page: Page): Promise<Locator> {
    const byTestId = page.getByTestId("tasks-quick-create-button");
    if (await byTestId.isVisible({ timeout: 3000 }).catch(() => false)) {
        return byTestId;
    }
    const byRole = page.getByRole("button", { name: /^Quick add$/i });
    await expect(byRole).toBeVisible({ timeout: 15_000 });
    return byRole;
}

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

async function openTaskEditorForTitle(page: Page, title: string) {
    await page.getByTestId("tasks-search-input").fill(title);
    await expect(page.getByTestId("tasks-row-edit-button").first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tasks-row-edit-button").first().click();
    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tasks-edit-title-input")).toHaveValue(title, { timeout: 15_000 });
}

test.describe("tasks work logs", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        TASKS_WORK_LOGS_SESSION = await getOrCreateAuthSession(request, "tasks work logs");
    });

    test.beforeEach(async ({ page }) => {
        if (!TASKS_WORK_LOGS_SESSION) {
            throw new Error("Tasks work-logs auth session is not initialized.");
        }
        await seedAuthState(page, TASKS_WORK_LOGS_SESSION);
    });

    test("can add, edit, and delete work logs from task editor", async ({ page }) => {
        test.setTimeout(90_000);
        const uniqueSuffix = Date.now();
        const taskTitle = `WorkLog Task ${uniqueSuffix}`;
        const initialNote = `Initial work log ${uniqueSuffix}`;
        const updatedNote = `Updated work log ${uniqueSuffix}`;
        const today = new Date().toISOString().slice(0, 10);

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        const quickCreateInput = await resolveQuickCreateInput(page);
        const quickCreateButton = await resolveQuickCreateButton(page);
        const projectReady = await ensureProjectSelected(page);
        test.skip(!projectReady, "No accessible project is available for task work-log test.");

        await quickCreateInput.fill(taskTitle);
        await expect(quickCreateButton).toBeEnabled({ timeout: 10_000 });
        await quickCreateButton.click();
        await expect(quickCreateInput).toHaveValue("", { timeout: 15_000 });

        await openTaskEditorForTitle(page, taskTitle);

        await expect(page.getByTestId("tasks-work-log-section")).toBeVisible();
        const saveWorkLogButton = page.getByTestId("tasks-work-log-save-button");
        test.skip(
            await saveWorkLogButton.isDisabled(),
            "Work-log save is disabled. Project likely has no resource roles configured.",
        );

        await page.getByTestId("tasks-work-log-date-input").fill(today);
        await page.getByTestId("tasks-work-log-hours-input").fill("2.5");
        await page.getByTestId("tasks-work-log-note-input").fill(initialNote);

        await page.getByTestId("tasks-work-log-role-combobox").click();
        const firstRoleOption = page.locator("[cmdk-item]:visible").first();
        if (await firstRoleOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstRoleOption.click();
        } else {
            await page.keyboard.press("Escape").catch(() => undefined);
        }

        await saveWorkLogButton.click();
        await expect(page.getByTestId("tasks-work-log-row")).toHaveCount(1, { timeout: 15_000 });
        await expect(page.getByTestId("tasks-work-log-row").first()).toContainText(initialNote);
        await expect(page.getByTestId("tasks-work-log-row").first()).toContainText("2.50");

        const workLogTableScroller = page.getByTestId("tasks-work-log-section").locator("div.overflow-x-auto").first();
        await workLogTableScroller.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
        });
        await page.getByTestId("tasks-work-log-row").first().scrollIntoViewIfNeeded();
        await page.getByTestId("tasks-work-log-edit-button").first().evaluate((element) => {
            (element as HTMLButtonElement).click();
        });
        await page.getByTestId("tasks-work-log-hours-input").fill("3.25");
        await page.getByTestId("tasks-work-log-note-input").fill(updatedNote);
        await page.getByTestId("tasks-work-log-save-button").click();

        await expect(page.getByTestId("tasks-work-log-row").first()).toContainText(updatedNote, { timeout: 15_000 });
        await expect(page.getByTestId("tasks-work-log-row").first()).toContainText("3.25");

        await workLogTableScroller.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
        });
        await page.getByTestId("tasks-work-log-delete-button").first().evaluate((element) => {
            (element as HTMLButtonElement).click();
        });
        await expect(page.getByTestId("tasks-work-log-row")).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByText("No work logs yet.")).toBeVisible({ timeout: 15_000 });
    });
});

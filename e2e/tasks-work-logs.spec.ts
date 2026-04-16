import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { getOrCreateAuthSessionForCredentials, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

type TeamDemoReport = {
    project: {
        id: string;
        name: string;
    };
};

let TASKS_WORK_LOGS_SESSION: AuthSession | null = null;
let TASKS_WORK_LOGS_REPORT: TeamDemoReport | null = null;

async function selectProject(page: Page, projectName: string) {
    const projectCombobox = page.getByTestId("tasks-project-combobox");
    const currentLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
    if (currentLabel.includes(projectName)) return;

    await projectCombobox.click();
    await page.getByRole("option", { name: new RegExp(`^${projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).click();
    await expect(projectCombobox).toContainText(projectName);
}

async function createTaskViaDialog(page: Page, title: string) {
    await page.getByTestId("tasks-new-button").click();
    const createDialog = page.getByRole("dialog", { name: "Create task" });
    await expect(createDialog).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tasks-create-title-input").fill(title);
    await expect(page.getByTestId("tasks-create-submit-button")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("tasks-create-submit-button").click();
    await expect(createDialog).toBeHidden({ timeout: 15_000 });
}

async function openTaskEditorForTitle(page: Page, title: string) {
    await page.getByTestId("tasks-search-input").fill(title);
    const row = page.locator("tbody tr").filter({ hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.dblclick();
    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tasks-edit-title-input")).toHaveValue(title, { timeout: 15_000 });
}

async function openRowAction(page: Page, title: string, actionLabel: "Edit task" | "Delete task") {
    const row = page.locator("tbody tr").filter({ hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.scrollIntoViewIfNeeded();
    await row.getByTestId("tasks-row-actions-trigger").click();
    await page.getByRole("menuitem", { name: actionLabel }).click();
}

test.describe("tasks work logs", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);

        execFileSync(process.execPath, ["scripts/seed-team-demo.mjs"], {
            cwd: process.cwd(),
            stdio: "inherit",
            env: process.env,
        });

        const reportPath = path.resolve(process.cwd(), "artifacts", "team-demo-seed.json");
        TASKS_WORK_LOGS_REPORT = JSON.parse(readFileSync(reportPath, "utf8")) as TeamDemoReport;

        const demoPassword = process.env.DEMO_PERSONA_PASSWORD ?? process.env.TEST_PASSWORD ?? "password123";
        TASKS_WORK_LOGS_SESSION = await getOrCreateAuthSessionForCredentials(
            request,
            "demo.project.owner@example.com",
            demoPassword,
            {
                cacheKey: "tasks-work-logs-project-owner",
                purpose: "tasks work logs",
            },
        );
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

        if (!TASKS_WORK_LOGS_REPORT) {
            throw new Error("Tasks work-logs report is not initialized.");
        }

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        await selectProject(page, TASKS_WORK_LOGS_REPORT.project.name);

        await createTaskViaDialog(page, taskTitle);

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

        const createWorkLogResponsePromise = page.waitForResponse((response) => (
            response.request().method() === "POST"
            && /\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs$/.test(response.url())
        ));
        await saveWorkLogButton.evaluate((element) => {
            (element as HTMLButtonElement).click();
        });
        expect((await createWorkLogResponsePromise).ok()).toBeTruthy();
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
        const updateWorkLogResponsePromise = page.waitForResponse((response) => (
            response.request().method() === "PUT"
            && /\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs\/[^/]+$/.test(response.url())
        ));
        await page.getByTestId("tasks-work-log-save-button").evaluate((element) => {
            (element as HTMLButtonElement).click();
        });
        expect((await updateWorkLogResponsePromise).ok()).toBeTruthy();

        await expect(page.getByTestId("tasks-work-log-row").first()).toContainText(updatedNote, { timeout: 15_000 });
        await expect(page.getByTestId("tasks-work-log-row").first()).toContainText("3.25");

        await workLogTableScroller.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
        });
        const deleteWorkLogResponsePromise = page.waitForResponse((response) => (
            response.request().method() === "DELETE"
            && /\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs\/[^/]+$/.test(response.url())
        ));
        await page.getByTestId("tasks-work-log-delete-button").first().evaluate((element) => {
            (element as HTMLButtonElement).click();
        });
        expect((await deleteWorkLogResponsePromise).ok()).toBeTruthy();
        await expect(page.getByTestId("tasks-work-log-row")).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByText("No work logs yet.")).toBeVisible({ timeout: 15_000 });

        await page.getByRole("button", { name: /^Cancel$/i }).click();
        const deleteTaskResponsePromise = page.waitForResponse((response) => (
            response.request().method() === "DELETE"
            && /\/api\/projects\/[^/]+\/tasks\/[^/]+$/.test(response.url())
        ));
        await openRowAction(page, taskTitle, "Delete task");
        await page.getByTestId("tasks-delete-confirm-button").click();
        expect((await deleteTaskResponsePromise).ok()).toBeTruthy();
        await expect(page.locator("tbody tr").filter({ hasText: taskTitle })).toHaveCount(0, { timeout: 15_000 });
    });
});

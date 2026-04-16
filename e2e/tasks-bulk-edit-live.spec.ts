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

let TASKS_BULK_EDIT_SESSION: AuthSession | null = null;
let TASKS_BULK_EDIT_REPORT: TeamDemoReport | null = null;

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectProject(page: Page, projectName: string) {
    const projectCombobox = page.getByTestId("tasks-project-combobox");
    const currentLabel = (await projectCombobox.textContent().catch(() => "")) ?? "";
    if (currentLabel.includes(projectName)) return;

    await projectCombobox.click();
    await page.getByRole("option", { name: new RegExp(`^${escapeRegex(projectName)}$`) }).click();
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

async function filterTasks(page: Page, query: string) {
    await page.getByTestId("tasks-search-input").fill(query);
}

function getVisibleTaskRows(page: Page, query: string) {
    return page.locator("tbody tr").filter({ hasText: query });
}

async function selectTaskRow(page: Page, title: string) {
    const row = page.locator("tbody tr").filter({ hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.scrollIntoViewIfNeeded();
    await row.getByTestId("tasks-row-select-checkbox").click();
}

async function cleanupMatchingTasks(page: Page, prefix: string) {
    await filterTasks(page, prefix);
    const matchingRows = getVisibleTaskRows(page, prefix);
    const rowCount = await matchingRows.count().catch(() => 0);
    if (rowCount === 0) return;

    const selectAll = page.getByTestId("tasks-select-all-page-checkbox");
    await expect(selectAll).toBeVisible({ timeout: 10_000 });
    await selectAll.click();

    const bulkEditToggle = page.getByTestId("tasks-selection-actions-toggle");
    await expect(bulkEditToggle).toBeVisible({ timeout: 10_000 });
    await bulkEditToggle.click();
    await expect(page.getByTestId("tasks-selection-actions-panel")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("tasks-bulk-delete-button").click();
    await expect(page.getByTestId("tasks-bulk-delete-confirm-button")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("tasks-bulk-delete-confirm-button").click();
    await expect(matchingRows).toHaveCount(0, { timeout: 15_000 });
}

test.describe("tasks bulk edit", () => {
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
        TASKS_BULK_EDIT_REPORT = JSON.parse(readFileSync(reportPath, "utf8")) as TeamDemoReport;

        const demoPassword = process.env.DEMO_PERSONA_PASSWORD ?? process.env.TEST_PASSWORD ?? "password123";
        TASKS_BULK_EDIT_SESSION = await getOrCreateAuthSessionForCredentials(
            request,
            "demo.project.owner@example.com",
            demoPassword,
            {
                cacheKey: "tasks-bulk-edit-project-owner",
                purpose: "tasks bulk edit",
            },
        );
    });

    test.beforeEach(async ({ page }) => {
        if (!TASKS_BULK_EDIT_SESSION) {
            throw new Error("Tasks bulk-edit auth session is not initialized.");
        }
        await seedAuthState(page, TASKS_BULK_EDIT_SESSION);
    });

    test("can bulk update progress and bulk delete selected tasks from the live Tasks list", async ({ page }) => {
        test.setTimeout(90_000);
        const uniqueSuffix = Date.now();
        const taskPrefix = `Bulk Edit Task ${uniqueSuffix}`;
        const taskTitles = [`${taskPrefix} A`, `${taskPrefix} B`];

        if (!TASKS_BULK_EDIT_REPORT) {
            throw new Error("Tasks bulk-edit report is not initialized.");
        }

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        await selectProject(page, TASKS_BULK_EDIT_REPORT.project.name);

        try {
            for (const title of taskTitles) {
                await createTaskViaDialog(page, title);
            }

            await filterTasks(page, taskPrefix);
            for (const title of taskTitles) {
                await expect(page.locator("tbody tr").filter({ hasText: title }).first()).toBeVisible({ timeout: 15_000 });
                await selectTaskRow(page, title);
            }

            await expect(page.getByText("2 selected")).toBeVisible({ timeout: 10_000 });
            await page.getByTestId("tasks-selection-actions-toggle").click();
            await expect(page.getByTestId("tasks-selection-actions-panel")).toBeVisible({ timeout: 10_000 });

            await page.getByTestId("tasks-bulk-progress-input").fill("35");
            await expect(page.getByTestId("tasks-bulk-apply-button")).toBeEnabled({ timeout: 10_000 });

            const bulkUpdateResponsePromise = page.waitForResponse((response) => (
                response.request().method() === "PUT"
                && /\/api\/projects\/[^/]+\/tasks\/batch$/.test(response.url())
            ));

            await page.getByTestId("tasks-bulk-apply-button").click();
            expect((await bulkUpdateResponsePromise).ok()).toBeTruthy();

            await expect(page.getByTestId("tasks-selection-actions-toggle")).toHaveCount(0, { timeout: 15_000 });
            for (const title of taskTitles) {
                await expect(page.locator("tbody tr").filter({ hasText: title }).first()).toContainText("35%", { timeout: 15_000 });
            }

            for (const title of taskTitles) {
                await selectTaskRow(page, title);
            }

            await page.getByTestId("tasks-selection-actions-toggle").click();
            await expect(page.getByTestId("tasks-selection-actions-panel")).toBeVisible({ timeout: 10_000 });

            const bulkDeleteResponsePromise = page.waitForResponse((response) => (
                response.request().method() === "DELETE"
                && /\/api\/projects\/[^/]+\/tasks\/batch$/.test(response.url())
            ));

            await page.getByTestId("tasks-bulk-delete-button").click();
            await expect(page.getByTestId("tasks-bulk-delete-confirm-button")).toBeVisible({ timeout: 10_000 });
            await page.getByTestId("tasks-bulk-delete-confirm-button").click();
            expect((await bulkDeleteResponsePromise).ok()).toBeTruthy();

            for (const title of taskTitles) {
                await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0, { timeout: 15_000 });
            }
        } finally {
            await cleanupMatchingTasks(page, taskPrefix).catch(() => undefined);
        }
    });
});

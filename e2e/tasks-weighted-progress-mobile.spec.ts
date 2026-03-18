import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let TASKS_WEIGHTED_MOBILE_SESSION: AuthSession | null = null;

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

async function findMobileTaskCard(page: Page, title: string): Promise<Locator> {
    const card = page.getByTestId("tasks-mobile-card").filter({ hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    return card;
}

async function ensureProjectAvailable(
    page: Page,
    request: APIRequestContext,
    session: AuthSession,
): Promise<{ ready: boolean; createdProjectId: string | null }> {
    if (await ensureProjectSelected(page)) {
        return { ready: true, createdProjectId: null };
    }

    const createResponse = await request.post("/api/projects", {
        headers: {
            Authorization: `Bearer ${session.token}`,
        },
        data: {
            name: `Playwright Mobile Project ${Date.now()}`,
            description: "Temporary project for mobile weighted task coverage.",
        },
    });

    if (!createResponse.ok()) {
        return { ready: false, createdProjectId: null };
    }

    const createdProject = await createResponse.json() as { id?: string };
    await page.reload({ waitUntil: "domcontentloaded" });
    return {
        ready: await ensureProjectSelected(page),
        createdProjectId: createdProject.id ?? null,
    };
}

test.describe("tasks weighted progress mobile", () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        TASKS_WEIGHTED_MOBILE_SESSION = await getOrCreateAuthSession(request, "tasks weighted progress mobile");
    });

    test.beforeEach(async ({ page }) => {
        if (!TASKS_WEIGHTED_MOBILE_SESSION) {
            throw new Error("Tasks weighted-progress mobile auth session is not initialized.");
        }
        await seedAuthState(page, TASKS_WEIGHTED_MOBILE_SESSION);
    });

    test("mobile create and edit flow keeps weighted progress components editable", async ({ page, request }) => {
        test.setTimeout(90_000);
        const uniqueSuffix = Date.now();
        const taskTitle = `Weighted Mobile Task ${uniqueSuffix}`;

        if (!TASKS_WEIGHTED_MOBILE_SESSION) {
            throw new Error("Tasks weighted-progress mobile auth session is not initialized.");
        }

        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        const { ready: projectReady, createdProjectId } = await ensureProjectAvailable(page, request, TASKS_WEIGHTED_MOBILE_SESSION);
        test.skip(!projectReady, "No accessible project is available and the test could not create one.");

        try {
            await expect(page.getByTestId("tasks-mobile-quick-controls")).toBeVisible({ timeout: 15_000 });
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
            const createdCard = await findMobileTaskCard(page, taskTitle);
            await expect(createdCard).toContainText("Weighted");

            await createdCard.getByTestId("tasks-mobile-edit-button").click();
            await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible({ timeout: 15_000 });
            await expect(page.getByTestId("tasks-weighted-progress-section")).toBeVisible();
            await expect(page.getByTestId("tasks-progress-component-row")).toHaveCount(3, { timeout: 15_000 });

            const firstCompletionInput = page.getByTestId("tasks-progress-component-completion-input").nth(0);
            await firstCompletionInput.fill("100");
            await page.getByTestId("tasks-progress-components-save-button").click();
            await expect(page.getByText("Progress components updated").last()).toBeVisible({ timeout: 15_000 });

            await page.getByRole("button", { name: /^Cancel$/i }).click();
            const refreshedCard = await findMobileTaskCard(page, taskTitle);
            await refreshedCard.getByTestId("tasks-mobile-edit-button").click();
            await expect(page.getByTestId("tasks-progress-component-completion-input").nth(0)).toHaveValue("100", { timeout: 15_000 });

            await page.getByRole("button", { name: /^Cancel$/i }).click();
            const deletableCard = await findMobileTaskCard(page, taskTitle);
            await deletableCard.getByTestId("tasks-mobile-delete-button").click();
            await page.getByTestId("tasks-delete-confirm-button").click();
            await expect(page.getByText(taskTitle)).toHaveCount(0, { timeout: 15_000 });
        } finally {
            if (createdProjectId) {
                await request.delete(`/api/projects/${createdProjectId}`, {
                    headers: {
                        Authorization: `Bearer ${TASKS_WEIGHTED_MOBILE_SESSION.token}`,
                    },
                }).catch(() => undefined);
            }
        }
    });
});

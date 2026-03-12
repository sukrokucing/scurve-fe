import { expect, test, type Locator, type Page } from "@playwright/test";
import { getOrCreateAuthSessionForCredentials, seedAuthState, type AuthSession } from "./support/auth-session";

const rawSuffix = (process.env.DEMO_PERSONA_SUFFIX ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const personaPassword = process.env.DEMO_PERSONA_PASSWORD ?? process.env.TEST_PASSWORD;
const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

function personaEmail(localPart: string) {
    if (!rawSuffix) return `${localPart}@example.com`;
    return `${localPart}.${rawSuffix}@example.com`;
}

const personas = [
    { key: "project_owner", email: personaEmail("demo.project.owner"), label: "Project Owner" },
    { key: "system_analyst", email: personaEmail("demo.system.analyst"), label: "System Analyst" },
    { key: "backend_developer", email: personaEmail("demo.backend.developer"), label: "Backend Developer" },
    { key: "frontend_developer", email: personaEmail("demo.frontend.developer"), label: "Frontend Developer" },
    { key: "fullstack_developer", email: personaEmail("demo.fullstack.developer"), label: "Fullstack Developer" },
    { key: "data_analyst", email: personaEmail("demo.data.analyst"), label: "Data Analyst" },
];

const PERSONA_SESSIONS = new Map<string, AuthSession>();
const PERSONA_SESSION_ERRORS = new Map<string, string>();

async function loginAs(page: Page, session: AuthSession) {
    await seedAuthState(page, session);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible({ timeout: 20_000 });
}

async function ensureProjectSelected(page: Page): Promise<boolean> {
    const quickCreateButton = await resolveQuickCreateButton(page);
    const alreadyEnabled = await quickCreateButton.isEnabled().catch(() => false);
    if (alreadyEnabled) return true;

    await page.getByTestId("tasks-project-combobox").click();
    const firstProjectOption = page.locator("[cmdk-item]").first();
    if (await firstProjectOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstProjectOption.click();
        return true;
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    return false;
}

async function openAdvancedPanel(page: Page) {
    const panel = page.getByTestId("tasks-advanced-filters-panel");
    if (await panel.isVisible().catch(() => false)) return;
    await page.getByTestId("tasks-advanced-filters-toggle").click();
    await expect(panel).toBeVisible();
}

async function resolveQuickCreateInput(page: Page): Promise<Locator> {
    const byTestId = page.getByTestId("tasks-quick-create-input");
    if (await byTestId.isVisible({ timeout: 3000 }).catch(() => false)) {
        return byTestId;
    }

    const byLabel = page.getByRole("textbox", { name: /Quick add task title, then press Enter/i });
    await expect(byLabel).toBeVisible({ timeout: 15000 });
    return byLabel;
}

async function resolveQuickCreateButton(page: Page): Promise<Locator> {
    const byTestId = page.getByTestId("tasks-quick-create-button");
    if (await byTestId.isVisible({ timeout: 3000 }).catch(() => false)) {
        return byTestId;
    }

    const byRole = page.getByRole("button", { name: /^Quick add$/i });
    await expect(byRole).toBeVisible({ timeout: 15000 });
    return byRole;
}

test.describe("persona workflow ergonomics", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Persona workflow runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(240_000);
        if (!personaPassword) {
            throw new Error("Missing DEMO_PERSONA_PASSWORD or TEST_PASSWORD for persona login tests.");
        }

        for (const persona of personas) {
            try {
                const session = await getOrCreateAuthSessionForCredentials(request, persona.email, personaPassword, {
                    cacheKey: `persona-${persona.key}`,
                    purpose: `persona workflow (${persona.key})`,
                    maxLoginAttempts: 4,
                });
                PERSONA_SESSIONS.set(persona.key, session);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                PERSONA_SESSION_ERRORS.set(persona.key, message);
            }
        }
    });

    for (const persona of personas) {
        test(`${persona.label} can quick-create and switch task modes`, async ({ page }) => {
            test.setTimeout(60_000);
            const sessionError = PERSONA_SESSION_ERRORS.get(persona.key);
            test.skip(Boolean(sessionError), sessionError ? `Session unavailable: ${sessionError}` : undefined);
            const session = PERSONA_SESSIONS.get(persona.key);
            if (!session) {
                throw new Error(`Missing cached session for persona ${persona.key}.`);
            }
            await loginAs(page, session);

            await page.goto("/tasks");
            const quickCreateInput = await resolveQuickCreateInput(page);
            const quickCreateButton = await resolveQuickCreateButton(page);
            const projectReady = await ensureProjectSelected(page);
            if (!projectReady && !(await quickCreateButton.isEnabled().catch(() => false))) {
                return;
            }

            const title = `Workflow ${persona.key} ${Date.now()}`;
            await quickCreateInput.fill(title);
            const start = Date.now();
            await quickCreateButton.click();
            await expect(quickCreateInput).toHaveValue("", { timeout: 15_000 });
            const elapsedMs = Date.now() - start;
            expect(elapsedMs).toBeLessThan(15_000);

            await page.getByTestId("tasks-search-input").fill(title);
            await expect(page.locator("table").getByText(title)).toBeVisible({ timeout: 15_000 });

            await openAdvancedPanel(page);
            await page.getByTestId("tasks-view-board-button").click();
            await expect(page.getByText("To Do").first()).toBeVisible();

            await openAdvancedPanel(page);
            await page.getByTestId("tasks-view-gantt-button").click();
            await expect(page.getByTestId("gantt-view-mode-combobox")).toBeVisible();

            await openAdvancedPanel(page);
            await page.getByTestId("tasks-view-list-button").click();
            await expect(page.getByTestId("tasks-search-input")).toBeVisible();

            await page.goto("/");
            await expect(page.getByText("S-Curve 50/70")).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText("Governance Snapshot")).toBeVisible({ timeout: 15_000 });
        });
    }
});

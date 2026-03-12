import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let SETTINGS_SESSION: AuthSession | null = null;
let createdProjectId: string | null = null;
let createdMemberUserId: string | null = null;

function authHeaders(session: AuthSession) {
    return { Authorization: `Bearer ${session.token}` };
}

async function cleanupArtifacts(request: APIRequestContext) {
    if (!SETTINGS_SESSION) return;

    if (createdProjectId) {
        await request.delete(`/api/projects/${createdProjectId}`, {
            headers: authHeaders(SETTINGS_SESSION),
        }).catch(() => undefined);
    }

    if (createdMemberUserId) {
        await request.delete(`/api/users/${createdMemberUserId}`, {
            headers: authHeaders(SETTINGS_SESSION),
        }).catch(() => undefined);
    }
}

async function selectComboboxFirstOption(page: Page, triggerTestId: string) {
    await page.getByTestId(triggerTestId).click();
    const option = page.locator("[cmdk-item]:visible").first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
}

test.skip(
    ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
    "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
);

test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(180_000);
    SETTINGS_SESSION = await getOrCreateAuthSession(request, "project settings relocation");
});

test.afterAll(async ({ request }) => {
    await cleanupArtifacts(request);
});

test.beforeEach(async ({ page }) => {
    if (!SETTINGS_SESSION) {
        throw new Error("Project settings relocation auth session is not initialized.");
    }
    await seedAuthState(page, SETTINGS_SESSION);
});

test("create project redirects to /projects/:id/settings", async ({ page }) => {
    const projectName = `E2E Settings Relocation ${Date.now()}`;

    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("projects-new-button").click();
    await page.getByTestId("projects-create-name-input").fill(projectName);
    await page.getByTestId("projects-create-description-input").fill("Route relocation test");
    await page.getByTestId("projects-create-submit-button").click();

    await expect(page).toHaveURL(/\/projects\/.+\/settings\?onboard=1/);
    await expect(page.getByTestId("project-settings-page")).toBeVisible({ timeout: 15_000 });

    const match = page.url().match(/\/projects\/([^/]+)\/settings/);
    expect(match?.[1]).toBeTruthy();
    createdProjectId = match?.[1] ?? null;
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
});

test("project settings supports members and resource rates CRUD", async ({ page, request }) => {
    test.skip(!createdProjectId, "No created project id from previous test.");
    if (!SETTINGS_SESSION || !createdProjectId) return;

    const suffix = Date.now();
    const email = `project.settings.member.${suffix}@example.com`;
    const password = `Pw!${suffix}Aa1`;
    const name = `Project Settings Member ${suffix}`;
    const registerRes = await request.post("/api/auth/register", {
        data: { email, password, name },
    });
    expect([200, 201].includes(registerRes.status())).toBeTruthy();
    const registerPayload = await registerRes.json();
    createdMemberUserId = registerPayload?.user?.id ?? registerPayload?.id ?? null;

    await page.goto(`/projects/${createdProjectId}/settings?tab=members`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-settings-members-section")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("project-settings-add-member-user-combobox").click();
    const searchInput = page.getByPlaceholder("Search users...").first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill(email);
    const userOption = page.locator(`[cmdk-item]:visible:has-text("${email}")`).first();
    await expect(userOption).toBeVisible({ timeout: 10_000 });
    await userOption.click();

    await selectComboboxFirstOption(page, "project-settings-add-member-access-role-combobox");
    await page.getByTestId("project-settings-add-member-submit").click();
    await expect(page.locator(`[data-testid="project-settings-member-row"]`, { hasText: email })).toBeVisible({ timeout: 15_000 });

    const removeButton = page
        .locator(`[data-testid="project-settings-member-row"]:has-text("${email}") [data-testid="project-settings-member-remove-button"]`)
        .first();
    await expect(removeButton).toBeVisible({ timeout: 10_000 });
    await removeButton.click();
    await expect(page.locator(`[data-testid="project-settings-member-row"]`, { hasText: email })).toHaveCount(0, { timeout: 15_000 });

    await page.getByTestId("project-settings-tab-resource-rates").click();
    await expect(page.getByTestId("project-settings-resource-rates-section")).toBeVisible({ timeout: 10_000 });
    await selectComboboxFirstOption(page, "project-settings-rate-role-combobox");
    await page.getByTestId("project-settings-rate-hourly-input").fill("123.45");
    await selectComboboxFirstOption(page, "project-settings-rate-currency-combobox");
    await page.getByTestId("project-settings-rate-save-button").click();

    await expect(page.locator('[data-testid="project-settings-rate-row"]:has-text("Override")').first()).toBeVisible({ timeout: 15_000 });
    const resetButtons = page.getByTestId("project-settings-rate-reset-button");
    if (await resetButtons.count()) {
        await resetButtons.first().click();
    }
});

test("project dashboard remains readable after setup flow", async ({ page }) => {
    test.skip(!createdProjectId, "No created project id from previous test.");
    if (!createdProjectId) return;

    await page.goto(`/projects/${createdProjectId}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("S-Curve Performance")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("project-dashboard-metric-combobox")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("project-dashboard-governance-value")).toBeVisible({ timeout: 15_000 });
});

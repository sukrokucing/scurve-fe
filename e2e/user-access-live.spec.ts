import { expect, test, type APIRequestContext } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let USER_ACCESS_SESSION: AuthSession | null = null;
let createdRoleId: string | null = null;

function authHeaders(session: AuthSession) {
    return { Authorization: `Bearer ${session.token}` };
}

async function revokeRoleIfStillAssigned(request: APIRequestContext) {
    if (!USER_ACCESS_SESSION || !createdRoleId) return;
    await request.delete(`/api/rbac/users/${USER_ACCESS_SESSION.user.id}/roles/${createdRoleId}`, {
        headers: authHeaders(USER_ACCESS_SESSION),
    }).catch(() => undefined);
}

async function cleanupRole(request: APIRequestContext) {
    if (!USER_ACCESS_SESSION || !createdRoleId) return;
    await request.delete(`/api/rbac/roles/${createdRoleId}`, {
        headers: authHeaders(USER_ACCESS_SESSION),
    }).catch(() => undefined);
    createdRoleId = null;
}

test.describe("user access live", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        USER_ACCESS_SESSION = await getOrCreateAuthSession(request, "user access live");
    });

    test.afterEach(async ({ request }) => {
        await revokeRoleIfStillAssigned(request);
        await cleanupRole(request);
    });

    test.beforeEach(async ({ page }) => {
        if (!USER_ACCESS_SESSION) {
            throw new Error("User access live auth session is not initialized.");
        }
        await seedAuthState(page, USER_ACCESS_SESSION);
    });

    test("live user access page supports assign and revoke flows", async ({ page, request }) => {
        test.setTimeout(120_000);
        if (!USER_ACCESS_SESSION) {
            throw new Error("User access live auth session is not initialized.");
        }

        const roleName = `playwright_live_user_access_${Date.now()}`;
        const roleCreateResponse = await request.post("/api/rbac/roles", {
            headers: authHeaders(USER_ACCESS_SESSION),
            data: {
                name: roleName,
                description: "Temporary role for user access live smoke coverage.",
            },
        });
        expect(roleCreateResponse.ok()).toBeTruthy();
        const createdRole = await roleCreateResponse.json() as { id?: string };
        createdRoleId = createdRole.id ?? null;
        expect(createdRoleId).toBeTruthy();

        await page.goto(`/settings/users/${USER_ACCESS_SESSION.user.id}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("user-access-page-roles-section")).toBeVisible({ timeout: 15_000 });

        await page.getByTestId("user-access-assign-role-button").click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByTestId("user-access-assign-role-dialog-overview")).toBeVisible();
        await expect(dialog.getByTestId("user-access-assign-role-preview")).toContainText("Choose a role above");

        await dialog.getByRole("combobox").click();
        await page.getByRole("option", { name: roleName }).click();
        await expect(dialog.getByTestId("user-access-assign-role-preview")).toContainText(roleName);
        await dialog.getByRole("button", { name: "Assign" }).click();
        await expect(page.getByText("Role assigned successfully")).toBeVisible({ timeout: 15_000 });

        const roleCard = page.getByTestId("user-access-role-card").filter({ hasText: roleName }).first();
        await expect(roleCard).toBeVisible({ timeout: 15_000 });

        await roleCard.getByTestId("user-access-role-revoke-button").click();
        await expect(page.getByTestId("user-access-revoke-role-summary")).toContainText("Effective access may shrink immediately");
        await page.getByTestId("user-access-revoke-role-confirm-button").click();
        await expect(page.getByText("Role revoked")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("user-access-role-card").filter({ hasText: roleName })).toHaveCount(0, { timeout: 15_000 });
    });
});

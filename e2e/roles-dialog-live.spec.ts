import { expect, test, type APIRequestContext } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

type PermissionRecord = {
    id: string;
    name: string;
};

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

let ROLES_DIALOG_SESSION: AuthSession | null = null;
let createdRoleId: string | null = null;

function authHeaders(session: AuthSession) {
    return { Authorization: `Bearer ${session.token}` };
}

async function cleanupRole(request: APIRequestContext) {
    if (!ROLES_DIALOG_SESSION || !createdRoleId) return;
    await request.delete(`/api/rbac/roles/${createdRoleId}`, {
        headers: authHeaders(ROLES_DIALOG_SESSION),
    }).catch(() => undefined);
    createdRoleId = null;
}

async function expandRoleRosterIfNeeded(page: import("@playwright/test").Page) {
    const tableCard = page.getByTestId("roles-page-table-card");
    const pageSizeCombobox = tableCard.getByRole("combobox").first();
    if (await pageSizeCombobox.count() === 0) return;

    await pageSizeCombobox.click();
    const allOption = page.getByRole("option", { name: "All" }).first();
    if (await allOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await allOption.click();
        return;
    }
    await page.keyboard.press("Escape").catch(() => undefined);
}

test.describe("roles dialog live", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        ROLES_DIALOG_SESSION = await getOrCreateAuthSession(request, "roles dialog live");
    });

    test.afterEach(async ({ request }) => {
        await cleanupRole(request);
    });

    test.beforeEach(async ({ page }) => {
        if (!ROLES_DIALOG_SESSION) {
            throw new Error("Roles dialog live auth session is not initialized.");
        }
        await seedAuthState(page, ROLES_DIALOG_SESSION);
    });

    test("live role details dialog supports open, assign, and revoke flows", async ({ page, request }) => {
        test.setTimeout(120_000);
        if (!ROLES_DIALOG_SESSION) {
            throw new Error("Roles dialog live auth session is not initialized.");
        }

        const roleName = `playwright_live_role_${Date.now()}`;
        const roleCreateResponse = await request.post("/api/rbac/roles", {
            headers: authHeaders(ROLES_DIALOG_SESSION),
            data: {
                name: roleName,
                description: "Temporary role for live dialog smoke coverage.",
            },
        });
        expect(roleCreateResponse.ok()).toBeTruthy();
        const createdRole = await roleCreateResponse.json() as { id?: string };
        createdRoleId = createdRole.id ?? null;
        expect(createdRoleId).toBeTruthy();

        const permissionsResponse = await request.get("/api/rbac/permissions", {
            headers: authHeaders(ROLES_DIALOG_SESSION),
        });
        expect(permissionsResponse.ok()).toBeTruthy();
        const permissions = await permissionsResponse.json() as PermissionRecord[];
        const firstPermission = permissions[0] ?? null;

        await page.goto("/settings/roles", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("roles-page-table-card")).toBeVisible({ timeout: 15_000 });
        await expandRoleRosterIfNeeded(page);

        const roleRow = page.getByRole("row").filter({ hasText: roleName }).first();
        await expect(roleRow).toBeVisible({ timeout: 15_000 });
        await roleRow.getByTestId("roles-row-name-button").click();

        const dialog = page.getByRole("dialog");
        await expect(dialog.getByTestId("roles-details-overview-card")).toBeVisible();
        await expect(dialog.getByTestId("roles-details-assign-card")).toBeVisible();
        await expect(dialog.getByTestId("roles-details-permissions-card")).toBeVisible();

        if (firstPermission) {
            await dialog.getByRole("combobox").click();
            await page.getByRole("option", { name: firstPermission.name }).click();
            await dialog.getByTestId("roles-details-assign-permission-button").click();
            await expect(page.getByText("Permission assigned")).toBeVisible({ timeout: 15_000 });

            const assignedRow = dialog.getByTestId("roles-details-permission-row").filter({ hasText: firstPermission.name }).first();
            await expect(assignedRow).toBeVisible({ timeout: 15_000 });

            await assignedRow.getByTestId("roles-details-permission-revoke-button").click();
            await expect(page.getByTestId("roles-details-revoke-summary")).toContainText("Removing this grant can immediately reduce");
            await page.getByTestId("roles-details-revoke-confirm-button").click();
            await expect(page.getByText("Permission removed")).toBeVisible({ timeout: 15_000 });
            await expect(dialog.getByTestId("roles-details-permission-row").filter({ hasText: firstPermission.name })).toHaveCount(0, { timeout: 15_000 });
        }

        await dialog.getByRole("button", { name: /close/i }).click();
        await expect(dialog).toHaveCount(0);
    });
});

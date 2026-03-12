import { expect, test, type APIRequestContext } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

let MOBILE_SESSION: AuthSession | null = null;
let mobileProjectId: string | null = null;
let mobileProjectName = "";

function authHeaders(session: AuthSession) {
    return { Authorization: `Bearer ${session.token}` };
}

async function createMobileProject(request: APIRequestContext, session: AuthSession) {
    const name = `E2E Mobile Actions ${Date.now()}`;
    const response = await request.post("/api/projects", {
        headers: authHeaders(session),
        data: {
            name,
            description: "Project for mobile row-action regression test",
        },
    });

    if (!response.ok()) {
        const body = await response.text();
        throw new Error(`Unable to create mobile test project. status=${response.status()} body=${body}`);
    }

    const payload = await response.json();
    const id = payload?.id as string | undefined;
    if (!id) {
        throw new Error("Mobile test project create response does not include id.");
    }

    return { id, name };
}

test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(180_000);
    MOBILE_SESSION = await getOrCreateAuthSession(request, "projects mobile actions");
    const created = await createMobileProject(request, MOBILE_SESSION);
    mobileProjectId = created.id;
    mobileProjectName = created.name;
});

test.afterAll(async ({ request }) => {
    if (!MOBILE_SESSION || !mobileProjectId) return;
    await request.delete(`/api/projects/${mobileProjectId}`, {
        headers: authHeaders(MOBILE_SESSION),
    }).catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
    if (!MOBILE_SESSION) {
        throw new Error("Mobile auth session is not initialized.");
    }
    await seedAuthState(page, MOBILE_SESSION);
    await page.setViewportSize({ width: 390, height: 844 });
});

test("projects row compact actions are usable on mobile", async ({ page }) => {
    test.skip(!mobileProjectName, "No mobile project name is available.");

    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("projects-search-input").fill(mobileProjectName);
    const row = page.locator(`tbody tr:has-text("${mobileProjectName}")`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const actionsToggle = row.getByTestId("projects-row-actions-toggle");
    await expect(actionsToggle).toBeVisible();
    await actionsToggle.click();

    const compactEditButton = page.getByTestId("projects-row-compact-edit-button").first();
    await expect(compactEditButton).toBeVisible();
    await compactEditButton.click();

    const editDialog = page.getByRole("dialog", { name: "Edit project" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("button", { name: "Close" }).click();
    await expect(editDialog).toBeHidden();

    await row.getByTestId("projects-row-actions-toggle").click();
    const compactDeleteButton = page.getByTestId("projects-row-compact-delete-button").first();
    await expect(compactDeleteButton).toBeVisible();
    await compactDeleteButton.click();

    const deleteDialog = page
        .locator('[role="dialog"], [role="alertdialog"]')
        .filter({ has: page.getByRole("heading", { name: "Delete project" }) })
        .first();
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog).toContainText(`Delete "${mobileProjectName}" permanently`);
    await expect(deleteDialog.getByTestId("projects-delete-confirm-button")).toContainText(`Delete "${mobileProjectName}"`);
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(deleteDialog).toBeHidden();

    const hasViewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasViewportOverflow).toBeFalsy();
});

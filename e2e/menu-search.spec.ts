import { expect, test, type Page } from "@playwright/test";

const SESSION = {
    token: "menu-search-token",
    user: {
        id: "menu-search-user",
        name: "Menu Search User",
        email: "menu-search@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

async function seedAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

async function installApiMocks(page: Page) {
    await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname } = url;
        const method = request.method();

        if (!pathname.startsWith("/api/")) {
            await route.continue();
            return;
        }

        const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
            route.fulfill({
                status,
                contentType: "application/json",
                headers,
                body: JSON.stringify(body),
            });

        if (pathname === "/api/auth/me" && method === "GET") {
            return json(SESSION.user);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/effective-permissions$/.test(pathname) && method === "GET") {
            return json({
                user_id: SESSION.user.id,
                roles: [{ id: "role-admin", name: "admin" }],
                permissions: SESSION.permissions,
            });
        }

        if (pathname === "/api/projects" && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/dependencies$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/critical-path$/.test(pathname) && method === "GET") {
            return json({ task_ids: [] });
        }

        if (pathname === "/api/users" && method === "GET") {
            return json([], 200, { "x-total-count": "0" });
        }

        if (pathname === "/api/rbac/roles" && method === "GET") {
            return json([]);
        }

        if (pathname === "/api/rbac/permissions" && method === "GET") {
            return json([]);
        }

        if (/^\/api\/rbac\/roles\/[^/]+\/permissions$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/roles$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (pathname === "/api/rbac/audit-logs" && method === "GET") {
            return json({ items: [], total: 0, page: 1, per_page: 10 });
        }

        return json({});
    });
}

test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    await installApiMocks(page);
});

test("desktop global search navigates by Enter and click", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

    const sidebar = page.locator("aside").first();
    await sidebar.hover();

    await expect(page.getByTestId("menu-search-input")).toHaveCount(0);

    const globalDialog = page.getByTestId("global-menu-search-dialog");
    const globalSearchInput = page.getByTestId("global-menu-search-input");

    await page.getByTestId("global-menu-search-trigger").click();
    await expect(globalDialog).toBeVisible();
    await globalSearchInput.fill("role");
    await globalSearchInput.press("Enter");
    await expect(page).toHaveURL(/\/settings\/roles$/);
    await expect(globalDialog).toBeHidden();

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await sidebar.hover();
    await page.getByTestId("global-menu-search-trigger").click();
    await expect(globalDialog).toBeVisible();
    await globalSearchInput.fill("s");
    const results = page.getByTestId("global-menu-search-result-item");
    await expect(results.nth(1)).toBeVisible();
    await results.nth(1).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(globalDialog).toBeHidden();

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await sidebar.hover();
    await page.getByTestId("global-menu-search-trigger").click();
    await expect(globalDialog).toBeVisible();
    await globalSearchInput.fill("zzzzzzzz");
    await globalSearchInput.press("Enter");
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(globalDialog).toBeVisible();
});

test("global menu search opens via shortcut and sidebar trigger", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press("Control+k");
    const globalDialog = page.getByTestId("global-menu-search-dialog");
    await expect(globalDialog).toBeVisible();

    const globalSearchInput = page.getByTestId("global-menu-search-input");
    await globalSearchInput.fill("policy");
    await globalSearchInput.press("Enter");
    await expect(page).toHaveURL(/\/settings\/policy$/);
    await expect(globalDialog).toBeHidden();

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await page.getByTestId("global-menu-search-trigger").click();
    await expect(globalDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(globalDialog).toBeHidden();
});

test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("bottom nav search opens full-screen sheet and navigates", async ({ page }) => {
        await page.goto("/tasks", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

        const mobileSearchTrigger = page.getByTestId("bottom-nav-search-trigger");
        await expect(mobileSearchTrigger).toBeVisible();

        await mobileSearchTrigger.click();
        await expect(page.getByTestId("mobile-menu-search-sheet")).toBeVisible();

        const mobileSearchInput = page.getByTestId("mobile-menu-search-input");
        await mobileSearchInput.fill("flow");
        await mobileSearchInput.press("Enter");
        await expect(page).toHaveURL(/\/settings\/flow$/);
        await expect(page.getByTestId("mobile-menu-search-sheet")).toBeHidden();

        await mobileSearchTrigger.click();
        await expect(page.getByTestId("mobile-menu-search-sheet")).toBeVisible();
        await mobileSearchInput.fill("project");
        const mobileResults = page.getByTestId("mobile-menu-search-result-item");
        await expect(mobileResults.first()).toBeVisible();
        await mobileResults.first().click();
        await expect(page).toHaveURL(/\/projects$/);
        await expect(page.getByTestId("mobile-menu-search-sheet")).toBeHidden();

        const hasHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(hasHorizontalOverflow).toBeFalsy();
    });
});

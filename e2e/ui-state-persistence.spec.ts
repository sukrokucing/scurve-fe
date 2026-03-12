import { expect, test } from "@playwright/test";
import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

let SESSION: AuthSession | null = null;

test.describe.configure({ mode: "serial" });
test.skip(({ browserName }) => browserName !== "chromium", "This persistence suite runs on chromium only.");

test.beforeAll(async ({ request }, testInfo) => {
    testInfo.setTimeout(180_000);
    SESSION = await getOrCreateAuthSession(request, "ui state persistence");
});

test.beforeEach(async ({ page }) => {
    if (!SESSION) {
        throw new Error("UI state session was not initialized.");
    }

    await seedAuthState(page, SESSION);
});

test("theme choice persists across reloads", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

    const themeToggle = page.getByRole("button", { name: "Toggle theme" });
    await expect(themeToggle).toBeVisible();

    // Default should be glass when no theme is present in storage.
    await expect.poll(async () => await page.evaluate(() => document.documentElement.classList.contains("theme-glass"))).toBeTruthy();

    // glass -> dark
    await themeToggle.click();
    await expect.poll(async () => await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBeTruthy();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBeTruthy();

    // dark -> light (no dark and no glass classes)
    await themeToggle.click();
    await expect.poll(async () => await page.evaluate(() => {
        const classes = document.documentElement.classList;
        return !classes.contains("dark") && !classes.contains("theme-glass");
    })).toBeTruthy();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => await page.evaluate(() => {
        const classes = document.documentElement.classList;
        return !classes.contains("dark") && !classes.contains("theme-glass");
    })).toBeTruthy();

    // light -> glass
    await themeToggle.click();
    await expect.poll(async () => await page.evaluate(() => document.documentElement.classList.contains("theme-glass"))).toBeTruthy();
});

test("sidebar pin state persists across reloads", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();

    // Unpinned default hides the pin toggle while collapsed; hover reveals it.
    await sidebar.hover();
    const pinToggle = page.getByTestId("sidebar-pin-toggle");
    await expect(pinToggle).toBeVisible();

    await pinToggle.click();
    await expect.poll(async () => await page.evaluate(() => window.localStorage.getItem("sidebar-pinned"))).toBe("true");
    await expect.poll(async () => await page.evaluate(() => {
        const box = document.querySelector("aside")?.getBoundingClientRect();
        return box?.width ?? 0;
    })).toBeGreaterThan(200);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => await page.evaluate(() => window.localStorage.getItem("sidebar-pinned"))).toBe("true");
    await expect.poll(async () => await page.evaluate(() => {
        const box = document.querySelector("aside")?.getBoundingClientRect();
        return box?.width ?? 0;
    })).toBeGreaterThan(200);

    await pinToggle.click();
    await expect.poll(async () => await page.evaluate(() => window.localStorage.getItem("sidebar-pinned"))).toBe("false");

    // Move pointer out so unpinned sidebar collapses.
    await page.mouse.move(1200, 120);
    await expect.poll(async () => await page.evaluate(() => {
        const box = document.querySelector("aside")?.getBoundingClientRect();
        return box?.width ?? 0;
    })).toBeLessThan(100);
});

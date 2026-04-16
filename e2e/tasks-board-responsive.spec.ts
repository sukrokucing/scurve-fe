import { expect, test, type Page } from "@playwright/test";

import { getOrCreateAuthSession, seedAuthState, type AuthSession } from "./support/auth-session";

type ProjectRecord = {
    id: string;
    name: string;
};

const AUTH_BROWSER_ALLOWLIST = (process.env.PLAYWRIGHT_AUTH_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

const BOARD_VIEWPORTS = [
    { name: "desktop wide", width: 1440, height: 900, compact: false },
    { name: "desktop threshold", width: 1199, height: 900, compact: true },
    { name: "tablet portrait", width: 820, height: 1180, compact: true },
    { name: "mobile portrait", width: 390, height: 844, compact: true },
] as const;

let TASKS_BOARD_SESSION: AuthSession | null = null;

async function getAccessibleProjects(session: AuthSession, page: Page) {
    const response = await page.request.get("/api/projects", {
        headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as ProjectRecord[];
}

async function openBoardView(page: Page) {
    await page.getByTestId("tasks-advanced-filters-toggle").click();
    const panel = page.getByTestId("tasks-advanced-filters-panel");
    const button = panel.getByTestId("tasks-view-board-button");
    await button.scrollIntoViewIfNeeded();
    await button.evaluate((element: HTMLElement) => element.click());
    await expect(page.getByText("Board view")).toBeVisible();
}

async function assertNoViewportOverflow(page: Page) {
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBeFalsy();
}

test.describe("tasks board responsive", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
        ({ browserName }) => !AUTH_BROWSER_ALLOWLIST.includes(browserName),
        "Auth-heavy e2e runs only on: " + AUTH_BROWSER_ALLOWLIST.join(", "),
    );

    test.beforeAll(async ({ request }, testInfo) => {
        testInfo.setTimeout(180_000);
        TASKS_BOARD_SESSION = await getOrCreateAuthSession(request, "tasks board responsive");
    });

    for (const viewport of BOARD_VIEWPORTS) {
        test(`board layout stays usable at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
            if (!TASKS_BOARD_SESSION) {
                throw new Error("Tasks board auth session is not initialized.");
            }

            await seedAuthState(page, TASKS_BOARD_SESSION);
            await page.setViewportSize({ width: viewport.width, height: viewport.height });

            const projects = await getAccessibleProjects(TASKS_BOARD_SESSION, page);
            const targetProject = projects.find((project) => project.name === "Demo Team Visibility Project") ?? projects[0];
            test.skip(!targetProject, "No accessible project is available for board validation.");

            await page.goto(`/tasks?project=${targetProject.id}`, { waitUntil: "domcontentloaded" });
            await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });

            await openBoardView(page);

            if (viewport.compact) {
                await expect(page.getByTestId("tasks-board-compact-layout")).toBeVisible();
                await expect(page.getByTestId("tasks-board-status-tabs")).toBeVisible();
                await expect(page.getByTestId("tasks-board-tab-todo")).toBeVisible();
                await expect(page.getByTestId("tasks-board-tab-in_progress")).toBeVisible();
                await expect(page.getByTestId("tasks-board-tab-blocked")).toBeVisible();
                await expect(page.getByTestId("tasks-board-tab-done")).toBeVisible();

                await page.getByTestId("tasks-board-tab-blocked").click();
                await expect(page.getByTestId("tasks-board-panel-blocked")).toBeVisible();
                await expect(page.getByTestId("tasks-board-compact-header-blocked")).toBeVisible();

                const compactOverflow = await page.evaluate(() => {
                    const root = document.querySelector("[data-testid='tasks-board-compact-layout']");
                    if (!root) return false;
                    return [...root.querySelectorAll("*")].some((element) => {
                        const node = element as HTMLElement;
                        const styles = getComputedStyle(node);
                        return (styles.overflowX === "auto" || styles.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 4;
                    });
                });
                expect(compactOverflow).toBeFalsy();
            } else {
                await expect(page.getByTestId("tasks-board-desktop-layout")).toBeVisible();
                await expect(page.getByTestId("tasks-board-column-header-todo")).toBeVisible();
                await expect(page.getByTestId("tasks-board-column-header-in_progress")).toBeVisible();
                await expect(page.getByTestId("tasks-board-column-header-blocked")).toBeVisible();
                await expect(page.getByTestId("tasks-board-column-header-done")).toBeVisible();

                const desktopOverflow = await page.evaluate(() => {
                    const root = document.querySelector("[data-testid='tasks-board-desktop-layout']");
                    if (!root) return true;
                    return [...root.querySelectorAll("*")].some((element) => {
                        const node = element as HTMLElement;
                        const styles = getComputedStyle(node);
                        return (styles.overflowX === "auto" || styles.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 4;
                    });
                });
                expect(desktopOverflow).toBeFalsy();
            }

            await assertNoViewportOverflow(page);
        });
    }
});

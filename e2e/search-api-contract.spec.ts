import { expect, test, type Page } from "@playwright/test";

const SESSION = {
    token: "search-contract-token",
    user: {
        id: "search-contract-user",
        name: "Search Contract User",
        email: "search-contract@example.com",
    },
    permissions: ["*"],
};

type SearchContractCapture = {
    taskQueries: URLSearchParams[];
    userQueries: URLSearchParams[];
};

async function seedAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

async function installSearchContractMocks(page: Page): Promise<SearchContractCapture> {
    const capture: SearchContractCapture = {
        taskQueries: [],
        userQueries: [],
    };

    await page.route("**/*", async (route) => {
        const request = route.request();
        const method = request.method();
        const url = new URL(request.url());
        const { pathname } = url;

        if (!pathname.startsWith("/api/")) {
            await route.continue();
            return;
        }

        const json = (
            body: unknown,
            status = 200,
            headers: Record<string, string> = {},
        ) =>
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
                permissions: [{ name: "*", source: "role" }],
            });
        }

        if (pathname === "/api/projects" && method === "GET") {
            return json([
                {
                    id: "project-search-contract",
                    user_id: SESSION.user.id,
                    name: "Search Contract Project",
                    description: "Project for FE query param contract checks",
                    theme_color: "#0ea5a4",
                    created_at: "2026-01-01T00:00:00Z",
                    updated_at: "2026-01-01T00:00:00Z",
                },
            ]);
        }

        if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname) && method === "GET") {
            capture.taskQueries.push(new URLSearchParams(url.searchParams));
            return json([], 200, { "x-total-count": "0" });
        }

        if (/^\/api\/projects\/[^/]+\/dependencies$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/assignees$/.test(pathname) && method === "GET") {
            return json([
                {
                    id: "assignee-1",
                    name: "Alex Analyst",
                    email: "alex.analyst@example.com",
                },
            ]);
        }

        if (pathname === "/api/users" && method === "GET") {
            capture.userQueries.push(new URLSearchParams(url.searchParams));
            return json([], 200, { "x-total-count": "0" });
        }

        if (pathname === "/api/telemetry/events" && method === "POST") {
            return route.fulfill({ status: 204, body: "" });
        }

        return json({});
    });

    return capture;
}

test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
});

test("tasks search/filter UI uses backend task query contract params", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tasks-search-input")).toBeVisible();

    await expect.poll(() => capture.taskQueries.length).toBeGreaterThan(0);

    await page.getByTestId("tasks-search-input").fill("Alpha task");
    await expect.poll(() => capture.taskQueries.at(-1)?.get("q")).toBe("Alpha task");

    await page.getByTestId("tasks-filter-status-combobox").click();
    await page.getByRole("option", { name: "Blocked" }).click();
    await expect.poll(() => capture.taskQueries.at(-1)?.get("status")).toBe("blocked");

    await page.getByTestId("tasks-advanced-filters-toggle").click();
    await expect(page.getByTestId("tasks-advanced-filters-panel")).toBeVisible();

    await page.getByTestId("tasks-filter-assignee-combobox").click();
    await page.getByRole("option", { name: /Alex Analyst/i }).click();

    await page.getByTestId("tasks-filter-start-from-input").fill("2026-01-01");
    await page.getByTestId("tasks-filter-start-to-input").fill("2026-01-31");
    await page.getByTestId("tasks-filter-due-from-input").fill("2026-02-01");
    await page.getByTestId("tasks-filter-due-to-input").fill("2026-02-28");

    await expect.poll(() => {
        const latest = capture.taskQueries.at(-1);
        if (!latest) return null;
        return {
            q: latest.get("q"),
            status: latest.get("status"),
            assignee_id: latest.get("assignee_id"),
            start_from: latest.get("start_from"),
            start_to: latest.get("start_to"),
            due_from: latest.get("due_from"),
            due_to: latest.get("due_to"),
            sort_by: latest.get("sort_by"),
            sort_dir: latest.get("sort_dir"),
            page: latest.get("page"),
            per_page: latest.get("per_page"),
            progress: latest.get("progress"),
            task_id: latest.get("task_id"),
        };
    }).toEqual({
        q: "Alpha task",
        status: "blocked",
        assignee_id: "assignee-1",
        start_from: "2026-01-01",
        start_to: "2026-01-31",
        due_from: "2026-02-01",
        due_to: "2026-02-28",
        sort_by: "updated_at",
        sort_dir: "desc",
        page: "1",
        per_page: "10",
        progress: null,
        task_id: null,
    });
});

test("users search UI uses `q` backend query param", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/settings/users", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("users-search-input")).toBeVisible();

    await expect.poll(() => capture.userQueries.length).toBeGreaterThan(0);

    await page.getByTestId("users-search-input").fill("ada");
    await expect.poll(() => capture.userQueries.at(-1)?.get("q")).toBe("ada");
});

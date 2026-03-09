import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

type PerfMetric = {
    name: string;
    durationMs: number;
    budgetMs: number;
    route: string;
    ok: boolean;
    recordedAt: string;
};

const PROJECT_ID = "perf-project-1";
const USER_ID = "perf-user-1";
const ARTIFACT_DIR = path.resolve(process.cwd(), "artifacts", "perf-probes");
const METRICS_PATH = path.join(ARTIFACT_DIR, "metrics.json");

const BUDGETS = {
    tasksLoadMs: Number(process.env.PERF_BUDGET_TASKS_LOAD_MS ?? 5000),
    tasksSearchMs: Number(process.env.PERF_BUDGET_TASKS_SEARCH_MS ?? 1800),
    ganttSwitchMs: Number(process.env.PERF_BUDGET_GANTT_SWITCH_MS ?? 2600),
    ganttTodayMs: Number(process.env.PERF_BUDGET_GANTT_TODAY_MS ?? 1800),
    policyLoadMs: Number(process.env.PERF_BUDGET_POLICY_LOAD_MS ?? 5000),
    policyFilterMs: Number(process.env.PERF_BUDGET_POLICY_FILTER_MS ?? 1800),
    flowLoadMs: Number(process.env.PERF_BUDGET_FLOW_LOAD_MS ?? 5000),
    flowSelectMs: Number(process.env.PERF_BUDGET_FLOW_SELECT_MS ?? 1800),
};

const metrics: PerfMetric[] = [];

function nowIso() {
    return new Date().toISOString();
}

function getProjectList() {
    return [
        {
            id: PROJECT_ID,
            user_id: USER_ID,
            name: "Perf Project",
            description: "Performance test project",
            theme_color: "#0ea5a4",
            created_at: nowIso(),
            updated_at: nowIso(),
        },
    ];
}

function getTaskList() {
    return Array.from({ length: 40 }).map((_, index) => {
        const start = new Date(2026, 0, 1 + index);
        const end = new Date(2026, 0, 3 + index);
        return {
            id: `perf-task-${index + 1}`,
            project_id: PROJECT_ID,
            title: `Perf Task ${index + 1}`,
            status: index % 4 === 0 ? "done" : "pending",
            progress: Math.min(100, index * 2),
            assignee: null,
            parent_id: null,
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            due_date: end.toISOString(),
            duration_days: 2,
            created_at: nowIso(),
            updated_at: nowIso(),
        };
    });
}

function getProgressList() {
    return getTaskList().map((task) => ({
        id: `progress-${task.id}`,
        project_id: task.project_id,
        task_id: task.id,
        progress: task.progress,
        note: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
    }));
}

function getRoles() {
    return Array.from({ length: 6 }).map((_, index) => ({
        id: `role-${index + 1}`,
        name: `role_${index + 1}`,
        description: `Role ${index + 1}`,
        created_at: nowIso(),
        updated_at: nowIso(),
    }));
}

function getPermissions() {
    const resources = ["project", "task", "role", "permission", "user"];
    const actions = ["view", "create", "update", "delete", "manage"];
    const list: Array<{ id: string; name: string; description: string; created_at: string; updated_at: string }> = [];
    let idCounter = 1;
    for (const resource of resources) {
        for (const action of actions) {
            list.push({
                id: `perm-${idCounter}`,
                name: `${resource}.${action}`,
                description: `${action} ${resource}`,
                created_at: nowIso(),
                updated_at: nowIso(),
            });
            idCounter += 1;
        }
    }
    return list;
}

function getRolePermissions(roleId: string) {
    const all = getPermissions();
    const roleNum = Number(roleId.split("-").pop() ?? "1");
    return all.filter((_, idx) => idx % (roleNum + 1) === 0);
}

function getUsers() {
    return Array.from({ length: 12 }).map((_, index) => ({
        id: `user-${index + 1}`,
        name: `Perf User ${index + 1}`,
        email: `perf-user-${index + 1}@example.com`,
        provider: "local",
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
    }));
}

async function measureProbe(
    name: string,
    route: string,
    budgetMs: number,
    action: () => Promise<void>,
) {
    const startedAt = Date.now();
    await action();
    const durationMs = Date.now() - startedAt;
    metrics.push({
        name,
        route,
        durationMs,
        budgetMs,
        ok: durationMs <= budgetMs,
        recordedAt: nowIso(),
    });
    expect(durationMs, `${name} exceeded budget ${budgetMs}ms`).toBeLessThanOrEqual(budgetMs);
}

async function ensureAuthenticated(page: Page) {
    const onLoginPage = await page
        .getByRole("heading", { name: "Welcome back" })
        .isVisible()
        .catch(() => false);

    if (!onLoginPage) return;

    await page.evaluate(() => {
        window.localStorage.setItem("token", "perf-token");
        window.localStorage.setItem("user", JSON.stringify({
            id: "perf-user-1",
            name: "Perf User",
            email: "perf-user@example.com",
        }));
    });
    await page.goto("/tasks");
}

async function openTasksAdvancedFilters(page: Page) {
    const panel = page.getByTestId("tasks-advanced-filters-panel");
    if (await panel.isVisible().catch(() => false)) return;

    await page.getByTestId("tasks-advanced-filters-toggle").click();
    await expect(panel).toBeVisible();
}

async function closeTasksAdvancedFilters(page: Page) {
    const panel = page.getByTestId("tasks-advanced-filters-panel");
    if (!(await panel.isVisible().catch(() => false))) return;

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
}

async function ensurePolicyPageReady(page: Page) {
    await expect(page).toHaveURL(/\/settings\/policy(?:\?|$)/, { timeout: 15000 });
    await expect(page.getByTestId("rbac-permission-search-input")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Access Policy/i })).toBeVisible({ timeout: 15000 });
}

test.describe("Runtime Perf Probes", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.setItem("token", "perf-token");
            window.localStorage.setItem("user", JSON.stringify({
                id: "perf-user-1",
                name: "Perf User",
                email: "perf-user@example.com",
            }));
            window.localStorage.setItem("permissions", JSON.stringify([
                { name: "*", source: "role" },
                { name: "project.view", source: "role" },
                { name: "task.view", source: "role" },
                { name: "role.manage", source: "role" },
                { name: "permission.manage", source: "role" },
                { name: "user.manage", source: "role" },
            ]));
        });

        await page.route("**/*", async (route) => {
            const request = route.request();
            const method = request.method();
            const url = new URL(request.url());
            const { pathname } = url;

            const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({
                status,
                contentType: "application/json",
                headers,
                body: JSON.stringify(body),
            });

            if (!pathname.startsWith("/api/")) {
                await route.continue();
                return;
            }

            if (pathname === "/api/auth/me" && method === "GET") {
                return json({
                    id: USER_ID,
                    name: "Perf User",
                    email: "perf-user@example.com",
                    provider: "local",
                    created_at: nowIso(),
                    updated_at: nowIso(),
                });
            }

            if (/^\/api\/rbac\/users\/[^/]+\/effective-permissions$/.test(pathname) && method === "GET") {
                return json({
                    user_id: USER_ID,
                    roles: ["perf_admin"],
                    permissions: [{ name: "*", source: "role" }],
                });
            }

            if (pathname === "/api/projects" && method === "GET") {
                return json(getProjectList());
            }

            if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname) && method === "GET") {
                return json(getTaskList());
            }

            if (/^\/api\/projects\/[^/]+\/progress$/.test(pathname) && method === "GET") {
                return json(getProgressList());
            }

            if (/^\/api\/projects\/[^/]+\/dependencies$/.test(pathname) && method === "GET") {
                return json([]);
            }

            if (/^\/api\/projects\/[^/]+\/critical-path$/.test(pathname) && method === "GET") {
                return json({ task_ids: [] });
            }

            if (pathname === "/api/rbac/roles" && method === "GET") {
                return json(getRoles());
            }

            if (pathname === "/api/rbac/permissions" && method === "GET") {
                return json(getPermissions());
            }

            if (/^\/api\/rbac\/roles\/[^/]+\/permissions$/.test(pathname) && method === "GET") {
                const roleId = pathname.split("/")[4];
                return json(getRolePermissions(roleId));
            }

            if (pathname === "/api/users" && method === "GET") {
                const users = getUsers();
                return json(users, 200, { "x-total-count": String(users.length) });
            }

            if (/^\/api\/rbac\/users\/[^/]+\/roles$/.test(pathname) && method === "GET") {
                return json(getRoles().slice(0, 2));
            }

            if (/^\/api\/rbac\/users\/[^/]+\/permissions$/.test(pathname) && method === "GET") {
                return json([]);
            }

            return json({});
        });
    });

    test("collects runtime probes for tasks, policy, and flow routes", async ({ page }) => {
        await measureProbe("tasks.route.load", "/tasks", BUDGETS.tasksLoadMs, async () => {
            await page.goto("/tasks");
            await ensureAuthenticated(page);
            await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
            await expect(page.getByTestId("tasks-search-input")).toBeVisible();
        });

        await measureProbe("tasks.search.filter", "/tasks", BUDGETS.tasksSearchMs, async () => {
            await page.getByTestId("tasks-search-input").fill("Perf Task 12");
            await expect(page.getByRole("cell", { name: "Perf Task 12", exact: true })).toBeVisible();
        });

        await measureProbe("tasks.gantt.switch", "/tasks", BUDGETS.ganttSwitchMs, async () => {
            await openTasksAdvancedFilters(page);
            await page.getByTestId("tasks-view-gantt-button").click();
            await expect(page.getByTestId("gantt-chart-scroll-container")).toBeVisible();
        });

        await measureProbe("tasks.gantt.today", "/tasks", BUDGETS.ganttTodayMs, async () => {
            await closeTasksAdvancedFilters(page);
            await page.getByTestId("gantt-today-button").click();
            await page.waitForTimeout(100);
        });

        await measureProbe("policy.route.load", "/settings/policy", BUDGETS.policyLoadMs, async () => {
            await page.goto("/settings/policy");
            await ensurePolicyPageReady(page);
        });

        await measureProbe("policy.search.filter", "/settings/policy", BUDGETS.policyFilterMs, async () => {
            await page.getByTestId("rbac-permission-search-input").fill("project.view");
            await page.waitForTimeout(120);
            await expect(page.getByText("project.view").first()).toBeVisible();
        });

        await measureProbe("flow.route.load", "/settings/flow", BUDGETS.flowLoadMs, async () => {
            await page.goto("/settings/flow");
            await expect(page.getByRole("heading", { name: "Access Flow Explorer" })).toBeVisible();
            await expect(page.getByTestId("access-flow-user-search-combobox")).toBeVisible();
        });

        await measureProbe("flow.user.select", "/settings/flow", BUDGETS.flowSelectMs, async () => {
            await page.getByTestId("access-flow-user-search-combobox").click();
            await expect(page.getByTestId("access-flow-user-item").first()).toBeVisible();
        });
    });

    test.afterAll(async () => {
        await fs.mkdir(ARTIFACT_DIR, { recursive: true });
        await fs.writeFile(METRICS_PATH, JSON.stringify({
            generatedAt: nowIso(),
            budgets: BUDGETS,
            metrics,
        }, null, 2));
    });
});

import { expect, test, type Page } from "@playwright/test";
import { addDays } from "date-fns";

const SESSION = {
    token: "gantt-today-button-token",
    user: {
        id: "gantt-today-user-id",
        name: "Gantt Today User",
        email: "gantt-today@example.com",
    },
    permissions: ["progress.view", "user.manage", "role.manage", "permission.manage"],
};

type MockTask = {
    id: string;
    project_id: string;
    title: string;
    status: "pending" | "in_progress" | "blocked" | "done";
    start_date: string;
    end_date: string;
    due_date: string;
    progress: number;
    created_at: string;
};

async function seedAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

async function installFutureTaskMocks(page: Page) {
    const project = {
        id: "project-today",
        name: "Today Button Project",
        description: "Project for today button behavior",
        theme_color: "#009f82",
    };

    const now = new Date();
    const futureStartA = addDays(now, 120);
    const futureEndA = addDays(now, 123);
    const futureStartB = addDays(now, 130);
    const futureEndB = addDays(now, 136);

    const tasks: MockTask[] = [
        {
            id: "future-task-a",
            project_id: project.id,
            title: "Future Task A",
            status: "pending",
            start_date: futureStartA.toISOString(),
            end_date: futureEndA.toISOString(),
            due_date: futureEndA.toISOString(),
            progress: 20,
            created_at: now.toISOString(),
        },
        {
            id: "future-task-b",
            project_id: project.id,
            title: "Future Task B",
            status: "pending",
            start_date: futureStartB.toISOString(),
            end_date: futureEndB.toISOString(),
            due_date: futureEndB.toISOString(),
            progress: 10,
            created_at: now.toISOString(),
        },
    ];

    await page.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname, searchParams } = url;
        const method = request.method();

        if (!pathname.startsWith("/api/")) {
            await route.continue();
            return;
        }

        const json = (body: unknown, status = 200) =>
            route.fulfill({
                status,
                contentType: "application/json",
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
            return json([project]);
        }

        if (pathname === `/api/projects/${project.id}/critical-path` && method === "GET") {
            return json({ task_ids: [] });
        }

        if (pathname === `/api/projects/${project.id}/tasks` && method === "GET") {
            if (searchParams.get("progress") === "true") {
                return json(
                    tasks.map((task) => ({
                        id: `progress-${task.id}`,
                        task_id: task.id,
                        progress: task.progress,
                    })),
                );
            }
            return json(tasks);
        }

        if (pathname === `/api/projects/${project.id}/dependencies` && method === "GET") {
            return json([]);
        }

        if (pathname === `/api/projects/${project.id}/tasks/batch` && method === "PUT") {
            return json({ ok: true });
        }

        const taskPathMatch = pathname.match(/^\/api\/projects\/project-today\/tasks\/([^/]+)$/);
        if (taskPathMatch && method === "PUT") {
            return json({ ok: true });
        }

        return json({});
    });
}

async function getChartScrollInfo(page: Page) {
    return await page.evaluate(() => {
        const container = document.querySelector('[data-testid="gantt-chart-scroll-container"]') as HTMLDivElement | null;
        if (!container) return { left: 0, max: 0 };
        return {
            left: container.scrollLeft,
            max: Math.max(0, container.scrollWidth - container.clientWidth),
        };
    });
}

test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    await installFutureTaskMocks(page);
});

test("today button recenters timeline even when tasks are far in the future", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await page.getByRole("button", { name: "Gantt" }).click();
    await expect(page.getByRole("heading", { name: "Gantt View" })).toBeVisible();

    for (let i = 0; i < 4; i += 1) {
        await page.getByTestId("gantt-scroll-right-button").click();
        await page.waitForTimeout(150);
    }

    const shifted = await getChartScrollInfo(page);
    expect(shifted.left).toBeGreaterThan(200);

    await page.getByTestId("gantt-today-button").click();
    await page.waitForTimeout(450);

    const afterToday = await getChartScrollInfo(page);
    expect(afterToday.left).toBeLessThan(shifted.left);
});

import { expect, test, type Page } from "@playwright/test";

const SESSION = {
    token: "gantt-modernization-token",
    user: {
        id: "gantt-user-id",
        name: "Gantt Modernization User",
        email: "gantt-modernization@example.com",
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

type MockDependency = {
    id: string;
    source_task_id: string;
    target_task_id: string;
    type_: "finish-to-start";
};

async function seedAuthState(page: Page) {
    await page.addInitScript((session) => {
        window.localStorage.setItem("token", session.token);
        window.localStorage.setItem("user", JSON.stringify(session.user));
        window.localStorage.setItem("permissions", JSON.stringify(session.permissions));
    }, SESSION);
}

async function installGanttApiMocks(page: Page) {
    const project = {
        id: "project-1",
        name: "E2E Project",
        description: "Mocked project for gantt modernization tests",
        theme_color: "#009f82",
    };

    const createdAt = "2026-02-20T00:00:00.000Z";
    const tasks: MockTask[] = [
        {
            id: "task-a",
            project_id: project.id,
            title: "Task A",
            status: "pending",
            start_date: "2026-02-24T00:00:00.000Z",
            end_date: "2026-02-28T00:00:00.000Z",
            due_date: "2026-02-28T00:00:00.000Z",
            progress: 35,
            created_at: createdAt,
        },
        {
            id: "task-b",
            project_id: project.id,
            title: "Task B",
            status: "pending",
            start_date: "2026-03-01T00:00:00.000Z",
            end_date: "2026-03-02T00:00:00.000Z",
            due_date: "2026-03-02T00:00:00.000Z",
            progress: 10,
            created_at: createdAt,
        },
        {
            id: "task-c",
            project_id: project.id,
            title: "Task C",
            status: "pending",
            start_date: "2026-03-02T00:00:00.000Z",
            end_date: "2026-03-08T00:00:00.000Z",
            due_date: "2026-03-08T00:00:00.000Z",
            progress: 0,
            created_at: createdAt,
        },
        {
            id: "task-d",
            project_id: project.id,
            title: "Task D With Very Long Predecessor Name For Overflow Coverage",
            status: "pending",
            start_date: "2026-03-04T00:00:00.000Z",
            end_date: "2026-03-10T00:00:00.000Z",
            due_date: "2026-03-10T00:00:00.000Z",
            progress: 0,
            created_at: createdAt,
        },
    ];

    let dependencyCounter = 100;
    let dependencies: MockDependency[] = [
        { id: "dep-1", source_task_id: "task-b", target_task_id: "task-a", type_: "finish-to-start" },
        { id: "dep-2", source_task_id: "task-b", target_task_id: "task-c", type_: "finish-to-start" },
        { id: "dep-3", source_task_id: "task-b", target_task_id: "task-d", type_: "finish-to-start" },
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

        if (pathname === `/api/projects/${project.id}/tasks/batch` && method === "PUT") {
            const payload = request.postDataJSON() as {
                tasks?: Array<{
                    id: string;
                    title?: string;
                    start_date?: string;
                    end_date?: string;
                    due_date?: string;
                    progress?: number;
                }>;
            };

            for (const update of payload.tasks ?? []) {
                const index = tasks.findIndex((task) => task.id === update.id);
                if (index === -1) continue;
                tasks[index] = {
                    ...tasks[index],
                    ...(update.title !== undefined ? { title: update.title } : {}),
                    ...(update.start_date !== undefined ? { start_date: update.start_date } : {}),
                    ...(update.end_date !== undefined ? { end_date: update.end_date } : {}),
                    ...(update.due_date !== undefined ? { due_date: update.due_date } : {}),
                    ...(update.progress !== undefined ? { progress: update.progress } : {}),
                };
            }

            return json({ ok: true });
        }

        const taskPathMatch = pathname.match(/^\/api\/projects\/project-1\/tasks\/([^/]+)$/);
        if (taskPathMatch && method === "PUT") {
            const taskId = taskPathMatch[1];
            const payload = request.postDataJSON() as {
                title?: string;
                start_date?: string;
                end_date?: string;
                due_date?: string | null;
                progress?: number;
                status?: "pending" | "in_progress" | "blocked" | "done";
            };

            const index = tasks.findIndex((task) => task.id === taskId);
            if (index === -1) {
                return json({ message: "Task not found" }, 404);
            }

            tasks[index] = {
                ...tasks[index],
                ...(payload.title !== undefined ? { title: payload.title } : {}),
                ...(payload.start_date !== undefined ? { start_date: payload.start_date } : {}),
                ...(payload.end_date !== undefined ? { end_date: payload.end_date } : {}),
                ...(payload.due_date !== undefined && payload.due_date !== null ? { due_date: payload.due_date } : {}),
                ...(payload.progress !== undefined ? { progress: payload.progress } : {}),
                ...(payload.status !== undefined ? { status: payload.status } : {}),
            };

            return json(tasks[index]);
        }

        if (pathname === `/api/projects/${project.id}/dependencies` && method === "GET") {
            return json(dependencies);
        }

        if (pathname === `/api/projects/${project.id}/dependencies` && method === "POST") {
            const payload = request.postDataJSON() as {
                source_task_id: string;
                target_task_id: string;
                type_?: "finish-to-start";
            };

            const created: MockDependency = {
                id: `dep-${dependencyCounter++}`,
                source_task_id: payload.source_task_id,
                target_task_id: payload.target_task_id,
                type_: payload.type_ ?? "finish-to-start",
            };
            dependencies = [...dependencies, created];
            return json(created, 201);
        }

        const dependencyPathMatch = pathname.match(/^\/api\/projects\/project-1\/dependencies\/([^/]+)$/);
        if (dependencyPathMatch && method === "DELETE") {
            const dependencyId = dependencyPathMatch[1];
            dependencies = dependencies.filter((dependency) => dependency.id !== dependencyId);
            return json({ ok: true });
        }

        return json({});
    });
}

async function selectGanttViewMode(page: Page, mode: "Day" | "Week" | "Month" | "Quarter" | "Year") {
    await page.getByTestId("gantt-view-mode-combobox").click();
    const search = page.getByPlaceholder("Search view...");
    await search.fill(mode);
    await search.press("Enter");
}

async function setChartScrollToEnd(page: Page) {
    return await page.evaluate(() => {
        const container = document.querySelector('[data-testid="gantt-chart-scroll-container"]') as HTMLDivElement | null;
        if (!container) return { max: 0, left: 0 };
        container.scrollLeft = container.scrollWidth;
        return {
            max: Math.max(0, container.scrollWidth - container.clientWidth),
            left: container.scrollLeft,
        };
    });
}

async function getChartScrollInfo(page: Page) {
    return await page.evaluate(() => {
        const container = document.querySelector('[data-testid="gantt-chart-scroll-container"]') as HTMLDivElement | null;
        if (!container) return { max: 0, left: 0 };
        return {
            max: Math.max(0, container.scrollWidth - container.clientWidth),
            left: container.scrollLeft,
        };
    });
}

async function getTaskBarGeometry(page: Page, taskId: string) {
    const locator = page.locator(`[data-testid="gantt-task-bar"][data-task-id="${taskId}"]`).first();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    const style = await locator.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        return {
            left: Number.parseFloat(htmlElement.style.left || "0"),
            width: Number.parseFloat(htmlElement.style.width || "0"),
        };
    });
    return {
        x: box!.x,
        y: box!.y,
        width: box!.width,
        height: box!.height,
        left: style.left,
        renderedWidth: style.width,
    };
}

async function dragTaskBar(page: Page, taskId: string, startRatio: number, deltaX: number) {
    const box = await getTaskBarGeometry(page, taskId);
    const startX = box.x + box.width * startRatio;
    const y = box.y + box.height / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
}

async function getTaskProgressPercent(page: Page, taskId: string) {
    const locator = page.locator(`[data-testid="gantt-task-progress-fill"][data-task-id="${taskId}"]`).first();
    await locator.scrollIntoViewIfNeeded();
    return await locator.evaluate((element) =>
        Number.parseFloat((element as HTMLElement).style.width || "0"),
    );
}

async function dragTaskProgressHandle(page: Page, taskId: string, deltaX: number) {
    const handle = page.locator(`[data-testid="gantt-task-progress-handle"][data-task-id="${taskId}"]`).first();
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();

    const startX = box!.x + (box!.width / 2);
    const y = box!.y + (box!.height / 2);

    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
}

async function getPredecessorMetrics(page: Page, taskName: string) {
    return await page.evaluate((name) => {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-testid="gantt-table-task-name-input"]'));
        const input = inputs.find((element) => element.value === name);
        if (!input) return null;

        const row = input.closest("tr");
        const predecessorCell = row?.children?.[4] as HTMLTableCellElement | undefined;
        const scroller = predecessorCell?.querySelector(".overflow-x-auto") as HTMLDivElement | null;
        if (!row || !predecessorCell || !scroller) return null;

        const badges = Array.from(scroller.querySelectorAll(".inline-flex"));
        const tops = badges.map((badge) => Math.round((badge as HTMLElement).getBoundingClientRect().top));
        const wraps = new Set(tops).size > 1;

        return {
            rowHeight: row.getBoundingClientRect().height,
            cellHeight: predecessorCell.getBoundingClientRect().height,
            wraps,
            hasHorizontalOverflow: scroller.scrollWidth > scroller.clientWidth,
        };
    }, taskName);
}

async function getDependencyArrowGeometry(page: Page, predecessorId: string, dependentId: string) {
    return await page.evaluate(({ predecessorId: preId, dependentId: depId }) => {
        const group = document.querySelector(
            `[data-testid="gantt-dependency-arrow"][data-predecessor-id="${preId}"][data-dependent-id="${depId}"]`,
        ) as SVGGElement | null;
        if (!group) return null;

        const linePath = group.querySelector("path");
        const d = linePath?.getAttribute("d") ?? "";
        const values = Array.from(d.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number.parseFloat(match[0]));

        if (values.length < 4) return null;

        return {
            startX: values[0],
            startY: values[1],
            endX: values[values.length - 2],
            endY: values[values.length - 1],
        };
    }, { predecessorId, dependentId });
}

test.beforeEach(async ({ page }) => {
    await seedAuthState(page);
    await installGanttApiMocks(page);
});

test("gantt modernization behaviors work end-to-end", async ({ page }) => {
    test.setTimeout(45_000);

    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await page.getByRole("button", { name: "Gantt" }).click();
    await expect(page.getByRole("heading", { name: "Gantt View" })).toBeVisible();

    await selectGanttViewMode(page, "Quarter");
    const hasQuarterLabels = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('[data-testid="gantt-chart-scroll-container"] .text-xs'));
        return labels.some((element) => /^Q[1-4]$/.test((element.textContent ?? "").trim()));
    });
    expect(hasQuarterLabels).toBeTruthy();

    await selectGanttViewMode(page, "Year");
    const hasYearLabels = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('[data-testid="gantt-chart-scroll-container"] .text-xs'));
        return labels.some((element) => /^20\d{2}$/.test((element.textContent ?? "").trim()));
    });
    expect(hasYearLabels).toBeTruthy();

    await selectGanttViewMode(page, "Day");
    await setChartScrollToEnd(page);
    await selectGanttViewMode(page, "Month");
    await page.waitForTimeout(300);
    const focusOnScroll = await getChartScrollInfo(page);
    if (focusOnScroll.max > 0) {
        expect(focusOnScroll.left / focusOnScroll.max).toBeLessThan(0.9);
    }

    await page.getByTestId("gantt-focus-toggle").click();
    await setChartScrollToEnd(page);
    await selectGanttViewMode(page, "Quarter");
    await page.waitForTimeout(300);
    const focusOffScroll = await getChartScrollInfo(page);
    if (focusOffScroll.max > 0) {
        expect(focusOffScroll.left / focusOffScroll.max).toBeGreaterThan(0.9);
    }

    // Non-day drag commit should follow the active timeline unit (week), not raw days.
    await selectGanttViewMode(page, "Week");
    const weekBeforeMove = await getTaskBarGeometry(page, "task-b");
    await dragTaskBar(page, "task-b", 0.5, 220);
    const weekAfterMove = await getTaskBarGeometry(page, "task-b");
    expect(weekAfterMove.left - weekBeforeMove.left).toBeGreaterThan(140);
    const weekPredecessorGeometry = await getTaskBarGeometry(page, "task-a");
    const weekArrow = await getDependencyArrowGeometry(page, "task-a", "task-b");
    expect(weekArrow).not.toBeNull();
    expect(Math.abs(weekArrow!.startX - (weekPredecessorGeometry.left + weekPredecessorGeometry.renderedWidth))).toBeLessThan(3);
    expect(Math.abs(weekArrow!.endX - weekAfterMove.left)).toBeLessThan(3);

    await selectGanttViewMode(page, "Day");
    const originalGeometry = await getTaskBarGeometry(page, "task-b");
    const predecessorGeometry = await getTaskBarGeometry(page, "task-a");
    const dependencyArrow = await getDependencyArrowGeometry(page, "task-a", "task-b");
    expect(dependencyArrow).not.toBeNull();
    expect(Math.abs(dependencyArrow!.startX - (predecessorGeometry.left + predecessorGeometry.renderedWidth))).toBeLessThan(3);
    expect(Math.abs(dependencyArrow!.endX - originalGeometry.left)).toBeLessThan(3);

    const taskBBar = page.locator('[data-testid="gantt-task-bar"][data-task-id="task-b"]').first();
    await taskBBar.click();
    const leftResizeHandle = page.locator('[data-testid="gantt-task-resize-left"][data-task-id="task-b"]').first();
    await expect(leftResizeHandle).toBeVisible();
    const progressHandle = page.locator('[data-testid="gantt-task-progress-handle"][data-task-id="task-b"]').first();
    await expect(progressHandle).toBeVisible();

    const progressBefore = await getTaskProgressPercent(page, "task-b");
    await dragTaskProgressHandle(page, "task-b", 80);
    const progressAfter = await getTaskProgressPercent(page, "task-b");
    expect(progressAfter).toBeGreaterThan(progressBefore);

    await page.getByTestId("gantt-progress-edit-toggle").click();
    await expect(page.locator('[data-testid="gantt-task-progress-handle"][data-task-id="task-b"]')).toHaveCount(0);
    await page.getByTestId("gantt-progress-edit-toggle").click();
    await taskBBar.click();
    await expect(page.locator('[data-testid="gantt-task-progress-handle"][data-task-id="task-b"]').first()).toBeVisible();

    await page.getByTestId("gantt-progress-visibility-toggle").click();
    await expect(page.locator('[data-testid="gantt-task-progress-fill"][data-task-id="task-b"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="gantt-task-progress-handle"][data-task-id="task-b"]')).toHaveCount(0);
    await expect(page.getByTestId("gantt-progress-edit-toggle")).toBeDisabled();
    await page.getByTestId("gantt-progress-visibility-toggle").click();
    await expect(page.getByTestId("gantt-progress-edit-toggle")).toBeEnabled();
    await taskBBar.click();
    await expect(page.locator('[data-testid="gantt-task-progress-handle"][data-task-id="task-b"]').first()).toBeVisible();

    await page.getByTestId("gantt-edit-mode-toggle").click();
    await dragTaskBar(page, "task-b", 0.5, 140);
    const editOffGeometry = await getTaskBarGeometry(page, "task-b");
    expect(Math.abs(editOffGeometry.left - originalGeometry.left)).toBeLessThan(2);
    expect(Math.abs(editOffGeometry.renderedWidth - originalGeometry.renderedWidth)).toBeLessThan(2);

    await page.getByTestId("gantt-edit-mode-toggle").click();
    await page.getByTestId("gantt-resize-toggle").click();
    const beforeMoveOnly = await getTaskBarGeometry(page, "task-b");
    await dragTaskBar(page, "task-b", 0.5, 120);
    const afterMoveOnly = await getTaskBarGeometry(page, "task-b");
    expect(afterMoveOnly.left - beforeMoveOnly.left).toBeGreaterThan(5);

    await page.getByTestId("gantt-move-toggle").click();
    await page.getByTestId("gantt-resize-toggle").click();
    const beforeResizeOnly = await getTaskBarGeometry(page, "task-b");
    await dragTaskBar(page, "task-b", 0.5, 120);
    const afterCenterDrag = await getTaskBarGeometry(page, "task-b");
    expect(Math.abs(afterCenterDrag.left - beforeResizeOnly.left)).toBeLessThan(2);
    const resizeHandleCount = await page
        .locator('[data-testid^="gantt-task-resize-"][data-task-id="task-b"]')
        .count();
    expect(resizeHandleCount).toBeGreaterThanOrEqual(2);

    await page.getByTestId("gantt-move-toggle").click();

    const addForTaskA = page.getByRole("button", { name: "Add predecessor to Task A" });
    await addForTaskA.click();
    const suggestionList = page.getByRole("listbox", { name: "Suggestions" });
    await expect(suggestionList).toBeVisible();
    await expect(suggestionList.getByRole("option", { name: /^Task B$/ })).toHaveCount(0);
    await expect(suggestionList.getByRole("option", { name: /^Task C$/ })).toBeVisible();
    await suggestionList.getByRole("option", { name: /^Task C$/ }).click();
    const taskARow = page.getByRole("row", { name: /1 Task A/ });
    const removeTaskC = taskARow.getByRole("button", { name: "Remove predecessor Task C" });
    await expect(removeTaskC).toBeVisible();
    await removeTaskC.click();
    await expect(removeTaskC).toHaveCount(0);

    for (let i = 0; i < 3; i += 1) {
        const metrics = await getPredecessorMetrics(page, "Task B");
        expect(metrics).not.toBeNull();
        expect(metrics!.rowHeight).toBeLessThanOrEqual(50.5);
        expect(metrics!.cellHeight).toBeLessThanOrEqual(50.5);
        expect(metrics!.wraps).toBeFalsy();
        await page.getByRole("button", { name: /Toggle theme/i }).click();
        await page.waitForTimeout(120);
    }
});

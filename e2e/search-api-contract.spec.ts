import { expect, test, type Page } from "@playwright/test";
import {
    API_SEARCH_QUERY_MAX_LENGTH,
    normalizeApiFilterValue,
    normalizeApiSearchQuery,
    normalizeDateOnlyToApiDateTime,
} from "../src/lib/apiSearch";

test.describe.configure({ mode: "serial" });
test.skip(({ browserName }) => browserName !== "chromium", "Mocked API contract checks run on chromium only.");

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
    auditLogQueries: URLSearchParams[];
    roleCreates: Array<{ name: string; description?: string }>;
    roleDeletes: string[];
    rolePermissionAssignments: Array<{
        roleId: string;
        body: { permission_id: string };
    }>;
    rolePermissionRevokes: Array<{
        roleId: string;
        permissionId: string;
    }>;
    userRoleAssignments: Array<{
        userId: string;
        body: { role_id: string };
    }>;
    userRoleRevokes: Array<{
        userId: string;
        roleId: string;
    }>;
    workLogCreates: Array<{
        projectId: string;
        taskId: string;
        body: {
            hours: number;
            resource_role_id: string;
            work_date?: string | null;
            note?: string | null;
        };
    }>;
    workLogUpdates: Array<{
        projectId: string;
        taskId: string;
        workLogId: string;
        body: {
            hours?: number | null;
            resource_role_id?: string | null;
            work_date?: string | null;
            note?: string | null;
        };
    }>;
    workLogDeletes: Array<{
        projectId: string;
        taskId: string;
        workLogId: string;
    }>;
    projectMemberCreates: Array<{
        projectId: string;
        body: { user_id: string; access_role_id: string; resource_role_ids: string[] };
    }>;
    projectRateUpserts: Array<{
        projectId: string;
        resourceRoleId: string;
        body: { hourly_rate: number; currency: string };
    }>;
    projectRateDeletes: Array<{
        projectId: string;
        resourceRoleId: string;
    }>;
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
        auditLogQueries: [],
        roleCreates: [],
        roleDeletes: [],
        rolePermissionAssignments: [],
        rolePermissionRevokes: [],
        userRoleAssignments: [],
        userRoleRevokes: [],
        workLogCreates: [],
        workLogUpdates: [],
        workLogDeletes: [],
        projectMemberCreates: [],
        projectRateUpserts: [],
        projectRateDeletes: [],
    };

    const allUsers = [
        {
            id: "user-1",
            name: "Alex Analyst",
            email: "alex.analyst@example.com",
            provider: "local",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "user-2",
            name: "Jamie Builder",
            email: "jamie.builder@example.com",
            provider: "local",
            created_at: "2026-01-02T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
        },
        {
            id: "user-3",
            name: "Morgan Planner",
            email: "morgan.planner@example.com",
            provider: "local",
            created_at: "2026-01-03T00:00:00Z",
            updated_at: "2026-01-03T00:00:00Z",
        },
        {
            id: "user-4",
            name: "Taylor Architect",
            email: "taylor.architect@example.com",
            provider: "local",
            created_at: "2026-01-04T00:00:00Z",
            updated_at: "2026-01-04T00:00:00Z",
        },
        {
            id: "user-5",
            name: "Jordan Developer",
            email: "jordan.developer@example.com",
            provider: "local",
            created_at: "2026-01-05T00:00:00Z",
            updated_at: "2026-01-05T00:00:00Z",
        },
        {
            id: "user-6",
            name: "Casey Reviewer",
            email: "casey.reviewer@example.com",
            provider: "local",
            created_at: "2026-01-06T00:00:00Z",
            updated_at: "2026-01-06T00:00:00Z",
        },
        {
            id: "user-7",
            name: "Riley Tester",
            email: "riley.tester@example.com",
            provider: "local",
            created_at: "2026-01-07T00:00:00Z",
            updated_at: "2026-01-07T00:00:00Z",
        },
        {
            id: "user-8",
            name: "Sky Support",
            email: "sky.support@example.com",
            provider: "local",
            created_at: "2026-01-08T00:00:00Z",
            updated_at: "2026-01-08T00:00:00Z",
        },
        {
            id: "user-9",
            name: "Blake Operator",
            email: "blake.operator@example.com",
            provider: "local",
            created_at: "2026-01-09T00:00:00Z",
            updated_at: "2026-01-09T00:00:00Z",
        },
    ];
    const accessRoles = [
        {
            id: "role-admin",
            name: "project_admin",
            description: "Project admins",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-analyst",
            name: "system_analyst",
            description: "System analysts",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-project-owner",
            name: "project_owner",
            description: "Project owners",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-project-manager",
            name: "project_manager",
            description: "Project managers",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-backend",
            name: "backend_developer",
            description: "Backend developers",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-frontend",
            name: "frontend_developer",
            description: "Frontend developers",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-fullstack",
            name: "fullstack_developer",
            description: "Fullstack developers",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-data-analyst",
            name: "data_analyst",
            description: "Data analysts",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-member",
            name: "member",
            description: "Workspace members",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "role-viewer",
            name: "viewer",
            description: "Read-only viewers",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
    ];
    let rolesState = [...accessRoles];
    const permissionsCatalog = [
        {
            id: "perm-project-view",
            name: "project.view",
            description: "View projects",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-project-update",
            name: "project.update",
            description: "Update projects",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-task-view",
            name: "task.view",
            description: "View tasks",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-task-update",
            name: "task.update",
            description: "Update tasks",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-member-create",
            name: "member.create",
            description: "Add project members",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-member-delete",
            name: "member.delete",
            description: "Remove project members",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-resource-role-manage",
            name: "resource_role.manage",
            description: "Manage project resource roles",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-work-log-create",
            name: "work_log.create",
            description: "Create work logs",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-work-log-update",
            name: "work_log.update",
            description: "Update work logs",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-dashboard-view",
            name: "dashboard.view",
            description: "View dashboards",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-permission-manage",
            name: "permission.manage",
            description: "Manage permissions",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "perm-role-view",
            name: "role.view",
            description: "View roles",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
    ];
    let rolePermissionsById: Record<string, typeof permissionsCatalog> = {
        "role-admin": [
            permissionsCatalog[0],
            permissionsCatalog[1],
            permissionsCatalog[2],
            permissionsCatalog[3],
            permissionsCatalog[4],
            permissionsCatalog[5],
            permissionsCatalog[6],
            permissionsCatalog[7],
            permissionsCatalog[8],
            permissionsCatalog[9],
            permissionsCatalog[10],
            permissionsCatalog[11],
        ],
        "role-analyst": [permissionsCatalog[2]],
        "role-project-owner": [permissionsCatalog[0], permissionsCatalog[1], permissionsCatalog[2], permissionsCatalog[9]],
        "role-project-manager": [permissionsCatalog[0], permissionsCatalog[1], permissionsCatalog[2], permissionsCatalog[3], permissionsCatalog[9]],
        "role-backend": [permissionsCatalog[2], permissionsCatalog[3], permissionsCatalog[7], permissionsCatalog[8]],
        "role-frontend": [permissionsCatalog[2], permissionsCatalog[3]],
        "role-fullstack": [permissionsCatalog[0], permissionsCatalog[2], permissionsCatalog[3], permissionsCatalog[7], permissionsCatalog[8]],
        "role-data-analyst": [permissionsCatalog[0], permissionsCatalog[9]],
        "role-member": [permissionsCatalog[2], permissionsCatalog[7]],
        "role-viewer": [],
    };
    let userRolesByUserId: Record<string, typeof accessRoles> = {
        "user-1": [accessRoles[0]],
        "user-2": [accessRoles[1]],
    };
    const allResourceRoles = [
        {
            id: "rr-backend",
            name: "Backend Developer",
            description: "Backend engineering",
            currency: "USD",
            default_hourly_rate: 70,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "rr-frontend",
            name: "Frontend Developer",
            description: "Frontend engineering",
            currency: "USD",
            default_hourly_rate: 80,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
        {
            id: "rr-analyst",
            name: "Data Analyst",
            description: "Data analysis",
            currency: "USD",
            default_hourly_rate: 65,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        },
    ];
    let projectMembers = [
        {
            access_role_id: "role-admin",
            access_role_name: "project_admin",
            created_at: "2026-01-04T00:00:00Z",
            updated_at: "2026-01-04T00:00:00Z",
            user_email: SESSION.user.email,
            user_id: SESSION.user.id,
            user_name: SESSION.user.name,
            resource_roles: [{ id: "rr-backend", name: "Backend Developer" }],
        },
        {
            access_role_id: "role-admin",
            access_role_name: "project_admin",
            created_at: "2026-01-05T00:00:00Z",
            updated_at: "2026-01-05T00:00:00Z",
            user_email: "alex.analyst@example.com",
            user_id: "user-1",
            user_name: "Alex Analyst",
            resource_roles: [{ id: "rr-backend", name: "Backend Developer" }],
        },
    ];
    let projectResourceRoleRates = [
        {
            resource_role_id: "rr-backend",
            resource_role_name: "Backend Developer",
            hourly_rate: 70,
            currency: "USD",
            is_override: false,
        },
        {
            resource_role_id: "rr-frontend",
            resource_role_name: "Frontend Developer",
            hourly_rate: 85,
            currency: "USD",
            is_override: true,
        },
    ];
    const mockTaskId = "task-search-contract";
    const mockTaskTitle = "Alpha%_ task contract";
    const taskItems = [
        {
            id: mockTaskId,
            title: mockTaskTitle,
            description: "Contract-backed task for query and work-log coverage",
            status: "blocked",
            project_id: "project-search-contract",
            assignee: "user-1",
            start_date: "2026-02-01T00:00:00Z",
            end_date: "2026-02-05T00:00:00Z",
            due_date: "2026-02-05T00:00:00Z",
            duration_days: 4,
            parent_id: null,
            progress: 35,
            execution_status: "in_progress",
            actual_progress_pct: 35,
            expected_progress_pct: 55,
            variance_pct: -20,
            health_status: "critical",
            progress_method: "manual_percent_legacy",
            task_weight: 1,
            completed_at: null,
            completed_at_is_backfilled: false,
            schedule_status: "overdue",
            created_at: "2026-02-01T00:00:00Z",
        },
    ];
    const buildWorkLogRecord = (
        workLogId: string,
        taskId: string,
        payload: {
            hours: number;
            resource_role_id: string;
            work_date?: string | null;
            note?: string | null;
        },
    ) => {
        const rate = projectResourceRoleRates.find((role) => role.resource_role_id === payload.resource_role_id)
            ?? allResourceRoles.find((role) => role.id === payload.resource_role_id)
            ?? {
                resource_role_id: payload.resource_role_id,
                resource_role_name: payload.resource_role_id,
                hourly_rate: 0,
                currency: "USD",
                is_override: false,
            };
        return {
            id: workLogId,
            project_id: "project-search-contract",
            task_id: taskId,
            user_id: SESSION.user.id,
            user_name: SESSION.user.name,
            resource_role_id: payload.resource_role_id,
            resource_role_name: "resource_role_name" in rate ? rate.resource_role_name : rate.name,
            hours: payload.hours,
            hourly_rate_snapshot: rate.hourly_rate ?? rate.default_hourly_rate ?? 0,
            currency_snapshot: rate.currency ?? "USD",
            cost_amount: payload.hours * (rate.hourly_rate ?? rate.default_hourly_rate ?? 0),
            note: payload.note ?? null,
            source: "manual" as const,
            work_date: payload.work_date ?? "2026-03-10",
            created_at: "2026-03-17T00:00:00Z",
            updated_at: "2026-03-17T00:00:00Z",
            deleted_at: null,
        };
    };
    let workLogsByTaskId: Record<string, ReturnType<typeof buildWorkLogRecord>[]> = {
        [mockTaskId]: [
            buildWorkLogRecord("work-log-1", mockTaskId, {
                hours: 2.5,
                resource_role_id: "rr-backend",
                work_date: "2026-03-10",
                note: "Initial analysis",
            }),
        ],
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
            const userId = pathname.split("/").at(-2) ?? "";
            const roles = userRolesByUserId[userId] ?? [];
            const permissions = roles.flatMap((role) =>
                (rolePermissionsById[role.id] ?? []).map((permission) => ({
                    name: permission.name,
                    source: "role" as const,
                    role_name: role.name,
                    scope: null,
                }))
            );
            return json({
                user_id: userId,
                roles,
                permissions,
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

        if (/^\/api\/projects\/[^/]+$/.test(pathname) && method === "GET") {
            return json({
                id: "project-search-contract",
                user_id: SESSION.user.id,
                name: "Search Contract Project",
                description: "Project for FE query param contract checks",
                theme_color: "#0ea5a4",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            });
        }

        if (pathname === "/api/users/me/projects" && method === "GET") {
            return json([
                {
                    project_id: "project-search-contract",
                    project_name: "Search Contract Project",
                    access_role_id: "role-admin",
                    access_role_name: "project_admin",
                    permissions: [
                        "project.manage",
                        "project.update",
                        "member.create",
                        "member.delete",
                        "resource_role.manage",
                    ],
                    resource_roles: [{ id: "rr-backend", name: "Backend Developer" }],
                },
            ]);
        }

        if (pathname === "/api/portfolio/s-curve/summary" && method === "GET") {
            return json({
                metric: "progress",
                data_status: "ok",
                projects: [
                    {
                        project_id: "project-search-contract",
                        project_name: "Search Contract Project",
                        actual_pct: 42,
                        planned_pct: 45,
                        variance_pct: -3,
                        stage: "log",
                        metric_supported: true,
                        data_status: "ok",
                        rule_50_70_pass: true,
                        rule_50_70_status: "pass",
                    },
                ],
            });
        }

        if (/^\/api\/projects\/[^/]+\/tasks$/.test(pathname) && method === "GET") {
            capture.taskQueries.push(new URLSearchParams(url.searchParams));
            const query = normalizeApiSearchQuery(url.searchParams.get("q"))?.toLowerCase();
            const status = normalizeApiFilterValue(url.searchParams.get("status"));
            const healthStatus = normalizeApiFilterValue(url.searchParams.get("health_status"));
            const scheduleStatus = normalizeApiFilterValue(url.searchParams.get("schedule_status"));
            const assigneeId = normalizeApiFilterValue(url.searchParams.get("assignee_id"));
            const filteredTasks = taskItems.filter((task) => {
                if (query && !`${task.title} ${task.description ?? ""}`.toLowerCase().includes(query.toLowerCase())) {
                    return false;
                }
                if (status && task.status !== status) return false;
                if (healthStatus && task.health_status !== healthStatus) return false;
                if (scheduleStatus && task.schedule_status !== scheduleStatus) return false;
                if (assigneeId && task.assignee !== assigneeId) return false;
                return true;
            });
            return json(filteredTasks, 200, { "x-total-count": String(filteredTasks.length) });
        }

        if (/^\/api\/projects\/[^/]+\/dependencies$/.test(pathname) && method === "GET") {
            return json([]);
        }

        if (/^\/api\/projects\/[^/]+\/assignees$/.test(pathname) && method === "GET") {
            return json([
                {
                    id: "user-1",
                    name: "Alex Analyst",
                    email: "alex.analyst@example.com",
                },
            ]);
        }

        if (pathname === "/api/users" && method === "GET") {
            capture.userQueries.push(new URLSearchParams(url.searchParams));
            const query = normalizeApiSearchQuery(url.searchParams.get("q"))?.toLowerCase();
            const filteredUsers = query
                ? allUsers.filter((user) =>
                    `${user.name} ${user.email}`.toLowerCase().includes(query),
                )
                : allUsers;
            return json(filteredUsers, 200, { "x-total-count": String(filteredUsers.length) });
        }

        if (pathname === "/api/rbac/roles" && method === "GET") {
            return json(rolesState);
        }

        if (pathname === "/api/rbac/roles" && method === "POST") {
            const body = request.postDataJSON() as { name: string; description?: string };
            capture.roleCreates.push(body);
            const createdRole = {
                id: `role-${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
                name: body.name,
                description: body.description ?? "",
                created_at: "2026-03-17T00:00:00Z",
                updated_at: "2026-03-17T00:00:00Z",
            };
            rolesState = [...rolesState, createdRole];
            rolePermissionsById = {
                ...rolePermissionsById,
                [createdRole.id]: [],
            };
            return json(createdRole, 201);
        }

        if (/^\/api\/rbac\/roles\/[^/]+$/.test(pathname) && method === "DELETE") {
            const roleId = pathname.split("/").at(-1) ?? "";
            capture.roleDeletes.push(roleId);
            rolesState = rolesState.filter((role) => role.id !== roleId);
            delete rolePermissionsById[roleId];
            return route.fulfill({ status: 204, body: "" });
        }

        if (pathname === "/api/rbac/permissions" && method === "GET") {
            return json(permissionsCatalog);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/roles$/.test(pathname) && method === "GET") {
            const userId = pathname.split("/").at(-2) ?? "";
            return json(userRolesByUserId[userId] ?? []);
        }

        if (/^\/api\/rbac\/users\/[^/]+\/roles$/.test(pathname) && method === "POST") {
            const userId = pathname.split("/").at(-2) ?? "";
            const body = request.postDataJSON() as { role_id: string };
            capture.userRoleAssignments.push({ userId, body });
            const role = rolesState.find((item) => item.id === body.role_id);
            if (role) {
                const previousRoles = userRolesByUserId[userId] ?? [];
                if (!previousRoles.some((item) => item.id === role.id)) {
                    userRolesByUserId = {
                        ...userRolesByUserId,
                        [userId]: [...previousRoles, role],
                    };
                }
            }
            return route.fulfill({ status: 204, body: "" });
        }

        if (/^\/api\/rbac\/users\/[^/]+\/roles\/[^/]+$/.test(pathname) && method === "DELETE") {
            const parts = pathname.split("/");
            const userId = parts.at(-3) ?? "";
            const roleId = parts.at(-1) ?? "";
            capture.userRoleRevokes.push({ userId, roleId });
            userRolesByUserId = {
                ...userRolesByUserId,
                [userId]: (userRolesByUserId[userId] ?? []).filter((role) => role.id !== roleId),
            };
            return route.fulfill({ status: 204, body: "" });
        }

        if (/^\/api\/projects\/[^/]+\/members$/.test(pathname) && method === "GET") {
            return json(projectMembers);
        }

        if (/^\/api\/projects\/[^/]+\/members$/.test(pathname) && method === "POST") {
            const projectId = pathname.split("/")[3];
            const body = request.postDataJSON() as {
                user_id: string;
                access_role_id: string;
                resource_role_ids: string[];
            };
            capture.projectMemberCreates.push({ projectId, body });
            const user = allUsers.find((item) => item.id === body.user_id);
            const role = accessRoles.find((item) => item.id === body.access_role_id);
            const resourceRoles = body.resource_role_ids
                .map((resourceRoleId) => allResourceRoles.find((item) => item.id === resourceRoleId))
                .filter(Boolean)
                .map((roleItem) => ({ id: roleItem!.id, name: roleItem!.name }));
            const member = {
                access_role_id: body.access_role_id,
                access_role_name: role?.name ?? body.access_role_id,
                created_at: "2026-03-17T00:00:00Z",
                updated_at: "2026-03-17T00:00:00Z",
                user_email: user?.email ?? `${body.user_id}@example.com`,
                user_id: body.user_id,
                user_name: user?.name ?? body.user_id,
                resource_roles: resourceRoles,
            };
            projectMembers = [
                ...projectMembers.filter((item) => item.user_id !== body.user_id),
                member,
            ];
            return json(member, 201);
        }

        if (pathname === "/api/resource-roles" && method === "GET") {
            return json(allResourceRoles);
        }

        if (/^\/api\/projects\/[^/]+\/resource-roles$/.test(pathname) && method === "GET") {
            return json(projectResourceRoleRates);
        }

        if (/^\/api\/projects\/[^/]+\/resource-roles\/[^/]+\/rate$/.test(pathname) && method === "PUT") {
            const [, , projectId, , resourceRoleId] = pathname.split("/").filter(Boolean);
            const body = request.postDataJSON() as { hourly_rate: number; currency: string };
            capture.projectRateUpserts.push({ projectId, resourceRoleId, body });
            const baseRole = allResourceRoles.find((item) => item.id === resourceRoleId);
            const nextRate = {
                resource_role_id: resourceRoleId,
                resource_role_name: baseRole?.name ?? resourceRoleId,
                hourly_rate: body.hourly_rate,
                currency: body.currency,
                is_override: true,
            };
            projectResourceRoleRates = [
                ...projectResourceRoleRates.filter((item) => item.resource_role_id !== resourceRoleId),
                nextRate,
            ].sort((a, b) => a.resource_role_name.localeCompare(b.resource_role_name));
            return json(nextRate);
        }

        if (/^\/api\/projects\/[^/]+\/resource-roles\/[^/]+\/rate$/.test(pathname) && method === "DELETE") {
            const [, , projectId, , resourceRoleId] = pathname.split("/").filter(Boolean);
            capture.projectRateDeletes.push({ projectId, resourceRoleId });
            const baseRole = allResourceRoles.find((item) => item.id === resourceRoleId);
            if (baseRole) {
                const fallbackRate = {
                    resource_role_id: resourceRoleId,
                    resource_role_name: baseRole.name,
                    hourly_rate: baseRole.default_hourly_rate,
                    currency: baseRole.currency,
                    is_override: false,
                };
                projectResourceRoleRates = [
                    ...projectResourceRoleRates.filter((item) => item.resource_role_id !== resourceRoleId),
                    fallbackRate,
                ].sort((a, b) => a.resource_role_name.localeCompare(b.resource_role_name));
            }
            return route.fulfill({ status: 204, body: "" });
        }

        if (/^\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs$/.test(pathname) && method === "GET") {
            const taskId = pathname.split("/").at(-2) ?? "";
            return json(workLogsByTaskId[taskId] ?? []);
        }

        if (/^\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs$/.test(pathname) && method === "POST") {
            const parts = pathname.split("/");
            const projectId = parts[3] ?? "";
            const taskId = parts[5] ?? "";
            const body = request.postDataJSON() as {
                hours: number;
                resource_role_id: string;
                work_date?: string | null;
                note?: string | null;
            };
            capture.workLogCreates.push({ projectId, taskId, body });
            const created = buildWorkLogRecord(`work-log-created-${capture.workLogCreates.length}`, taskId, body);
            workLogsByTaskId = {
                ...workLogsByTaskId,
                [taskId]: [created, ...(workLogsByTaskId[taskId] ?? [])],
            };
            return json(created, 201);
        }

        if (/^\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs\/[^/]+$/.test(pathname) && method === "PUT") {
            const parts = pathname.split("/");
            const projectId = parts[3] ?? "";
            const taskId = parts[5] ?? "";
            const workLogId = parts[7] ?? "";
            const body = request.postDataJSON() as {
                hours?: number | null;
                resource_role_id?: string | null;
                work_date?: string | null;
                note?: string | null;
            };
            capture.workLogUpdates.push({ projectId, taskId, workLogId, body });
            const previous = (workLogsByTaskId[taskId] ?? []).find((workLog) => workLog.id === workLogId);
            if (previous) {
                const updated = buildWorkLogRecord(workLogId, taskId, {
                    hours: body.hours ?? previous.hours,
                    resource_role_id: body.resource_role_id ?? previous.resource_role_id,
                    work_date: body.work_date ?? previous.work_date,
                    note: body.note ?? previous.note,
                });
                updated.created_at = previous.created_at;
                workLogsByTaskId = {
                    ...workLogsByTaskId,
                    [taskId]: (workLogsByTaskId[taskId] ?? []).map((workLog) => workLog.id === workLogId ? updated : workLog),
                };
                return json(updated);
            }
            return json({ message: "Not found" }, 404);
        }

        if (/^\/api\/projects\/[^/]+\/tasks\/[^/]+\/work-logs\/[^/]+$/.test(pathname) && method === "DELETE") {
            const parts = pathname.split("/");
            const projectId = parts[3] ?? "";
            const taskId = parts[5] ?? "";
            const workLogId = parts[7] ?? "";
            capture.workLogDeletes.push({ projectId, taskId, workLogId });
            workLogsByTaskId = {
                ...workLogsByTaskId,
                [taskId]: (workLogsByTaskId[taskId] ?? []).filter((workLog) => workLog.id !== workLogId),
            };
            return route.fulfill({ status: 204, body: "" });
        }

        if (/^\/api\/projects\/[^/]+\/task-health\/rules$/.test(pathname) && method === "GET") {
            return json({
                project_id: "project-search-contract",
                scope: "project",
                updated_at: "2026-03-17T00:00:00Z",
                rules: [
                    { health_status: "ahead", variance_from: 10, variance_to: null, priority: 1 },
                    { health_status: "on_track", variance_from: -10, variance_to: 10, priority: 2 },
                    { health_status: "at_risk", variance_from: -25, variance_to: -10, priority: 3 },
                    { health_status: "critical", variance_from: null, variance_to: -25, priority: 4 },
                    { health_status: "needs_plan", variance_from: null, variance_to: null, priority: 5 },
                ],
            });
        }

        if (pathname === "/api/rbac/audit-logs" && method === "GET") {
            capture.auditLogQueries.push(new URLSearchParams(url.searchParams));
            const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
            const perPage = Number.parseInt(url.searchParams.get("per_page") ?? "20", 10) || 20;
            return json({
                items: [
                    {
                        id: `audit-${page}`,
                        action: normalizeApiFilterValue(url.searchParams.get("action")) ?? "role.assign",
                        actor_id: "user-1",
                        actor_name: "Alex Analyst",
                        target_user_id: "user-2",
                        target_user_name: "Jamie Builder",
                        created_at: "2026-03-10T08:00:00Z",
                        details: {
                            page,
                            per_page: perPage,
                            from: url.searchParams.get("from"),
                            to: url.searchParams.get("to"),
                        },
                    },
                ],
                total: 21,
                page,
                per_page: perPage,
            });
        }

        if (/^\/api\/rbac\/roles\/[^/]+\/permissions$/.test(pathname) && method === "GET") {
            const roleId = pathname.split("/").at(-2) ?? "";
            return json(rolePermissionsById[roleId] ?? []);
        }

        if (/^\/api\/rbac\/roles\/[^/]+\/permissions$/.test(pathname) && method === "POST") {
            const roleId = pathname.split("/").at(-2) ?? "";
            const body = request.postDataJSON() as { permission_id: string };
            capture.rolePermissionAssignments.push({ roleId, body });
            const nextPermission = permissionsCatalog.find((permission) => permission.id === body.permission_id);
            if (nextPermission) {
                const previousPermissions = rolePermissionsById[roleId] ?? [];
                if (!previousPermissions.some((permission) => permission.id === nextPermission.id)) {
                    rolePermissionsById = {
                        ...rolePermissionsById,
                        [roleId]: [...previousPermissions, nextPermission],
                    };
                }
            }
            return route.fulfill({ status: 204, body: "" });
        }

        if (/^\/api\/rbac\/roles\/[^/]+\/permissions\/[^/]+$/.test(pathname) && method === "DELETE") {
            const pathSegments = pathname.split("/");
            const roleId = pathSegments.at(-3) ?? "";
            const permissionId = pathSegments.at(-1) ?? "";
            capture.rolePermissionRevokes.push({ roleId, permissionId });
            rolePermissionsById = {
                ...rolePermissionsById,
                [roleId]: (rolePermissionsById[roleId] ?? []).filter((permission) => permission.id !== permissionId),
            };
            return route.fulfill({ status: 204, body: "" });
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
    await expect(page.getByTestId("tasks-search-input")).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => capture.taskQueries.length).toBeGreaterThan(0);

    const rawTaskQuery = "  Alpha%_ task  ";
    await page.getByTestId("tasks-search-input").fill(rawTaskQuery);
    await expect.poll(() => capture.taskQueries.at(-1)?.get("q")).toBe(normalizeApiSearchQuery(rawTaskQuery));

    await page.getByTestId("tasks-filter-status-combobox").click();
    await page.getByRole("option", { name: "Blocked" }).click();
    await expect.poll(() => capture.taskQueries.at(-1)?.get("status")).toBe("blocked");

    await page.getByTestId("tasks-sort-combobox").click();
    await page.getByRole("option", { name: "Variance: lowest first" }).click();
    await expect.poll(() => capture.taskQueries.at(-1)?.get("sort_by")).toBe("variance_pct");
    await expect.poll(() => capture.taskQueries.at(-1)?.get("sort_dir")).toBe("asc");

    await page.getByTestId("tasks-advanced-filters-toggle").click();
    await expect(page.getByTestId("tasks-advanced-filters-panel")).toBeVisible();

    await page.getByTestId("tasks-filter-assignee-combobox").click();
    await page.getByRole("option", { name: /Alex Analyst/i }).click();

    await page.getByTestId("tasks-filter-health-status-combobox").click();
    await page.getByRole("option", { name: "Critical" }).click();

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
            health_status: latest.get("health_status"),
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
        q: "Alpha%_ task",
        status: "blocked",
        health_status: "critical",
        assignee_id: "user-1",
        start_from: "2026-01-01",
        start_to: "2026-01-31",
        due_from: "2026-02-01",
        due_to: "2026-02-28",
        sort_by: "variance_pct",
        sort_dir: "asc",
        page: "1",
        per_page: "10",
        progress: null,
        task_id: null,
    });

    const desktopHiddenSummary = page.getByTestId("tasks-toolbar-hidden-filters-summary");
    await expect(desktopHiddenSummary).toBeVisible();
    await expect(desktopHiddenSummary).toContainText("Alex Analyst");
    await expect(desktopHiddenSummary).toContainText("Start:");
    await expect(desktopHiddenSummary).toContainText("Due:");

    await page.getByTestId("tasks-clear-advanced-filters-button").evaluate((element) => {
        (element as HTMLButtonElement).click();
    });
    await expect(page.getByTestId("tasks-toolbar-hidden-filters-summary")).toHaveCount(0);
    await page.getByTestId("tasks-search-input").fill("Alpha reset");

    await expect.poll(() => {
        const latest = capture.taskQueries.at(-1);
        if (!latest) return null;
        return {
            q: latest.get("q"),
            status: latest.get("status"),
            health_status: latest.get("health_status"),
            assignee_id: latest.get("assignee_id"),
            start_from: latest.get("start_from"),
            start_to: latest.get("start_to"),
            due_from: latest.get("due_from"),
            due_to: latest.get("due_to"),
            sort_by: latest.get("sort_by"),
            sort_dir: latest.get("sort_dir"),
        };
    }).toEqual({
        q: "Alpha reset",
        status: "blocked",
        health_status: null,
        assignee_id: null,
        start_from: null,
        start_to: null,
        due_from: null,
        due_to: null,
        sort_by: "updated_at",
        sort_dir: "desc",
    });
});

test("tasks health summary segments apply backend health filters", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("tasks-health-summary-segment-critical")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("tasks-health-summary-segment-critical").click();
    await expect.poll(() => capture.taskQueries.at(-1)?.get("health_status")).toBe("critical");
    await expect(page.getByTestId("tasks-health-summary-clear-button")).toBeVisible();

    await page.getByTestId("tasks-health-summary-clear-button").click();
    await expect(page.getByTestId("tasks-health-summary-clear-button")).toBeHidden();

    await page.getByTestId("tasks-search-input").fill("critical reset");
    await expect.poll(() => {
        const latest = capture.taskQueries.at(-1);
        return latest
            ? {
                health_status: latest.get("health_status"),
                q: latest.get("q"),
            }
            : null;
    }).toEqual({
        health_status: null,
        q: "critical reset",
    });
});

test("users search UI uses `q` backend query param", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/settings/users", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("users-search-input")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("users-filter-summary")).toContainText("Search filters users by name and email.");

    await expect.poll(() => capture.userQueries.length).toBeGreaterThan(0);

    const rawUsersQuery = "  alex%_  ";
    await page.getByTestId("users-search-input").fill(rawUsersQuery);
    await expect.poll(() => capture.userQueries.at(-1)?.get("q")).toBe(normalizeApiSearchQuery(rawUsersQuery));
    await expect(page.getByTestId("users-filter-summary")).toContainText("Search: alex%_");

    const overLimitQuery = "x".repeat(API_SEARCH_QUERY_MAX_LENGTH + 12);
    await page.getByTestId("users-search-input").fill(overLimitQuery);
    await expect(page.getByTestId("users-search-input")).toHaveValue("x".repeat(API_SEARCH_QUERY_MAX_LENGTH));
    await expect.poll(() => capture.userQueries.at(-1)?.get("q")).toBe("x".repeat(API_SEARCH_QUERY_MAX_LENGTH));

    await page.getByTestId("users-clear-search-button").click();
    await expect(page.getByTestId("users-search-input")).toHaveValue("");
    await expect(page.getByTestId("users-filter-summary")).toContainText("Search filters users by name and email.");
});

test("projects search summary exposes active filter state", async ({ page }) => {
    await installSearchContractMocks(page);

    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("projects-search-input")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("projects-filter-summary")).toContainText("1 project in workspace");

    await page.getByTestId("projects-search-input").fill("contract");
    await expect(page.getByTestId("projects-filter-summary")).toContainText("Search: contract");
    await expect(page.getByTestId("projects-filter-summary")).toContainText("1 visible of 1 projects");
});

test("policy filter summary exposes active matrix scope", async ({ page }) => {
    await installSearchContractMocks(page);
    await page.setViewportSize({ width: 1600, height: 1100 });

    await page.goto("/settings/policy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("combobox", { name: "Filter roles" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("rbac-default-focus-banner")).toBeVisible();
    await expect(page.getByTestId("rbac-filter-summary")).toContainText("Role: project_owner");
    await page.getByTestId("rbac-show-all-roles-button").click();
    await expect(page.getByTestId("rbac-default-focus-banner")).not.toBeVisible();
    await expect(page.getByTestId("rbac-filter-summary")).toContainText(
        "All roles, resources, and permissions are visible.",
    );
});

test("policy matrix defaults to a focused role on laptop widths", async ({ page }) => {
    await installSearchContractMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/settings/policy", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rbac-default-focus-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("rbac-filter-summary")).toContainText("Role:");

    await page.getByTestId("rbac-show-all-roles-button").click();
    await expect(page.getByTestId("rbac-default-focus-banner")).not.toBeVisible();
    await expect(page.getByTestId("rbac-filter-summary")).toContainText(
        "All roles, resources, and permissions are visible.",
    );
});

test("access flow summary exposes active search and selection scope", async ({ page }) => {
    const capture = await installSearchContractMocks(page);
    await page.setViewportSize({ width: 1600, height: 1100 });

    await page.goto("/settings/flow", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("access-flow-user-search-combobox")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText(
        "Search narrows users by name or email. Selecting a user or role keeps the explorer scoped until you reset it.",
    );

    await page.getByTestId("access-flow-user-search-combobox").click();
    await page.getByPlaceholder("Type name or email...").fill("alex");
    await expect.poll(() => capture.userQueries.at(-1)?.get("q")).toBe("alex");
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText("Search: alex");
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText("1 match(es)");

    await page.getByTestId("access-flow-user-item").first().click();
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText("User: Alex Analyst");

    await page.getByRole("button", { name: /project_admin/i }).click();
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText("Role: project_admin");

    await page.getByTestId("access-flow-clear-search-button").click();
    await expect(page.getByTestId("access-flow-filter-summary")).not.toContainText("Search: alex");
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText("User: Alex Analyst");

    await page.getByTestId("access-flow-reset-scope-button").click();
    await expect(page.getByTestId("access-flow-filter-summary")).toContainText(
        "Search narrows users by name or email. Selecting a user or role keeps the explorer scoped until you reset it.",
    );
});

test("access flow defaults to a focused user on laptop widths", async ({ page }) => {
    await installSearchContractMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/settings/flow", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("access-flow-default-focus-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("access-flow-selected-summary")).toContainText("User: Alex Analyst");

    await page.getByTestId("access-flow-show-all-users-button").click();
    await expect(page.getByTestId("access-flow-default-focus-banner")).not.toBeVisible();
    await expect(page.getByTestId("access-flow-selected-summary")).toContainText("No user selected");
});

test("audit log dialog uses backend paging and filter params", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/settings/policy", { waitUntil: "domcontentloaded" });
    await page.getByTestId("policy-audit-log-button").click();
    await expect(page.getByTestId("policy-audit-log-action-filter-combobox")).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => capture.auditLogQueries.length).toBeGreaterThan(0);
    await expect.poll(() => {
        const latest = capture.auditLogQueries.at(-1);
        if (!latest) return null;
        return {
            page: latest.get("page"),
            per_page: latest.get("per_page"),
            action: latest.get("action"),
            actor_id: latest.get("actor_id"),
            user_id: latest.get("user_id"),
            from: latest.get("from"),
            to: latest.get("to"),
        };
    }).toEqual({
        page: "1",
        per_page: "20",
        action: null,
        actor_id: null,
        user_id: null,
        from: null,
        to: null,
    });

    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText(
        "All actions, users, and dates.",
    );

    await page.getByTestId("policy-audit-log-action-filter-combobox").click();
    await page.getByRole("option", { name: "Permission Granted" }).click();
    await page.getByTestId("policy-audit-log-actor-filter-combobox").click();
    await page.getByRole("option", { name: /Alex Analyst/i }).click();
    await page.getByTestId("policy-audit-log-target-filter-combobox").click();
    await page.getByRole("option", { name: /Jamie Builder/i }).click();
    await page.getByTestId("policy-audit-log-from-input").fill("2026-03-01");
    await page.getByTestId("policy-audit-log-to-input").fill("2026-03-17");

    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText("Action: permission.grant");
    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText("Actor: Alex Analyst");
    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText("Target: Jamie Builder");
    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText("From: Mar 1, 2026");
    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText("To: Mar 17, 2026");

    await expect.poll(() => {
        const latest = capture.auditLogQueries.at(-1);
        if (!latest) return null;
        return {
            page: latest.get("page"),
            per_page: latest.get("per_page"),
            action: latest.get("action"),
            actor_id: latest.get("actor_id"),
            user_id: latest.get("user_id"),
            from: latest.get("from"),
            to: latest.get("to"),
        };
    }).toEqual({
        page: "1",
        per_page: "20",
        action: "permission.grant",
        actor_id: "user-1",
        user_id: "user-2",
        from: normalizeDateOnlyToApiDateTime("2026-03-01", "start") ?? null,
        to: normalizeDateOnlyToApiDateTime("2026-03-17", "end") ?? null,
    });

    await page.getByTestId("policy-audit-log-next-button").scrollIntoViewIfNeeded();
    await page.getByTestId("policy-audit-log-next-button").evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => capture.auditLogQueries.at(-1)?.get("page")).toBe("2");

    await page.getByTestId("policy-audit-log-reset-filters-button").scrollIntoViewIfNeeded();
    await page.getByTestId("policy-audit-log-reset-filters-button").click();
    await expect(page.getByTestId("policy-audit-log-filter-summary")).toContainText(
        "All actions, users, and dates.",
    );
    await page.getByTestId("policy-audit-log-next-button").scrollIntoViewIfNeeded();
    await page.getByTestId("policy-audit-log-next-button").evaluate((button: HTMLButtonElement) => button.click());

    await expect.poll(() => {
        const latest = capture.auditLogQueries.at(-1);
        if (!latest) return null;
        return {
            page: latest.get("page"),
            per_page: latest.get("per_page"),
            action: latest.get("action"),
            actor_id: latest.get("actor_id"),
            user_id: latest.get("user_id"),
            from: latest.get("from"),
            to: latest.get("to"),
        };
    }).toEqual({
        page: "2",
        per_page: "20",
        action: null,
        actor_id: null,
        user_id: null,
        from: null,
        to: null,
    });
});

test("project settings members and resource-rate flows use backend payload contracts", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/projects/project-search-contract/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-settings-members-section")).toBeVisible({ timeout: 15_000 });

    await expect.poll(() =>
        capture.userQueries.some((query) => query.get("page") === "1" && query.get("per_page") === "500")
    ).toBe(true);

    await page.getByTestId("project-settings-add-member-user-combobox").click();
    await page.getByRole("option", { name: /Jamie Builder/i }).click();

    await page.getByTestId("project-settings-add-member-access-role-combobox").click();
    await page.getByRole("option", { name: /system_analyst/i }).click();

    await page.getByTestId("project-settings-add-member-resource-role-toggle")
        .filter({ hasText: /Frontend Developer/i })
        .click();

    await page.getByTestId("project-settings-add-member-submit").click();

    await expect.poll(() => capture.projectMemberCreates.at(-1) ?? null).toEqual({
        projectId: "project-search-contract",
        body: {
            user_id: "user-2",
            access_role_id: "role-analyst",
            resource_role_ids: ["rr-backend", "rr-frontend"],
        },
    });

    await expect(page.getByTestId("project-settings-member-row")).toHaveCount(3);
    await expect(page.getByTestId("project-settings-member-row").filter({ hasText: /Jamie Builder/i })).toContainText("system_analyst");

    await page.getByTestId("project-settings-tab-resource-rates").click();
    await expect(page.getByTestId("project-settings-resource-rates-section")).toBeVisible();

    await page.getByTestId("project-settings-rate-role-combobox").click();
    await page.getByRole("option", { name: /Backend Developer/i }).click();

    await page.getByTestId("project-settings-rate-hourly-input").fill("125.5");
    await page.getByTestId("project-settings-rate-currency-combobox").click();
    await page.getByRole("option", { name: /^IDR$/ }).click();
    await page.getByTestId("project-settings-rate-save-button").click();

    await expect.poll(() => capture.projectRateUpserts.at(-1) ?? null).toEqual({
        projectId: "project-search-contract",
        resourceRoleId: "rr-backend",
        body: {
            hourly_rate: 125.5,
            currency: "IDR",
        },
    });

    const backendRateRow = page.getByTestId("project-settings-rate-row").filter({ hasText: /Backend Developer/i });
    await expect(backendRateRow).toContainText("Override");
    await expect(backendRateRow).toContainText("IDR");

    await backendRateRow.getByTestId("project-settings-rate-reset-button").click();

    await expect.poll(() => capture.projectRateDeletes.at(-1) ?? null).toEqual({
        projectId: "project-search-contract",
        resourceRoleId: "rr-backend",
    });

    await expect(backendRateRow).toContainText("Default");
    await expect(backendRateRow).toContainText("$70.00");
});

test("roles admin flows use backend create, permission-assign, revoke, and delete contracts", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/settings/roles", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("roles-create-button")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("roles-create-button").click();
    await page.getByTestId("roles-create-name-input").fill("qa_lead");
    await page.getByTestId("roles-create-description-input").fill("Coordinates QA coverage.");
    await page.getByTestId("roles-create-submit-button").click();

    await expect.poll(() => capture.roleCreates.at(-1) ?? null).toEqual({
        name: "qa_lead",
        description: "Coordinates QA coverage.",
    });

    const qaLeadRow = page.getByRole("row").filter({ hasText: /qa_lead/i });
    await expect(qaLeadRow).toBeVisible();

    await qaLeadRow.getByTestId("roles-row-name-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("qa_lead");
    await expect(dialog.getByTestId("roles-details-overview-card")).toBeVisible();
    await expect(dialog.getByTestId("roles-details-assign-card")).toBeVisible();
    await expect(dialog.getByTestId("roles-details-permissions-card")).toBeVisible();
    await expect(dialog.getByTestId("roles-details-permission-search-input")).toBeVisible();
    await expect(dialog).toContainText("0 assigned");

    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "task.view" }).click();
    await dialog.getByRole("button", { name: "Assign selected permission" }).click();

    await expect.poll(() => capture.rolePermissionAssignments.at(-1) ?? null).toEqual({
        roleId: "role-qa-lead",
        body: {
            permission_id: "perm-task-view",
        },
    });

    await expect(dialog).toContainText("task.view");
    await dialog.getByTestId("roles-details-permission-search-input").fill("task");
    await expect(dialog.getByTestId("roles-details-permission-row")).toHaveCount(1);
    await dialog.getByTestId("roles-details-permission-revoke-button").click();
    await expect(page.getByTestId("roles-details-revoke-summary")).toContainText("Removing this grant can immediately reduce");
    await page.getByTestId("roles-details-revoke-confirm-button").click();

    await expect.poll(() => capture.rolePermissionRevokes.at(-1) ?? null).toEqual({
        roleId: "role-qa-lead",
        permissionId: "perm-task-view",
    });

    await expect(dialog.getByTestId("roles-details-permission-row")).toHaveCount(0);
    await dialog.getByRole("button", { name: /close/i }).click();

    await qaLeadRow.getByTestId("roles-row-delete-button").click();
    await page.getByTestId("roles-delete-confirm-button").click();

    await expect.poll(() => capture.roleDeletes.at(-1) ?? null).toBe("role-qa-lead");
    await expect(page.getByRole("row").filter({ hasText: /qa_lead/i })).toHaveCount(0);
});

test("user access flows use backend assign and revoke role contracts", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/settings/users/user-2", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("User Access Management")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Role: system_analyst")).toBeVisible();

    await page.getByTestId("user-access-assign-role-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("user-access-assign-role-dialog-overview")).toBeVisible();
    await expect(dialog.getByTestId("user-access-assign-role-preview")).toContainText("Choose a role above");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "project_admin" }).click();
    await expect(dialog.getByTestId("user-access-assign-role-preview")).toContainText("project_admin");
    await dialog.getByRole("button", { name: "Assign" }).click();

    await expect.poll(() => capture.userRoleAssignments.at(-1) ?? null).toEqual({
        userId: "user-2",
        body: {
            role_id: "role-admin",
        },
    });

    const projectAdminRoleCard = page.getByTestId("user-access-role-card").filter({ hasText: /project_admin/i }).first();
    await expect(projectAdminRoleCard).toBeVisible();

    await projectAdminRoleCard.getByTestId("user-access-role-revoke-button").click();
    await expect(page.getByTestId("user-access-revoke-role-summary")).toContainText("Effective access may shrink immediately");
    await page.getByTestId("user-access-revoke-role-confirm-button").click();

    await expect.poll(() => capture.userRoleRevokes.at(-1) ?? null).toEqual({
        userId: "user-2",
        roleId: "role-admin",
    });

    await expect(page.getByTestId("user-access-role-card").filter({ hasText: /project_admin/i })).toHaveCount(0);
});

test("user access defaults to a focused permission domain on laptop widths", async ({ page }) => {
    await installSearchContractMocks(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/settings/users/user-1", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("User Access Management")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("user-access-permission-focus-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("user-access-permissions-summary")).toContainText("Domain: project");
    await expect(page.getByTestId("user-access-permissions-summary")).toContainText("2 visible");
    await expect(page.getByTestId("user-access-permissions-summary")).toContainText("12 total");
    await expect(page.getByTestId("user-access-page-permissions-section")).toContainText("project.view");
    await expect(page.getByTestId("user-access-page-permissions-section")).toContainText("project.update");

    await page.getByTestId("user-access-show-all-permissions-button").click();
    await expect(page.getByTestId("user-access-permission-focus-banner")).toHaveCount(0);
    await expect(page.getByTestId("user-access-permissions-summary")).toContainText("All permission domains");
    await expect(page.getByTestId("user-access-permissions-summary")).toContainText("12 visible");
    await expect(page.getByTestId("user-access-page-permissions-section")).toContainText("task.update");
});

test("task work-log flows use backend create, update, and delete contracts", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("row", { name: /Alpha%_ task contract/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("row", { name: /Alpha%_ task contract/i }).dblclick();
    await expect(page.getByRole("heading", { name: "Edit task" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tasks-work-log-section")).toBeVisible();
    await expect(page.getByTestId("tasks-work-log-row")).toHaveCount(1);

    await page.getByTestId("tasks-work-log-date-input").fill("2026-03-17");
    await page.getByTestId("tasks-work-log-hours-input").fill("3.5");
    await page.getByTestId("tasks-work-log-note-input").fill("Frontend review");
    await page.getByTestId("tasks-work-log-save-button").click();

    await expect.poll(() => capture.workLogCreates.at(-1) ?? null).toEqual({
        projectId: "project-search-contract",
        taskId: "task-search-contract",
        body: {
            hours: 3.5,
            resource_role_id: "rr-backend",
            work_date: "2026-03-17",
            note: "Frontend review",
        },
    });

    await expect(page.getByTestId("tasks-work-log-row")).toHaveCount(2);
    await expect(page.getByTestId("tasks-work-log-row").first()).toContainText("Frontend review");

    await page.getByTestId("tasks-work-log-edit-button").first().click();
    await page.getByTestId("tasks-work-log-date-input").fill("2026-03-18");
    await page.getByTestId("tasks-work-log-hours-input").fill("4");
    await page.getByTestId("tasks-work-log-note-input").fill("Updated review");
    await page.getByTestId("tasks-work-log-save-button").click();

    await expect.poll(() => capture.workLogUpdates.at(-1) ?? null).toEqual({
        projectId: "project-search-contract",
        taskId: "task-search-contract",
        workLogId: "work-log-created-1",
        body: {
            hours: 4,
            resource_role_id: "rr-backend",
            work_date: "2026-03-18",
            note: "Updated review",
        },
    });

    await expect(page.getByTestId("tasks-work-log-row").first()).toContainText("Updated review");

    await page.getByTestId("tasks-work-log-delete-button").first().click();
    await expect.poll(() => capture.workLogDeletes.at(-1) ?? null).toEqual({
        projectId: "project-search-contract",
        taskId: "task-search-contract",
        workLogId: "work-log-created-1",
    });

    await expect(page.getByTestId("tasks-work-log-row")).toHaveCount(1);
    await page.getByRole("button", { name: /^Cancel$/i }).click();
});

test("tasks mobile quick controls expose backend sort and filter options", async ({ page }) => {
    const capture = await installSearchContractMocks(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("tasks-mobile-quick-controls")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => capture.taskQueries.length).toBeGreaterThan(0);

    await page.getByTestId("tasks-mobile-sort-combobox").click();
    await page.getByRole("option", { name: "Actual progress: low to high" }).click();
    await page.getByTestId("tasks-mobile-health-filter-combobox").click();
    await page.getByRole("option", { name: "Critical" }).click();
    await page.getByTestId("tasks-mobile-schedule-filter-combobox").click();
    await page.getByRole("option", { name: "Overdue" }).click();
    await page.getByTestId("tasks-advanced-filters-toggle").click();
    await page.getByTestId("tasks-filter-assignee-combobox").click();
    await page.getByRole("option", { name: /Alex Analyst/i }).click();
    await page.getByTestId("tasks-filter-due-from-input").fill("2026-02-01");
    await page.getByTestId("tasks-advanced-filters-toggle").click();

    const hiddenSummary = page.getByTestId("tasks-mobile-hidden-filters-summary");
    await expect(hiddenSummary).toBeVisible();
    await expect(hiddenSummary).toContainText("Alex Analyst");
    await expect(hiddenSummary).toContainText("Due:");

    await expect.poll(() => {
        const latest = capture.taskQueries.at(-1);
        if (!latest) return null;
        return {
            sort_by: latest.get("sort_by"),
            sort_dir: latest.get("sort_dir"),
            health_status: latest.get("health_status"),
            schedule_status: latest.get("schedule_status"),
            assignee_id: latest.get("assignee_id"),
            due_from: latest.get("due_from"),
        };
    }).toEqual({
        sort_by: "actual_progress_pct",
        sort_dir: "asc",
        health_status: "critical",
        schedule_status: "overdue",
        assignee_id: "user-1",
        due_from: "2026-02-01",
    });

    await page.getByTestId("tasks-mobile-quick-controls-reset-button").click();
    await expect(page.getByTestId("tasks-mobile-quick-controls-reset-button")).toBeDisabled();
    await expect(page.getByTestId("tasks-mobile-hidden-filters-summary")).toHaveCount(0);
    await page.getByTestId("tasks-search-input").fill("Reset state");

    await expect.poll(() => {
        const latest = capture.taskQueries.at(-1);
        if (!latest) return null;
        return {
            q: latest.get("q"),
            sort_by: latest.get("sort_by"),
            sort_dir: latest.get("sort_dir"),
            health_status: latest.get("health_status"),
            schedule_status: latest.get("schedule_status"),
            assignee_id: latest.get("assignee_id"),
            due_from: latest.get("due_from"),
        };
    }).toEqual({
        q: "Reset state",
        sort_by: "updated_at",
        sort_dir: "desc",
        health_status: null,
        schedule_status: null,
        assignee_id: null,
        due_from: null,
    });
});

import { api } from "@/api/client";
import { normalizeApiSearchQuery } from "@/lib/apiSearch";

import type { components } from "@/types/api";
import type { Project as DomainProject } from "@/types/domain";

type ApiProject = components["schemas"]["Project"];
type ProjectCreateRequest = components["schemas"]["ProjectCreateRequest"];
type ProjectUpdateRequest = components["schemas"]["ProjectUpdateRequest"];
type ApiTask = components["schemas"]["Task"];
type ApiProgress = components["schemas"]["Progress"];
type ApiTaskAssignee = components["schemas"]["TaskAssignee"];
type ApiProjectMember = components["schemas"]["ProjectMember"];
type ApiProjectMemberCreateRequest = components["schemas"]["ProjectMemberCreateRequest"];
type ApiMyProjectScopeSummary = components["schemas"]["MyProjectScopeSummary"];
type ApiSCurveMetric = components["schemas"]["SCurveMetric"];
type ApiSCurveHealthResponse = components["schemas"]["SCurveHealthResponse"];
type ApiPortfolioSCurveSummaryResponse = components["schemas"]["PortfolioSCurveSummaryResponse"];
type ApiResourceRole = components["schemas"]["ResourceRole"];
type ApiResourceRoleCreateRequest = components["schemas"]["ResourceRoleCreateRequest"];
type ApiResourceRoleUpdateRequest = components["schemas"]["ResourceRoleUpdateRequest"];
type ApiProjectResourceRoleRate = components["schemas"]["ProjectResourceRoleRate"];
type ApiProjectResourceRoleRateUpsertRequest = components["schemas"]["ProjectResourceRoleRateUpsertRequest"];
type ApiWorkLog = components["schemas"]["WorkLog"];
type ApiWorkLogCreateRequest = components["schemas"]["WorkLogCreateRequest"];
type ApiWorkLogUpdateRequest = components["schemas"]["WorkLogUpdateRequest"];
type ApiTaskProgressComponent = components["schemas"]["TaskProgressComponent"];
type ApiTaskProgressComponentInput = components["schemas"]["TaskProgressComponentInput"];
type ReplaceTaskProgressComponentsRequest = components["schemas"]["ReplaceTaskProgressComponentsRequest"];
type ApiTaskHealthRuleSetResponse = components["schemas"]["TaskHealthRuleSetResponse"];
type UpdateTaskHealthRulesRequest = components["schemas"]["UpdateTaskHealthRulesRequest"];
type ApiNotification = components["schemas"]["Notification"];
type ApiNotificationUnreadCountResponse = components["schemas"]["NotificationUnreadCountResponse"];
type ApiNotificationsReadResponse = components["schemas"]["NotificationsReadResponse"];
type ApiMarkNotificationsReadRequest = components["schemas"]["MarkNotificationsReadRequest"];
type TaskCreateRequest = components["schemas"]["TaskCreateRequest"];
type TaskUpdateRequest = components["schemas"]["TaskUpdateRequest"];
type ApiTaskDependency = components["schemas"]["TaskDependency"];
type DependencyCreateRequest = {
    source_task_id: string;
    target_task_id: string;
    type_: string;
};

type TaskBatchUpdatePayload = components["schemas"]["TaskBatchUpdatePayload"];
type ProjectPlanCreateRequest = {
    date: string;
    planned_progress: number;
}[];

type TaskListSortDirection = "asc" | "desc";
type TaskListQueryParams = {
    q?: string;
    status?: string;
    schedule_status?: string;
    health_status?: string;
    assignee_id?: string;
    start_from?: string;
    start_to?: string;
    due_from?: string;
    due_to?: string;
    sort_by?: string;
    sort_dir?: TaskListSortDirection;
    page?: number;
    per_page?: number;
};
type PaginatedTasksResult = {
    tasks: DomainTask[];
    total: number;
};

type ApiDashboardResponse = components["schemas"]["DashboardResponse"];
type ApiProjectPlanPoint = components["schemas"]["ProjectPlanPoint"];


import type { Task as DomainTask } from "@/types/domain";

function mapApiTaskToDomain(t: ApiTask): DomainTask {
    // Map API task fields to the application's domain Task shape
    const mapStatus = (s: string | undefined): DomainTask["status"] => {
        if (!s) return "todo";
        const lower = s.toLowerCase();
        if (lower === "pending") return "todo";
        if (lower === "in_progress" || lower === "in-progress" || lower === "inprogress") return "in_progress";
        if (lower === "blocked") return "blocked";
        if (lower === "done" || lower === "completed") return "done";
        return "todo";
    };

    return {
        id: t.id,
        name: t.title,
        description: t.description ?? undefined,
        status: mapStatus(t.status),
        projectId: t.project_id,
        assigneeId: t.assignee ?? undefined,
        startDate: t.start_date ?? undefined,
        endDate: t.end_date ?? undefined,
        dueDate: t.due_date ?? undefined,
        durationDays: t.duration_days ?? undefined,
        parentId: t.parent_id ?? undefined,
        progress: t.progress ?? 0,
        executionStatus: t.execution_status ?? undefined,
        actualProgressPct: t.actual_progress_pct ?? undefined,
        expectedProgressPct: t.expected_progress_pct ?? undefined,
        variancePct: t.variance_pct ?? undefined,
        healthStatus: t.health_status ?? undefined,
        progressMethod: t.progress_method ?? undefined,
        taskWeight: t.task_weight ?? undefined,
        completedAt: t.completed_at ?? undefined,
        completedAtIsBackfilled: t.completed_at_is_backfilled,
        scheduleStatus: t.schedule_status ?? undefined,
        createdAt: t.created_at,
    };
}

function mapApiProjectToDomain(p: ApiProject): DomainProject {
    return {
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        theme_color: p.theme_color,
    };
}

export const openapi = {
    async listProjects(): Promise<DomainProject[]> {
        const { data } = await api.get<ApiProject[]>("/projects");
        return data.map(mapApiProjectToDomain);
    },

    async createProject(payload: ProjectCreateRequest): Promise<DomainProject> {
        const { data } = await api.post<ApiProject>("/projects", payload);
        return mapApiProjectToDomain(data);
    },

    async getProject(id: string): Promise<DomainProject> {
        const { data } = await api.get<ApiProject>(`/projects/${id}`);
        return mapApiProjectToDomain(data);
    },

    async updateProject(id: string, payload: ProjectUpdateRequest): Promise<DomainProject> {
        const { data } = await api.put<ApiProject>(`/projects/${id}`, payload);
        return mapApiProjectToDomain(data);
    },

    async deleteProject(id: string): Promise<void> {
        await api.delete(`/projects/${id}`);
    },

    // Tasks
    async listTasksByProject(projectId: string, opts?: { progress?: boolean; task_id?: string }): Promise<DomainTask[] | ApiProgress[]> {
        if (opts?.progress) {
            const { data } = await api.get<ApiProgress[]>(`/projects/${projectId}/progress`, {
                params: opts.task_id ? { task_id: opts.task_id } : undefined,
            });
            return data;
        }
        const { data } = await api.get<ApiTask[]>(`/projects/${projectId}/tasks`);
        return data.map(mapApiTaskToDomain);
    },

    async listTasksByProjectPaginated(projectId: string, params?: TaskListQueryParams): Promise<PaginatedTasksResult> {
        const normalizedParams = params
            ? {
                ...params,
                ...(params.q !== undefined ? { q: normalizeApiSearchQuery(params.q) } : {}),
            }
            : undefined;
        const response = await api.get<ApiTask[]>(`/projects/${projectId}/tasks`, {
            params: normalizedParams,
        });
        const totalHeader = response.headers["x-total-count"] ?? response.headers["X-Total-Count"];
        const headerValue = Array.isArray(totalHeader) ? totalHeader[0] : totalHeader;
        const parsedTotal = Number.parseInt(String(headerValue ?? ""), 10);

        return {
            tasks: response.data.map(mapApiTaskToDomain),
            total: Number.isFinite(parsedTotal) ? parsedTotal : response.data.length,
        };
    },

    async createTaskForProject(projectId: string, payload: Partial<TaskCreateRequest>): Promise<DomainTask> {
        const body: TaskCreateRequest = payload as TaskCreateRequest;
        const { data } = await api.post<ApiTask>(`/projects/${projectId}/tasks`, body);
        return mapApiTaskToDomain(data);
    },

    async updateTask(projectId: string, id: string, payload: TaskUpdateRequest): Promise<DomainTask> {
        const { data } = await api.put<ApiTask>(`/projects/${projectId}/tasks/${id}`, payload);
        return mapApiTaskToDomain(data);
    },

    async deleteTask(projectId: string, id: string): Promise<void> {
        await api.delete(`/projects/${projectId}/tasks/${id}`);
    },

    async batchDeleteTasks(projectId: string, ids: string[]): Promise<{ deleted: number }> {
        const { data } = await api.delete<{ deleted: number }>(`/projects/${projectId}/tasks/batch`, {
            data: { ids },
        });
        return data;
    },

    async batchUpdateTasks(projectId: string, payload: TaskBatchUpdatePayload): Promise<void> {
        await api.put(`/projects/${projectId}/tasks/batch`, payload);
    },

    // Dependencies
    async getDependencies(projectId: string): Promise<ApiTaskDependency[]> {
        const { data } = await api.get<ApiTaskDependency[]>(`/projects/${projectId}/dependencies`);
        return data;
    },

    async createDependency(projectId: string, payload: DependencyCreateRequest): Promise<ApiTaskDependency> {
        const { data } = await api.post<ApiTaskDependency>(`/projects/${projectId}/dependencies`, payload);
        return data;
    },

    async deleteDependency(projectId: string, id: string): Promise<void> {
        await api.delete(`/projects/${projectId}/dependencies/${id}`);
    },

    // Dashboard & Plan
    async getProjectDashboard(id: string, metric: ApiSCurveMetric = "progress"): Promise<ApiDashboardResponse> {
        const { data } = await api.get<ApiDashboardResponse>(`/projects/${id}/dashboard`, {
            params: { metric },
        });
        return data;
    },

    async updateProjectPlan(id: string, plan: ProjectPlanCreateRequest): Promise<void> {
        await api.post(`/projects/${id}/plan`, plan);
    },

    async clearProjectPlan(id: string): Promise<void> {
        await api.delete(`/projects/${id}/plan`);
    },

    async listProjectAssignees(projectId: string): Promise<ApiTaskAssignee[]> {
        const { data } = await api.get<ApiTaskAssignee[]>(`/projects/${projectId}/assignees`);
        return Array.isArray(data) ? data : [];
    },

    async listProjectMembers(projectId: string): Promise<ApiProjectMember[]> {
        const { data } = await api.get<ApiProjectMember[]>(`/projects/${projectId}/members`);
        return data;
    },

    async addProjectMember(projectId: string, payload: ApiProjectMemberCreateRequest): Promise<ApiProjectMember> {
        const { data } = await api.post<ApiProjectMember>(`/projects/${projectId}/members`, payload);
        return data;
    },

    async removeProjectMember(projectId: string, userId: string): Promise<void> {
        await api.delete(`/projects/${projectId}/members/${userId}`);
    },

    async listMyProjectScopes(): Promise<ApiMyProjectScopeSummary[]> {
        const { data } = await api.get<ApiMyProjectScopeSummary[]>("/users/me/projects");
        return data;
    },

    async listResourceRoles(): Promise<ApiResourceRole[]> {
        const { data } = await api.get<ApiResourceRole[]>("/resource-roles");
        return Array.isArray(data) ? data : [];
    },

    async createResourceRole(payload: ApiResourceRoleCreateRequest): Promise<ApiResourceRole> {
        const { data } = await api.post<ApiResourceRole>("/resource-roles", payload);
        return data;
    },

    async updateResourceRole(id: string, payload: ApiResourceRoleUpdateRequest): Promise<ApiResourceRole> {
        const { data } = await api.put<ApiResourceRole>(`/resource-roles/${id}`, payload);
        return data;
    },

    async deleteResourceRole(id: string): Promise<void> {
        await api.delete(`/resource-roles/${id}`);
    },

    async listProjectResourceRoles(projectId: string): Promise<ApiProjectResourceRoleRate[]> {
        const { data } = await api.get<ApiProjectResourceRoleRate[]>(`/projects/${projectId}/resource-roles`);
        return Array.isArray(data) ? data : [];
    },

    async upsertProjectResourceRoleRate(
        projectId: string,
        resourceRoleId: string,
        payload: ApiProjectResourceRoleRateUpsertRequest,
    ): Promise<ApiProjectResourceRoleRate> {
        const { data } = await api.put<ApiProjectResourceRoleRate>(
            `/projects/${projectId}/resource-roles/${resourceRoleId}/rate`,
            payload,
        );
        return data;
    },

    async deleteProjectResourceRoleRate(projectId: string, resourceRoleId: string): Promise<void> {
        await api.delete(`/projects/${projectId}/resource-roles/${resourceRoleId}/rate`);
    },

    async listTaskWorkLogs(projectId: string, taskId: string): Promise<ApiWorkLog[]> {
        const { data } = await api.get<ApiWorkLog[]>(`/projects/${projectId}/tasks/${taskId}/work-logs`);
        return Array.isArray(data) ? data : [];
    },

    async createTaskWorkLog(projectId: string, taskId: string, payload: ApiWorkLogCreateRequest): Promise<ApiWorkLog> {
        const { data } = await api.post<ApiWorkLog>(`/projects/${projectId}/tasks/${taskId}/work-logs`, payload);
        return data;
    },

    async updateTaskWorkLog(
        projectId: string,
        taskId: string,
        id: string,
        payload: ApiWorkLogUpdateRequest,
    ): Promise<ApiWorkLog> {
        const { data } = await api.put<ApiWorkLog>(`/projects/${projectId}/tasks/${taskId}/work-logs/${id}`, payload);
        return data;
    },

    async deleteTaskWorkLog(projectId: string, taskId: string, id: string): Promise<void> {
        await api.delete(`/projects/${projectId}/tasks/${taskId}/work-logs/${id}`);
    },

    async listTaskProgressComponents(projectId: string, taskId: string): Promise<ApiTaskProgressComponent[]> {
        const { data } = await api.get<ApiTaskProgressComponent[]>(`/projects/${projectId}/tasks/${taskId}/progress-components`);
        return Array.isArray(data) ? data : [];
    },

    async replaceTaskProgressComponents(
        projectId: string,
        taskId: string,
        payload: ReplaceTaskProgressComponentsRequest,
    ): Promise<ApiTaskProgressComponent[]> {
        const { data } = await api.put<ApiTaskProgressComponent[]>(
            `/projects/${projectId}/tasks/${taskId}/progress-components`,
            payload,
        );
        return Array.isArray(data) ? data : [];
    },

    async getTaskHealthRules(projectId: string): Promise<ApiTaskHealthRuleSetResponse> {
        const { data } = await api.get<ApiTaskHealthRuleSetResponse>(`/projects/${projectId}/task-health/rules`);
        return data;
    },

    async updateTaskHealthRules(
        projectId: string,
        payload: UpdateTaskHealthRulesRequest,
    ): Promise<ApiTaskHealthRuleSetResponse> {
        const { data } = await api.put<ApiTaskHealthRuleSetResponse>(`/projects/${projectId}/task-health/rules`, payload);
        return data;
    },

    async getProjectSCurveHealth(id: string, metric: ApiSCurveMetric = "progress"): Promise<ApiSCurveHealthResponse> {
        const { data } = await api.get<ApiSCurveHealthResponse>(`/projects/${id}/s-curve/health`, {
            params: { metric },
        });
        return data;
    },

    async getPortfolioSCurveSummary(metric: ApiSCurveMetric = "progress"): Promise<ApiPortfolioSCurveSummaryResponse> {
        const { data } = await api.get<ApiPortfolioSCurveSummaryResponse>("/portfolio/s-curve/summary", {
            params: { metric },
        });
        return data;
    },

    async getProjectCriticalPath(id: string): Promise<string[]> {
        const { data } = await api.get<{ task_ids: string[] }>(`/projects/${id}/critical-path`);
        return data.task_ids;
    },

    async listNotifications(): Promise<ApiNotification[]> {
        const { data } = await api.get<ApiNotification[]>("/notifications");
        return Array.isArray(data) ? data : [];
    },

    async markNotificationsRead(payload: ApiMarkNotificationsReadRequest): Promise<ApiNotificationsReadResponse> {
        const { data } = await api.post<ApiNotificationsReadResponse>("/notifications/read", payload);
        return data;
    },

    async markNotificationsReadAll(): Promise<ApiNotificationsReadResponse> {
        const { data } = await api.post<ApiNotificationsReadResponse>("/notifications/read-all");
        return data;
    },

    async getUnreadNotificationCount(): Promise<ApiNotificationUnreadCountResponse> {
        const { data } = await api.get<ApiNotificationUnreadCountResponse>("/notifications/unread-count");
        return data;
    },
};

export type {
    ProjectCreateRequest,
    ProjectUpdateRequest,
    TaskCreateRequest,
    TaskUpdateRequest,
    DependencyCreateRequest,
    ApiTaskDependency,
    TaskBatchUpdatePayload,
    ApiDashboardResponse,
    ApiProjectPlanPoint,
    TaskListQueryParams,
    PaginatedTasksResult,
    ApiProjectMember,
    ApiProjectMemberCreateRequest,
    ApiMyProjectScopeSummary,
    ApiSCurveMetric,
    ApiSCurveHealthResponse,
    ApiPortfolioSCurveSummaryResponse,
    ApiResourceRole,
    ApiResourceRoleCreateRequest,
    ApiResourceRoleUpdateRequest,
    ApiProjectResourceRoleRate,
    ApiProjectResourceRoleRateUpsertRequest,
    ApiWorkLog,
    ApiWorkLogCreateRequest,
    ApiWorkLogUpdateRequest,
    ApiTaskProgressComponent,
    ApiTaskProgressComponentInput,
    ReplaceTaskProgressComponentsRequest,
    ApiTaskHealthRuleSetResponse,
    UpdateTaskHealthRulesRequest,
    ApiNotification,
    ApiNotificationUnreadCountResponse,
    ApiNotificationsReadResponse,
    ApiMarkNotificationsReadRequest,
};

import { api } from "@/api/client";

import type { components } from "@/types/api";
import type { Project as DomainProject } from "@/types/domain";

type ApiProject = components["schemas"]["Project"];
type ProjectCreateRequest = components["schemas"]["ProjectCreateRequest"];
type ProjectUpdateRequest = components["schemas"]["ProjectUpdateRequest"];
type ApiTask = components["schemas"]["Task"];
type ApiProgress = components["schemas"]["Progress"];
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
        description: undefined,
        status: mapStatus(t.status),
        projectId: t.project_id,
        assigneeId: t.assignee ?? undefined,
        startDate: t.start_date ?? undefined,
        endDate: t.end_date ?? undefined,
        dueDate: t.due_date ?? undefined,
        durationDays: t.duration_days ?? undefined,
        parentId: t.parent_id ?? undefined,
        progress: t.progress ?? 0,
        createdAt: t.created_at,
    };
}

function mapApiProjectToDomain(p: ApiProject): DomainProject {
    return {
        id: p.id,
        name: p.name,
        description: p.description ?? undefined,
        // backend doesn't expose status/startDate/endDate/progress in this OpenAPI — provide sensible defaults
        status: "active",
        startDate: (p as unknown as Record<string, unknown>)["start_date"] as string | undefined ??
            (p as unknown as Record<string, unknown>)["startDate"] as string | undefined ??
            undefined,
        endDate: (p as unknown as Record<string, unknown>)["end_date"] as string | undefined ??
            (p as unknown as Record<string, unknown>)["endDate"] as string | undefined ??
            undefined,
        progress: ((p as unknown as Record<string, unknown>)["progress"] as number | undefined) ?? 0,
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
            const { data } = await api.get<ApiProgress[]>(`/projects/${projectId}/tasks`, { params: { progress: true, task_id: opts.task_id } });
            return data;
        }
        const { data } = await api.get<ApiTask[]>(`/projects/${projectId}/tasks`);
        return data.map(mapApiTaskToDomain);
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
    async getProjectDashboard(id: string): Promise<ApiDashboardResponse> {
        const { data } = await api.get<ApiDashboardResponse>(`/projects/${id}/dashboard`);
        return data;
    },

    async updateProjectPlan(id: string, plan: ProjectPlanCreateRequest): Promise<void> {
        await api.post(`/projects/${id}/plan`, plan);
    },

    async clearProjectPlan(id: string): Promise<void> {
        await api.delete(`/projects/${id}/plan`);
    },

    async getProjectCriticalPath(id: string): Promise<string[]> {
        const { data } = await api.get<{ task_ids: string[] }>(`/projects/${id}/critical-path`);
        return data.task_ids;
    },
};

export type { ProjectCreateRequest, ProjectUpdateRequest, TaskCreateRequest, TaskUpdateRequest, DependencyCreateRequest, ApiTaskDependency, TaskBatchUpdatePayload, ApiDashboardResponse, ApiProjectPlanPoint };

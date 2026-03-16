import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { openapi } from "@/api/openapiClient";
import type {
    ApiResourceRole,
    ApiMyProjectScopeSummary,
    ApiPortfolioSCurveSummaryResponse,
    ApiSCurveHealthResponse,
    ApiSCurveMetric,
    ApiTaskHealthRuleSetResponse,
    UpdateTaskHealthRulesRequest,
} from "@/api/openapiClient";
import type { Project } from "@/types/domain";

type ProjectAssignee = Awaited<ReturnType<typeof openapi.listProjectAssignees>>[number];
type ProjectCreatePayload = Parameters<typeof openapi.createProject>[0];
type ProjectUpdatePayload = Parameters<typeof openapi.updateProject>[1];
type ProjectMemberCreatePayload = Parameters<typeof openapi.addProjectMember>[1];
type UpsertProjectResourceRoleRatePayload = Parameters<typeof openapi.upsertProjectResourceRoleRate>[2];

const PROJECTS_QUERY_KEY = ["projects"] as const;
const NO_ACCESS_STATUSES = new Set([403, 404]);

export const projectsKeys = {
    all: PROJECTS_QUERY_KEY,
    detail: (id: string) => [...PROJECTS_QUERY_KEY, id] as const,
    dashboard: (id: string, metric: ApiSCurveMetric) => [...PROJECTS_QUERY_KEY, id, "dashboard", metric] as const,
    settings: (id: string) => [...PROJECTS_QUERY_KEY, id, "settings"] as const,
    assignees: (id: string) => [...PROJECTS_QUERY_KEY, id, "assignees"] as const,
    members: (id: string) => [...PROJECTS_QUERY_KEY, id, "settings", "members"] as const,
    resourceRoleRates: (id: string) => [...PROJECTS_QUERY_KEY, id, "settings", "resource-role-rates"] as const,
    taskHealthRules: (id: string) => [...PROJECTS_QUERY_KEY, id, "settings", "task-health-rules"] as const,
    resourceRoles: [...PROJECTS_QUERY_KEY, "resource-roles"] as const,
    myScopes: [...PROJECTS_QUERY_KEY, "my-scopes"] as const,
    sCurveHealth: (id: string, metric: ApiSCurveMetric) => [...projectsKeys.detail(id), "s-curve-health", metric] as const,
    sCurvePortfolio: (metric: ApiSCurveMetric) => [...PROJECTS_QUERY_KEY, "s-curve-portfolio", metric] as const,
};

function isNoAccessError(err: unknown) {
    return isAxiosError(err) && NO_ACCESS_STATUSES.has(err.response?.status ?? 0);
}

export function useProjectsQuery() {
    return useQuery<Project[]>({
        queryKey: projectsKeys.all,
        queryFn: () => openapi.listProjects(),
    });
}

export function useProjectDashboard(projectId: string, metric: ApiSCurveMetric = "progress") {
    return useQuery({
        queryKey: projectsKeys.dashboard(projectId, metric),
        queryFn: async () => {
            if (!projectId) throw new Error("projectId is required");
            return await openapi.getProjectDashboard(projectId, metric);
        },
        enabled: Boolean(projectId),
    });
}

export function useProjectById(projectId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: projectsKeys.detail(projectId),
        queryFn: async () => {
            if (!projectId) throw new Error("projectId is required");
            return await openapi.getProject(projectId);
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
    });
}

export function useMyProjectScopesQuery(options?: { enabled?: boolean }) {
    return useQuery<ApiMyProjectScopeSummary[]>({
        queryKey: projectsKeys.myScopes,
        queryFn: async () => {
            try {
                const data = await openapi.listMyProjectScopes();
                return Array.isArray(data) ? data : [];
            } catch (err: unknown) {
                if (isNoAccessError(err)) return [];
                throw err;
            }
        },
        enabled: options?.enabled ?? true,
    });
}

export function useProjectMembersQuery(projectId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: projectsKeys.members(projectId),
        queryFn: async () => {
            if (!projectId) return [];
            try {
                return await openapi.listProjectMembers(projectId);
            } catch (err: unknown) {
                if (isNoAccessError(err)) return [];
                throw err;
            }
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
    });
}

export function useProjectAssigneesQuery(projectId: string, options?: { enabled?: boolean }) {
    return useQuery<ProjectAssignee[]>({
        queryKey: projectsKeys.assignees(projectId),
        queryFn: async () => {
            if (!projectId) return [];
            try {
                return await openapi.listProjectAssignees(projectId);
            } catch (err: unknown) {
                if (isNoAccessError(err)) return [];
                throw err;
            }
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
        staleTime: 5 * 60 * 1000,
    });
}

export function useProjectResourceRoleRatesQuery(projectId: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: projectsKeys.resourceRoleRates(projectId),
        queryFn: async () => {
            if (!projectId) return [];
            try {
                return await openapi.listProjectResourceRoles(projectId);
            } catch (err: unknown) {
                if (isNoAccessError(err)) return [];
                throw err;
            }
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
    });
}

export function useProjectTaskHealthRulesQuery(projectId: string, options?: { enabled?: boolean }) {
    return useQuery<ApiTaskHealthRuleSetResponse | null>({
        queryKey: projectsKeys.taskHealthRules(projectId),
        queryFn: async () => {
            if (!projectId) return null;
            try {
                return await openapi.getTaskHealthRules(projectId);
            } catch (err: unknown) {
                if (isNoAccessError(err)) return null;
                throw err;
            }
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
    });
}

export function useResourceRolesQuery(options?: { enabled?: boolean }) {
    return useQuery<ApiResourceRole[]>({
        queryKey: projectsKeys.resourceRoles,
        queryFn: async () => {
            try {
                return await openapi.listResourceRoles();
            } catch (err: unknown) {
                if (isNoAccessError(err)) return [];
                throw err;
            }
        },
        enabled: options?.enabled ?? true,
        staleTime: 5 * 60 * 1000,
    });
}

export function useProjectSCurveHealth(
    projectId: string,
    metric: ApiSCurveMetric = "progress",
    options?: { enabled?: boolean },
) {
    return useQuery<ApiSCurveHealthResponse | null>({
        queryKey: projectsKeys.sCurveHealth(projectId, metric),
        queryFn: async () => {
            if (!projectId) return null;
            try {
                return await openapi.getProjectSCurveHealth(projectId, metric);
            } catch (err: unknown) {
                if (isNoAccessError(err)) return null;
                throw err;
            }
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
    });
}

export function usePortfolioSCurveSummary(metric: ApiSCurveMetric = "progress", options?: { enabled?: boolean }) {
    return useQuery<ApiPortfolioSCurveSummaryResponse | null>({
        queryKey: projectsKeys.sCurvePortfolio(metric),
        queryFn: async () => {
            try {
                const data = await openapi.getPortfolioSCurveSummary(metric);
                if (!data || typeof data !== "object") return null;
                return {
                    ...data,
                    projects: Array.isArray(data.projects) ? data.projects : [],
                };
            } catch (err: unknown) {
                if (isNoAccessError(err)) return null;
                throw err;
            }
        },
        enabled: options?.enabled ?? true,
    });
}

export function useCriticalPath(projectId: string) {
    return useQuery<string[]>({
        queryKey: [...projectsKeys.detail(projectId), "critical-path"],
        queryFn: async () => {
            if (!projectId) return [];
            return await openapi.getProjectCriticalPath(projectId);
        },
        enabled: Boolean(projectId),
    });
}

export function useCreateProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: ProjectCreatePayload) => openapi.createProject(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: projectsKeys.all });
        },
    });
}

export function useUpdateProjectMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: ProjectUpdatePayload) => {
            if (!projectId) throw new Error("projectId is required");
            return openapi.updateProject(projectId, payload);
        },
        onSuccess: () => {
            if (!projectId) return;
            queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
            queryClient.invalidateQueries({ queryKey: projectsKeys.all });
        },
    });
}

export function useUpdateProjectByIdMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args: { id: string; payload: ProjectUpdatePayload }) => openapi.updateProject(args.id, args.payload),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: projectsKeys.detail(variables.id) });
            queryClient.invalidateQueries({ queryKey: projectsKeys.all });
        },
    });
}

export function useDeleteProjectMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await openapi.deleteProject(id);
            return id;
        },
        onSuccess: (_, projectId) => {
            queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
            queryClient.invalidateQueries({ queryKey: projectsKeys.all });
        },
    });
}

export function useAddProjectMemberMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: ProjectMemberCreatePayload) => {
            if (!projectId) throw new Error("projectId is required");
            return openapi.addProjectMember(projectId, payload);
        },
        onSuccess: () => {
            if (!projectId) return;
            queryClient.invalidateQueries({ queryKey: projectsKeys.members(projectId) });
            queryClient.invalidateQueries({ queryKey: projectsKeys.myScopes });
        },
    });
}

export function useRemoveProjectMemberMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (userId: string) => {
            if (!projectId) throw new Error("projectId is required");
            return openapi.removeProjectMember(projectId, userId);
        },
        onSuccess: () => {
            if (!projectId) return;
            queryClient.invalidateQueries({ queryKey: projectsKeys.members(projectId) });
            queryClient.invalidateQueries({ queryKey: projectsKeys.myScopes });
        },
    });
}

export function useUpsertProjectResourceRoleRateMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { resourceRoleId: string; data: UpsertProjectResourceRoleRatePayload }) => {
            if (!projectId) throw new Error("projectId is required");
            return openapi.upsertProjectResourceRoleRate(projectId, payload.resourceRoleId, payload.data);
        },
        onSuccess: () => {
            if (!projectId) return;
            queryClient.invalidateQueries({ queryKey: projectsKeys.resourceRoleRates(projectId) });
        },
    });
}

export function useDeleteProjectResourceRoleRateMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (resourceRoleId: string) => {
            if (!projectId) throw new Error("projectId is required");
            return openapi.deleteProjectResourceRoleRate(projectId, resourceRoleId);
        },
        onSuccess: () => {
            if (!projectId) return;
            queryClient.invalidateQueries({ queryKey: projectsKeys.resourceRoleRates(projectId) });
        },
    });
}

export function useUpdateTaskHealthRulesMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: UpdateTaskHealthRulesRequest) => {
            if (!projectId) throw new Error("projectId is required");
            return openapi.updateTaskHealthRules(projectId, payload);
        },
        onSuccess: () => {
            if (!projectId) return;
            queryClient.invalidateQueries({ queryKey: projectsKeys.taskHealthRules(projectId) });
            queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId), exact: false });
            queryClient.invalidateQueries({ queryKey: ["tasks", "project", projectId], exact: false });
        },
    });
}

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { openapi } from "@/api/openapiClient";

const PROJECTS_QUERY_KEY = ["projects"] as const;

export const projectsKeys = {
    all: PROJECTS_QUERY_KEY,
    detail: (id: string) => [...PROJECTS_QUERY_KEY, id] as const,
    dashboard: (id: string) => [...PROJECTS_QUERY_KEY, id, "dashboard"] as const,
};


import type { Project } from "@/types/domain";

export function useProjectsQuery() {
    return useQuery<Project[]>({
        queryKey: projectsKeys.all,
        queryFn: async () => {
            try {
                return await openapi.listProjects();
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                // show a toast immediately and re-throw so react-query can handle error state
                toast.error(`Failed to load projects: ${message}`);
                throw err;
            }
        },
    });
}

export function useProjectDashboard(projectId: string) {
    return useQuery({
        queryKey: projectsKeys.dashboard(projectId),
        queryFn: async () => {
            if (!projectId) throw new Error("projectId is required");
            return await openapi.getProjectDashboard(projectId);
        },
        enabled: Boolean(projectId),
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

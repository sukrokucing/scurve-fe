import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { openapi } from "@/api/openapiClient";
import type { Task } from "@/types/domain";
import type { components } from "@/types/api";
import type { TaskCreateRequest, TaskUpdateRequest, DependencyCreateRequest } from "@/api/openapiClient";

type Progress = components["schemas"]["Progress"];
import { toast } from "sonner";
import { isAxiosError } from "axios";

const TASKS_QUERY_KEY = ["tasks"] as const;

export const tasksKeys = {
    all: TASKS_QUERY_KEY,
    byProject: (projectId: string, progress?: boolean) => [...TASKS_QUERY_KEY, "project", projectId, progress ? "progress" : "tasks"] as const,
};

export function useTasksByProject(projectId: string, progress?: boolean) {
    return useQuery<Task[] | Progress[]>({
        queryKey: tasksKeys.byProject(projectId, progress),
        queryFn: async () => {
            if (!projectId) return [];
            return openapi.listTasksByProject(projectId, { progress });
        },
        enabled: Boolean(projectId),
    });
}

export function useTaskMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Task>) => {
            if (!projectId) throw new Error("projectId is required to create a task");
            // convert Partial<Task> to TaskCreateRequest-compatible shape
            const mapStatusToApi = (s: Task["status"] | undefined) => {
                switch (s) {
                    case "todo":
                        return "pending";
                    case "in_progress":
                        return "in_progress";
                    case "blocked":
                        return "blocked";
                    case "done":
                        return "done";
                    default:
                        return "pending";
                }
            };

            const body: Partial<TaskCreateRequest> = {
                title: payload.name ?? "",
                // don't send empty string for due_date — convert empty to undefined so the server treats it as omitted
                ...(payload.dueDate !== undefined && payload.dueDate !== "" ? { due_date: payload.dueDate } : {}),
                status: mapStatusToApi(payload.status),
            };
            const created = await openapi.createTaskForProject(projectId, body);
            return created;
        },
        onSuccess: (data) => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId) });
            }
            try {
                toast.success(`Created task "${(data as Task).name}"`);
            } catch {
                toast.success("Created task");
            }
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            let extra = "";
            if (isAxiosError(err) && err.response) {
                try {
                    const status = err.response.status;
                    const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
                    extra = ` (status: ${status}) ${body}`;
                } catch {
                    // ignore stringify errors
                }
            }
            toast.error(`Failed to create task: ${message}${extra}`);
        },
    });
}

export function useUpdateTask() {
    const queryClient = useQueryClient();
    return useMutation<Task, unknown, { id: string; projectId?: string; payload: Partial<Task> }>({
        mutationFn: async (args: { id: string; projectId?: string; payload: Partial<Task> }) => {
            const mapStatusToApi = (s: Task["status"] | undefined) => {
                switch (s) {
                    case "todo":
                        return "pending";
                    case "in_progress":
                        return "in_progress";
                    case "blocked":
                        return "blocked";
                    case "done":
                        return "done";
                    default:
                        return undefined;
                }
            };

            const body: Partial<TaskUpdateRequest> = {};
            if (args.payload.name !== undefined) body.title = args.payload.name;
            // If dueDate is explicitly provided as empty string, treat as null (clear); if it's undefined, omit the field
            if (Object.prototype.hasOwnProperty.call(args.payload, "dueDate")) {
                if (args.payload.dueDate === "") body.due_date = null;
                else body.due_date = args.payload.dueDate as string | null | undefined;
            }
            const mappedStatus = mapStatusToApi(args.payload.status);
            if (mappedStatus !== undefined) body.status = mappedStatus;

            if (!args.projectId) throw new Error("projectId is required to update a task");
            const updated = await openapi.updateTask(args.projectId, args.id, body as TaskUpdateRequest);
            return updated;
        },
        onSuccess: (_, vars) => {
            // invalidate project-specific tasks if available
            if (vars && vars.payload && vars.projectId) {
                queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(vars.projectId) });
            } else {
                queryClient.invalidateQueries({ queryKey: tasksKeys.all });
            }
            try {
                // vars may include the updated Task as first arg in some cases, but we don't rely on it
                toast.success("Updated task");
            } catch {
                // ignore
            }
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            let extra = "";
            if (isAxiosError(err) && err.response) {
                try {
                    const status = err.response.status;
                    const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
                    extra = ` (status: ${status}) ${body}`;
                } catch {
                    // ignore stringify errors
                }
            }
            toast.error(`Failed to update task: ${message}${extra}`);
        },
    });
}

export function useDeleteTask(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            if (!projectId) throw new Error("projectId is required to delete a task");
            await openapi.deleteTask(projectId, id);
            return id;
        },
        onSuccess: () => {
            if (projectId) queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId) });
            else queryClient.invalidateQueries({ queryKey: tasksKeys.all });
            toast.success("Deleted task");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            let extra = "";
            if (isAxiosError(err) && err.response) {
                try {
                    const status = err.response.status;
                    const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
                    extra = ` (status: ${status}) ${body}`;
                } catch {
                    // ignore stringify errors
                }
            }
            toast.error(`Failed to delete task: ${message}${extra}`);
        },
    });
}

export function useDependencies(projectId: string) {
    return useQuery({
        queryKey: [...tasksKeys.byProject(projectId), "dependencies"],
        queryFn: async () => {
            if (!projectId) return [];
            return openapi.getDependencies(projectId);
        },
        enabled: Boolean(projectId),
    });
}

export function useDependencyMutation(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: DependencyCreateRequest) => {
            if (!projectId) throw new Error("projectId is required to create a dependency");
            return openapi.createDependency(projectId, payload);
        },
        onSuccess: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: [...tasksKeys.byProject(projectId), "dependencies"] });
            }
            toast.success("Created dependency");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to create dependency: ${message}`);
        },
    });
}

export function useDeleteDependency(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            if (!projectId) throw new Error("projectId is required to delete a dependency");
            await openapi.deleteDependency(projectId, id);
        },
        onSuccess: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: [...tasksKeys.byProject(projectId), "dependencies"] });
            }
            toast.success("Deleted dependency");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to delete dependency: ${message}`);
        },
    });
}

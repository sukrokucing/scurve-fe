import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useProjectsQuery } from "./projects";

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

export function useTasksByProject(projectId: string, progress?: boolean, options?: { enabled?: boolean }) {
    return useQuery<Task[] | Progress[]>({
        queryKey: tasksKeys.byProject(projectId, progress),
        queryFn: async () => {
            if (!projectId) return [];
            return openapi.listTasksByProject(projectId, { progress });
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
    });
}

export function useAllTasks() {
    const { data: projects } = useProjectsQuery();
    const projectIds = projects?.map((p) => p.id) ?? [];

    const taskQueries = useQueries({
        queries: projectIds.map((projectId) => ({
            queryKey: tasksKeys.byProject(projectId),
            queryFn: async () => {
                return openapi.listTasksByProject(projectId);
            },
            enabled: !!projectId,
        })),
    });

    const isLoading = taskQueries.some((q) => q.isLoading);
    const tasks = taskQueries.flatMap((q) => (q.data as Task[]) ?? []);

    return { tasks, isLoading };
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
                ...(payload.startDate !== undefined && payload.startDate !== "" ? { start_date: payload.startDate } : {}),
                ...(payload.endDate !== undefined && payload.endDate !== "" ? { end_date: payload.endDate } : {}),
                ...(payload.progress !== undefined ? { progress: payload.progress } : {}),
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

    type UpdateTaskContext = {
        previousTasks?: Task[];
        projectId?: string;
    };

    return useMutation<Task, unknown, { id: string; projectId?: string; payload: Partial<Task> }, UpdateTaskContext>({
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

            // Handle Gantt-specific date fields
            if (args.payload.startDate !== undefined) {
                body.start_date = args.payload.startDate;
            }
            if (args.payload.endDate !== undefined) {
                body.end_date = args.payload.endDate;
            }
            if (args.payload.progress !== undefined) {
                body.progress = args.payload.progress;
            }
            if (args.payload.dueDate !== undefined) {
                body.due_date = args.payload.dueDate as string | null | undefined;
            }


            const mappedStatus = mapStatusToApi(args.payload.status);
            if (mappedStatus !== undefined) body.status = mappedStatus;

            if (!args.projectId) throw new Error("projectId is required to update a task");
            const updated = await openapi.updateTask(args.projectId, args.id, body as TaskUpdateRequest);
            return updated;
        },
        onMutate: async (variables): Promise<UpdateTaskContext> => {
            // Cancel outgoing refetches to avoid overwriting optimistic update
            if (variables.projectId) {
                await queryClient.cancelQueries({ queryKey: tasksKeys.byProject(variables.projectId) });
            }

            // Snapshot previous value
            const previousTasks = variables.projectId
                ? queryClient.getQueryData<Task[]>(tasksKeys.byProject(variables.projectId))
                : undefined;

            // Optimistically update the cache
            if (variables.projectId && previousTasks) {
                queryClient.setQueryData<Task[]>(
                    tasksKeys.byProject(variables.projectId),
                    previousTasks.map(task =>
                        task.id === variables.id
                            ? { ...task, ...variables.payload }
                            : task
                    )
                );
            }

            return { previousTasks, projectId: variables.projectId };
        },
        onError: (err: unknown, _variables, context) => {
            // Rollback on error
            if (context?.previousTasks && context.projectId) {
                queryClient.setQueryData(tasksKeys.byProject(context.projectId), context.previousTasks);
            }

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

export function useBatchUpdateTasks(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: import("@/api/openapiClient").TaskBatchUpdatePayload) => {
            if (!projectId) throw new Error("projectId is required for batch update");
            return openapi.batchUpdateTasks(projectId, payload);
        },
        onSuccess: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId) });
            }
            toast.success("Updated tasks");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to batch update tasks: ${message}`);
        },
    });
}

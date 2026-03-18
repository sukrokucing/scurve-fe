import { keepPreviousData, useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { projectsKeys, useProjectsQuery } from "./projects";

import { openapi } from "@/api/openapiClient";
import type { Task } from "@/types/domain";
import type { components } from "@/types/api";
import type {
    TaskCreateRequest,
    TaskUpdateRequest,
    DependencyCreateRequest,
    TaskListQueryParams,
    PaginatedTasksResult,
    ApiWorkLog,
    ApiWorkLogCreateRequest,
    ApiWorkLogUpdateRequest,
    ApiTaskProgressComponent,
    ReplaceTaskProgressComponentsRequest,
} from "@/api/openapiClient";

type Progress = components["schemas"]["Progress"];
import { toast } from "sonner";
import { isAxiosError } from "axios";

const TASKS_QUERY_KEY = ["tasks"] as const;

export const tasksKeys = {
    all: TASKS_QUERY_KEY,
    projectScope: (projectId: string) => [...TASKS_QUERY_KEY, "project", projectId] as const,
    byProject: (projectId: string, progress?: boolean) =>
        [...tasksKeys.projectScope(projectId), progress ? "progress" : "tasks"] as const,
    byProjectList: (projectId: string, params: TaskListQueryParams) =>
        [...tasksKeys.byProject(projectId), "list", params] as const,
    dependencies: (projectId: string) => [...tasksKeys.projectScope(projectId), "dependencies"] as const,
    workLogs: (projectId: string, taskId: string) => [...TASKS_QUERY_KEY, "project", projectId, "task", taskId, "work-logs"] as const,
    progressComponents: (projectId: string, taskId: string) =>
        [...TASKS_QUERY_KEY, "project", projectId, "task", taskId, "progress-components"] as const,
};

export function useTasksByProject(projectId: string, progress?: boolean, options?: { enabled?: boolean }) {
    return useQuery<Task[] | Progress[]>({
        queryKey: tasksKeys.byProject(projectId, progress),
        queryFn: async () => {
            if (!projectId) return [];
            return openapi.listTasksByProject(projectId, { progress });
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
        placeholderData: keepPreviousData,
    });
}

export function useTasksByProjectList(
    projectId: string,
    params: TaskListQueryParams,
    options?: { enabled?: boolean },
) {
    return useQuery<PaginatedTasksResult>({
        queryKey: tasksKeys.byProjectList(projectId, params),
        queryFn: async () => {
            if (!projectId) return { tasks: [], total: 0 };
            return openapi.listTasksByProjectPaginated(projectId, params);
        },
        enabled: Boolean(projectId) && (options?.enabled ?? true),
        placeholderData: keepPreviousData,
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
                ...(Object.prototype.hasOwnProperty.call(payload, "assigneeId")
                    ? { assignee: payload.assigneeId === "" ? null : payload.assigneeId }
                    : {}),
                ...(payload.progress !== undefined && payload.progressMethod !== "weighted_components"
                    ? { progress: payload.progress }
                    : {}),
                ...(payload.progressMethod !== undefined ? { progress_method: payload.progressMethod } : {}),
                status: mapStatusToApi(payload.status),
            };
            if (Object.prototype.hasOwnProperty.call(payload, "description")) {
                const normalizedDescription = payload.description?.trim();
                if (normalizedDescription) {
                    body.description = normalizedDescription;
                }
            }

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
            if (Object.prototype.hasOwnProperty.call(args.payload, "description")) {
                const normalizedDescription = args.payload.description?.trim();
                if (normalizedDescription) {
                    body.description = normalizedDescription;
                }
            }
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
            if (args.payload.progress !== undefined && args.payload.progressMethod !== "weighted_components") {
                body.progress = args.payload.progress;
            }
            if (args.payload.progressMethod !== undefined) {
                body.progress_method = args.payload.progressMethod;
            }
            if (Object.prototype.hasOwnProperty.call(args.payload, "assigneeId")) {
                body.assignee = args.payload.assigneeId === ""
                    ? null
                    : (args.payload.assigneeId as string | null | undefined);
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
                    previousTasks.map((task) => {
                        if (task.id !== variables.id) return task;
                        const nextTask = { ...task, ...variables.payload };
                        if (typeof variables.payload.progress === "number") {
                            nextTask.actualProgressPct = variables.payload.progress;
                        }
                        return nextTask;
                    }),
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
        queryKey: tasksKeys.dependencies(projectId),
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
                queryClient.invalidateQueries({ queryKey: tasksKeys.dependencies(projectId) });
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
                queryClient.invalidateQueries({ queryKey: tasksKeys.dependencies(projectId) });
            }
            toast.success("Deleted dependency");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to delete dependency: ${message}`);
        },
    });
}

export function useBatchUpdateTasks(
    projectId?: string,
    options?: { notify?: boolean; optimistic?: boolean },
) {
    const queryClient = useQueryClient();
    const notify = options?.notify ?? true;
    const optimistic = options?.optimistic ?? true;
    type BatchUpdateContext = {
        previousTasks?: Task[];
    };

    return useMutation<unknown, unknown, import("@/api/openapiClient").TaskBatchUpdatePayload, BatchUpdateContext>({
        mutationFn: async (payload: import("@/api/openapiClient").TaskBatchUpdatePayload) => {
            if (!projectId) throw new Error("projectId is required for batch update");
            return openapi.batchUpdateTasks(projectId, payload);
        },
        onMutate: async (payload): Promise<BatchUpdateContext> => {
            if (!projectId || !optimistic) return {};

            await queryClient.cancelQueries({ queryKey: tasksKeys.byProject(projectId) });
            const previousTasks = queryClient.getQueryData<Task[]>(tasksKeys.byProject(projectId));

            if (previousTasks) {
                const updates = new Map(
                    (payload.tasks ?? []).map((task) => [task.id, task]),
                );

                queryClient.setQueryData<Task[]>(
                    tasksKeys.byProject(projectId),
                    previousTasks.map((task) => {
                        const update = updates.get(task.id);
                        if (!update) return task;

                        return {
                            ...task,
                            ...(update.title !== undefined ? { name: update.title ?? task.name } : {}),
                            ...(update.start_date !== undefined ? { startDate: update.start_date } : {}),
                            ...(update.end_date !== undefined ? { endDate: update.end_date } : {}),
                            ...(update.due_date !== undefined ? { dueDate: update.due_date } : {}),
                            ...(update.progress !== undefined
                                ? {
                                    progress: update.progress ?? task.progress,
                                    actualProgressPct: update.progress ?? task.actualProgressPct,
                                }
                                : {}),
                        };
                    }),
                );
            }

            return { previousTasks };
        },
        onSuccess: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId) });
            }
            if (notify) {
                toast.success("Updated tasks");
            }
        },
        onError: (err: unknown, _payload, context) => {
            if (projectId && context?.previousTasks) {
                queryClient.setQueryData(tasksKeys.byProject(projectId), context.previousTasks);
            }

            const message = err instanceof Error ? err.message : String(err);
            if (notify) {
                toast.error(`Failed to batch update tasks: ${message}`);
            }
        },
    });
}

export function useBatchDeleteTasks(projectId?: string, options?: { notify?: boolean }) {
    const queryClient = useQueryClient();
    const notify = options?.notify ?? true;

    return useMutation({
        mutationFn: async (taskIds: string[]) => {
            if (!projectId) throw new Error("projectId is required for batch delete");
            return openapi.batchDeleteTasks(projectId, taskIds);
        },
        onSuccess: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId), exact: false });
            }
            if (notify) {
                toast.success("Deleted selected tasks");
            }
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            if (notify) {
                toast.error(`Failed to delete selected tasks: ${message}`);
            }
        },
    });
}

export function useTaskWorkLogs(projectId?: string, taskId?: string, options?: { enabled?: boolean }) {
    return useQuery<ApiWorkLog[]>({
        queryKey: tasksKeys.workLogs(projectId ?? "", taskId ?? ""),
        queryFn: async () => {
            if (!projectId || !taskId) return [];
            return openapi.listTaskWorkLogs(projectId, taskId);
        },
        enabled: Boolean(projectId && taskId) && (options?.enabled ?? true),
    });
}

export function useTaskProgressComponents(projectId?: string, taskId?: string, options?: { enabled?: boolean }) {
    return useQuery<ApiTaskProgressComponent[]>({
        queryKey: tasksKeys.progressComponents(projectId ?? "", taskId ?? ""),
        queryFn: async () => {
            if (!projectId || !taskId) return [];
            return openapi.listTaskProgressComponents(projectId, taskId);
        },
        enabled: Boolean(projectId && taskId) && (options?.enabled ?? true),
    });
}

function invalidateTaskWorkLogRelatedQueries(queryClient: ReturnType<typeof useQueryClient>, projectId?: string, taskId?: string) {
    if (!projectId) return;
    if (taskId) {
        queryClient.invalidateQueries({ queryKey: tasksKeys.workLogs(projectId, taskId) });
    }
    queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId), exact: false });
    // Dashboard and S-curve metrics can depend on work logs for hours/cost.
    queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId), exact: false });
    queryClient.invalidateQueries({ queryKey: projectsKeys.all, exact: false });
}

function invalidateTaskProgressQueries(queryClient: ReturnType<typeof useQueryClient>, projectId?: string, taskId?: string) {
    if (!projectId) return;
    if (taskId) {
        queryClient.invalidateQueries({ queryKey: tasksKeys.progressComponents(projectId, taskId) });
    }
    queryClient.invalidateQueries({ queryKey: tasksKeys.byProject(projectId), exact: false });
    queryClient.invalidateQueries({ queryKey: projectsKeys.detail(projectId), exact: false });
    queryClient.invalidateQueries({ queryKey: projectsKeys.all, exact: false });
}

export function useCreateTaskWorkLog(projectId?: string, taskId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: ApiWorkLogCreateRequest) => {
            if (!projectId || !taskId) throw new Error("projectId and taskId are required to create a work log");
            return openapi.createTaskWorkLog(projectId, taskId, payload);
        },
        onSuccess: () => {
            invalidateTaskWorkLogRelatedQueries(queryClient, projectId, taskId);
            toast.success("Work log added");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to add work log: ${message}`);
        },
    });
}

export function useUpdateTaskWorkLog(projectId?: string, taskId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (args: { id: string; payload: ApiWorkLogUpdateRequest }) => {
            if (!projectId || !taskId) throw new Error("projectId and taskId are required to update a work log");
            return openapi.updateTaskWorkLog(projectId, taskId, args.id, args.payload);
        },
        onSuccess: () => {
            invalidateTaskWorkLogRelatedQueries(queryClient, projectId, taskId);
            toast.success("Work log updated");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update work log: ${message}`);
        },
    });
}

export function useDeleteTaskWorkLog(projectId?: string, taskId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            if (!projectId || !taskId) throw new Error("projectId and taskId are required to delete a work log");
            await openapi.deleteTaskWorkLog(projectId, taskId, id);
        },
        onSuccess: () => {
            invalidateTaskWorkLogRelatedQueries(queryClient, projectId, taskId);
            toast.success("Work log deleted");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to delete work log: ${message}`);
        },
    });
}

export function useReplaceTaskProgressComponents(projectId?: string, taskId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: ReplaceTaskProgressComponentsRequest) => {
            if (!projectId || !taskId) throw new Error("projectId and taskId are required to update progress components");
            return openapi.replaceTaskProgressComponents(projectId, taskId, payload);
        },
        onSuccess: () => {
            invalidateTaskProgressQueries(queryClient, projectId, taskId);
            toast.success("Progress components updated");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update progress components: ${message}`);
        },
    });
}

export function useReplaceTaskProgressComponentsForTask(projectId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (args: { taskId: string; payload: ReplaceTaskProgressComponentsRequest }) => {
            if (!projectId || !args.taskId) throw new Error("projectId and taskId are required to update progress components");
            return openapi.replaceTaskProgressComponents(projectId, args.taskId, args.payload);
        },
        onSuccess: (_data, variables) => {
            invalidateTaskProgressQueries(queryClient, projectId, variables.taskId);
            toast.success("Progress components updated");
        },
        onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update progress components: ${message}`);
        },
    });
}

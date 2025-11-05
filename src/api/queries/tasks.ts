import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { openapi } from "@/api/openapiClient";
import type { Task } from "@/types/domain";
import type { TaskCreateRequest, TaskUpdateRequest } from "@/api/openapiClient";
import { toast } from "sonner";
import { isAxiosError } from "axios";

const TASKS_QUERY_KEY = ["tasks"] as const;

export const tasksKeys = {
  all: TASKS_QUERY_KEY,
  byProject: (projectId: string) => [...TASKS_QUERY_KEY, "project", projectId] as const,
};

export function useTasksByProject(projectId: string) {
  return useQuery<Task[]>({
    queryKey: tasksKeys.byProject(projectId),
    queryFn: async () => {
      if (!projectId) return [];
      return openapi.listTasksByProject(projectId);
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
        due_date: payload.dueDate ?? null,
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

      const body: Partial<TaskUpdateRequest> = {
        title: args.payload.name,
        due_date: args.payload.dueDate ?? null,
        status: mapStatusToApi(args.payload.status),
      };
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

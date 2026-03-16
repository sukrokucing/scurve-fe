export type Identifier = string;

export type ProjectStatus = "draft" | "active" | "archived";

export interface Project {
    id: Identifier;
    name: string;
    description?: string;
    status?: ProjectStatus;
    startDate?: string;
    endDate?: string;
    progress?: number;
    theme_color?: string;
}

export type TaskStatus =
    | "todo"
    | "in_progress"
    | "blocked"
    | "done";

export type TaskScheduleStatus =
    | "finished_early"
    | "overdue"
    | "on_time"
    | "not_specified";

export type TaskExecutionStatus =
    | "not_started"
    | "in_progress"
    | "blocked"
    | "completed";

export type TaskHealthStatus =
    | "ahead"
    | "on_track"
    | "at_risk"
    | "critical"
    | "needs_plan";

export type TaskProgressMethod =
    | "manual_percent_legacy"
    | "weighted_components";

export interface Task {
    id: Identifier;
    name: string;
    description?: string;
    status: TaskStatus;
    executionStatus?: TaskExecutionStatus;
    projectId: Identifier;
    assigneeId?: Identifier;
    startDate?: string | null;
    endDate?: string | null;
    dueDate?: string | null;
    durationDays?: number | null;
    parentId?: Identifier | null;
    progress?: number;
    actualProgressPct?: number | null;
    expectedProgressPct?: number | null;
    variancePct?: number | null;
    healthStatus?: TaskHealthStatus;
    progressMethod?: TaskProgressMethod;
    taskWeight?: number | null;
    completedAt?: string | null;
    completedAtIsBackfilled?: boolean;
    scheduleStatus?: TaskScheduleStatus;
    createdAt: string;
}

export interface User {
    id: Identifier;
    email: string;
    name?: string;
    avatarUrl?: string;
}

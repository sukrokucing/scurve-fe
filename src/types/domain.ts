export type Identifier = string;

export type ProjectStatus = "draft" | "active" | "archived";

export interface Project {
    id: Identifier;
    name: string;
    description?: string;
    status: ProjectStatus;
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

export interface Task {
    id: Identifier;
    name: string;
    description?: string;
    status: TaskStatus;
    projectId: Identifier;
    assigneeId?: Identifier;
    startDate?: string | null;
    endDate?: string | null;
    dueDate?: string | null;
    durationDays?: number | null;
    parentId?: Identifier | null;
    progress?: number;
    createdAt: string;
}

export interface User {
    id: Identifier;
    email: string;
    name?: string;
    avatarUrl?: string;
}

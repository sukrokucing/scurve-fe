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
  dueDate?: string;
  progress?: number;
}

export interface User {
  id: Identifier;
  email: string;
  name?: string;
  avatarUrl?: string;
}

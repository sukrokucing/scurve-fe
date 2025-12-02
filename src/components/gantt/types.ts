import type { Task as GanttLibTask } from "@rsagiev/gantt-task-react-19";
import type { components } from "@/types/api";

export type Progress = components["schemas"]["Progress"];

export type GanttTask = GanttLibTask & {
    originalId: string; // The original UUID from the API
    progressId?: string; // ID of the progress entry if it exists
    assignee?: string;
};

import type { ApiTaskDependency } from "@/api/openapiClient";

export interface GanttProps {
    tasks: GanttTask[];
    dependencies: ApiTaskDependency[];
    onTaskUpdate: (task: GanttTask) => void;
    onTaskDelete: (task: GanttTask) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
}

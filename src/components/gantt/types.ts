// Custom Gantt Chart Types
// No external library dependencies

export interface GanttTask {
    id: string;
    originalId: string; // API UUID
    name: string;
    start: Date;
    end: Date;
    progress: number; // 0-100
    type: 'task' | 'milestone' | 'project';
    dependencies: string[]; // Array of task IDs this task depends on
    progressId?: string;
    assignee?: string;
    isDisabled?: boolean;
    duration?: number;
    status?: string;
    styles?: {
        progressColor?: string;
        backgroundColor?: string;
    };
}

export interface GanttDependency {
    id: string;
    source_task_id: string;
    target_task_id: string;
    type_: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
}

export interface GanttProps {
    tasks: GanttTask[];
    dependencies: GanttDependency[];
    onTaskUpdate: (task: GanttTask) => void;
    onTaskDelete: (task: GanttTask) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
    onTaskDoubleClick?: (task: GanttTask) => void;
}

export type ViewMode = 'day' | 'week' | 'month';

export interface DateRange {
    start: Date;
    end: Date;
}

export interface ViewColumn {
    date: Date;
    label: string;
    isWeekend: boolean;
    isToday: boolean;
}

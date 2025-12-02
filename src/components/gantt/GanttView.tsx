import { useState, useEffect } from "react";
import { ViewMode } from "@rsagiev/gantt-task-react-19";
import type { Task as DomainTask } from "@/types/domain";
import type { Progress, GanttTask } from "./types";
import { TaskTable } from "./TaskTable";
import { Timeline } from "./Timeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import type { ApiTaskDependency } from "@/api/openapiClient";

interface GanttViewProps {
    tasks: DomainTask[];
    progress: Progress[];
    dependencies: ApiTaskDependency[];
    onUpdateTask: (task: GanttTask) => void;
    onDeleteTask: (taskId: string) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
    onDoubleClick: (task: GanttTask) => void;
}

export function GanttView({ tasks, progress, dependencies, onUpdateTask, onDeleteTask, onAddDependency, onDeleteDependency, onDoubleClick }: GanttViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
    const [ganttTasks, setGanttTasks] = useState<GanttTask[]>([]);

    // Transform API tasks to Gantt tasks
    useEffect(() => {
        const mappedTasks: GanttTask[] = tasks.map((t) => {
            const taskProgress = progress.find((p) => p.task_id === t.id);

            // Use real start date if available, otherwise fallback to created_at
            const startDate = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);

            // Use real end date if available, otherwise fallback to due_date or start + 1 day
            const endDate = t.endDate
                ? new Date(t.endDate)
                : (t.dueDate ? new Date(t.dueDate) : new Date(startDate.getTime() + 24 * 60 * 60 * 1000));

            // Map dependencies: find tasks that this task depends on (where this task is source)
            const taskDependencies = dependencies
                .filter((d) => d.source_task_id === t.id)
                .map((d) => d.target_task_id);

            const isMilestone = startDate.getTime() === endDate.getTime();

            return {
                start: startDate,
                end: endDate,
                name: t.name,
                id: t.id,
                originalId: t.id,
                progressId: taskProgress?.id,
                type: isMilestone ? "milestone" : "task",
                // Prefer task's own progress field if available (new backend feature), fallback to separate progress entry
                progress: t.progress ?? taskProgress?.progress ?? 0,
                dependencies: taskDependencies,
                isDisabled: false,
                styles: {
                    progressColor: "hsl(var(--primary))",
                    progressSelectedColor: "hsl(var(--primary-dark))",
                    backgroundColor: "hsl(var(--primary) / 0.3)",
                    backgroundSelectedColor: "hsl(var(--primary-dark) / 0.3)",
                },
            };
        });
        setGanttTasks(mappedTasks);
    }, [tasks, progress, dependencies]);

    const handleTaskChange = (task: GanttTask) => {
        setGanttTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
        onUpdateTask(task);
    };

    const [isTableVisible, setIsTableVisible] = useState(true);

    return (
        <div className="flex flex-col gap-4 h-[600px]">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gantt View</h2>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsTableVisible(!isTableVisible)}
                        className="hidden md:flex" // Show on medium screens and up if needed, or remove class to show always
                    >
                        {isTableVisible ? "Hide Table" : "Show Table"}
                    </Button>
                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="View Mode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ViewMode.Day}>Day</SelectItem>
                            <SelectItem value={ViewMode.Week}>Week</SelectItem>
                            <SelectItem value={ViewMode.Month}>Month</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex flex-1 border rounded-xl overflow-hidden glass shadow-sm">
                {/* Split View: Table (Fixed 750px) | Timeline (Flex) */}
                {isTableVisible && (
                    <div className="w-[750px] min-w-[650px] max-w-[850px] border-r bg-background overflow-auto flex-none">
                        <TaskTable
                            tasks={ganttTasks}
                            dependencies={dependencies}
                            onTaskUpdate={handleTaskChange}
                            onTaskDelete={(t) => onDeleteTask(t.originalId)}
                            onAddDependency={onAddDependency}
                            onDeleteDependency={onDeleteDependency}
                        />
                    </div>
                )}
                <div className="flex-1 bg-background overflow-auto min-w-0">
                    {ganttTasks.length > 0 ? (
                        <Timeline
                            key={isTableVisible ? "with-table" : "full-width"}
                            tasks={ganttTasks}
                            viewMode={viewMode}
                            onTaskChange={handleTaskChange}
                            onDoubleClick={onDoubleClick}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">No tasks to display</div>
                    )}
                </div>
            </div>
        </div>
    );
}

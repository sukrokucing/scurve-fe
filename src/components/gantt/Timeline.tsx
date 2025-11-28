import { Gantt, ViewMode, type Task } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { GanttTask } from "./types";

interface TimelineProps {
    tasks: GanttTask[];
    viewMode: ViewMode;
    onTaskChange: (task: GanttTask) => void;
}

export function Timeline({ tasks, viewMode, onTaskChange }: TimelineProps) {
    const handleTaskChange = (task: Task) => {
        // Cast back to GanttTask to preserve custom fields
        const updatedTask = tasks.find((t) => t.id === task.id);
        if (updatedTask) {
            onTaskChange({
                ...updatedTask,
                start: task.start,
                end: task.end,
                progress: task.progress,
            });
        }
    };

    return (
        <div className="w-full h-full min-h-[300px]">
            <Gantt
                tasks={tasks}
                viewMode={viewMode}
                onDateChange={handleTaskChange}
                onProgressChange={handleTaskChange}
                listCellWidth="" // Hide default list
                columnWidth={100}
                barFill={80}
                ganttHeight={400}
                barCornerRadius={4}
                barProgressColor="#14E6AC"
                barProgressSelectedColor="#10b981"
                barBackgroundColor="#e2e8f0"
                barBackgroundSelectedColor="#cbd5e1"
            />
        </div>
    );
}

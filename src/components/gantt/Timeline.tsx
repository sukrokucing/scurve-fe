import { Gantt, ViewMode, type Task } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { GanttTask } from "./types";

interface TimelineProps {
    tasks: GanttTask[];
    viewMode: ViewMode;
    onTaskChange: (task: GanttTask) => void;
    onDoubleClick: (task: GanttTask) => void;
}

export function Timeline({ tasks, viewMode, onTaskChange, onDoubleClick }: TimelineProps) {
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

    const handleDoubleClick = (task: Task) => {
        const originalTask = tasks.find((t) => t.id === task.id);
        if (originalTask) {
            onDoubleClick(originalTask);
        }
    };

    return (
        <div className="w-full h-full min-h-[300px]">
            <Gantt
                tasks={tasks}
                viewMode={viewMode}
                onDateChange={handleTaskChange}
                onProgressChange={handleTaskChange}
                onDoubleClick={handleDoubleClick}
                listCellWidth="" // Hide default list
                columnWidth={100}
                barFill={80}
                ganttHeight={0} // 0 lets it fill the container
                headerHeight={50}
                rowHeight={50}
                barCornerRadius={4}
                barProgressColor="#14E6AC"
                barProgressSelectedColor="#10b981"
                barBackgroundColor="#e2e8f0"
                barBackgroundSelectedColor="#cbd5e1"
            />
        </div>
    );
}

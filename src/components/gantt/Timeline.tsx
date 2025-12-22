import { Gantt, ViewMode, type Task } from "@rsagiev/gantt-task-react-19";
import "@rsagiev/gantt-task-react-19/dist/index.css";
import "./gantt.css";
import type { GanttTask } from "./types";
import { format } from "date-fns";

interface TimelineProps {
    tasks: GanttTask[];
    viewMode: ViewMode;
    onTaskChange: (task: GanttTask) => void;
    onDoubleClick: (task: GanttTask) => void;
}

const StandardTooltipContent = ({ task, fontSize, fontFamily }: { task: Task; fontSize: string; fontFamily: string }) => {
    return (
        <div
            className="bg-popover text-popover-foreground border rounded-md shadow-md p-3 text-xs z-50 min-w-[150px]"
            style={{ fontSize, fontFamily }}
        >
            <div className="font-semibold mb-2 text-sm">{task.name}</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                <span>Start:</span>
                <span className="text-foreground font-medium">{format(task.start, "MMM d, yyyy")}</span>
                <span>End:</span>
                <span className="text-foreground font-medium">{format(task.end, "MMM d, yyyy")}</span>
                <span>Progress:</span>
                <span className="text-foreground font-medium">{task.progress}%</span>
            </div>
        </div>
    );
};


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
        <div className="w-full h-full min-h-[300px] gantt-container">
            <Gantt
                tasks={tasks}
                viewMode={viewMode}
                onDateChange={handleTaskChange}
                onProgressChange={handleTaskChange}
                onDoubleClick={handleDoubleClick}
                listCellWidth="" // Hide default list
                columnWidth={viewMode === ViewMode.Month ? 300 : 100}
                barFill={60}
                ganttHeight={0} // 0 lets it fill the container
                headerHeight={60}
                rowHeight={50}
                barCornerRadius={6}
                barProgressColor="hsl(var(--primary-foreground))"
                barProgressSelectedColor="hsl(var(--primary-foreground))"
                barBackgroundColor="hsl(var(--muted))"
                barBackgroundSelectedColor="hsl(var(--muted))"
                projectProgressColor="hsl(var(--primary))"
                projectBackgroundColor="hsl(var(--muted))"
                projectBackgroundSelectedColor="hsl(var(--muted))"
                arrowColor="hsl(var(--muted-foreground))"
                todayColor="hsl(var(--muted) / 0.3)"
                TooltipContent={StandardTooltipContent}
                fontFamily="inherit"
                fontSize="12px"
            />
        </div>
    );
}

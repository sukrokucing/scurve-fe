import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Gantt, ViewMode, type Task } from "@rsagiev/gantt-task-react-19";
import "@rsagiev/gantt-task-react-19/dist/index.css";
import "./gantt.css";
import type { GanttTask } from "./types";
import { format } from "date-fns";

interface VirtualizedTimelineProps {
    tasks: GanttTask[];
    viewMode: ViewMode;
    onTaskChange: (task: GanttTask) => void;
    onDoubleClick: (task: GanttTask) => void;
}

const StandardTooltipContent = ({ task }: { task: Task; fontSize: string; fontFamily: string }) => {
    return (
        <div className="bg-popover text-popover-foreground border rounded-md shadow-md p-3 text-xs z-50 min-w-[150px]">
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

const ROW_HEIGHT = 50;
const OVERSCAN = 5; // Render 5 extra rows above/below viewport

export function VirtualizedTimeline({ tasks, viewMode, onTaskChange, onDoubleClick }: VirtualizedTimelineProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Setup virtualizer
    const virtualizer = useVirtualizer({
        count: tasks.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: OVERSCAN,
    });

    const virtualRows = virtualizer.getVirtualItems();
    const totalHeight = virtualizer.getTotalSize();

    // Get visible tasks based on virtual rows
    const visibleTasks = virtualRows.map(row => tasks[row.index]);

    // For proper timeline rendering, we need to include boundary tasks
    // This ensures the date range is calculated correctly
    const tasksForGantt = tasks.length > 0 && visibleTasks.length > 0 ? [
        tasks[0], // First task for timeline start calculation
        ...visibleTasks,
        tasks[tasks.length - 1] // Last task for timeline end calculation
    ].filter((task, index, self) =>
        // Remove duplicates (in case first/last are already in visibleTasks)
        self.findIndex(t => t.id === task.id) === index
    ) : visibleTasks;

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

    // If no tasks or very few tasks, don't virtualize
    if (tasks.length < 20) {
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
                    ganttHeight={tasks.length * ROW_HEIGHT + 60} // Include header height
                    headerHeight={60}
                    rowHeight={ROW_HEIGHT}
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

    // Virtualized rendering for large datasets
    return (
        <div
            ref={containerRef}
            className="w-full h-full min-h-[300px] overflow-auto gantt-container"
            style={{
                position: 'relative',
            }}
        >
            {/* Virtual scrollable area */}
            <div
                style={{
                    height: `${totalHeight}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {/* Positioned content at virtual offset */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRows[0]?.start ?? 0}px)`,
                        willChange: 'transform',
                    }}
                >
                    <Gantt
                        tasks={tasksForGantt}
                        viewMode={viewMode}
                        onDateChange={handleTaskChange}
                        onProgressChange={handleTaskChange}
                        onDoubleClick={handleDoubleClick}
                        listCellWidth="" // Hide default list
                        columnWidth={viewMode === ViewMode.Month ? 300 : 100}
                        barFill={60}
                        ganttHeight={virtualRows.length * ROW_HEIGHT}
                        headerHeight={60}
                        rowHeight={ROW_HEIGHT}
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
            </div>
        </div>
    );
}

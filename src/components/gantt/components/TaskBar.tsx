// Task bar component with progress indicator
import { memo, useCallback } from 'react';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { TASK_BAR_HEIGHT, TASK_BAR_RADIUS, TASK_BAR_MARGIN } from '../constants';

import { dateToX, getColumnWidth } from '../utils/positionUtils';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';


interface TaskBarProps {
    task: GanttTask;
    rowStart: number; // Pixel position from virtualRow.start
    dateRange: DateRange;
    viewMode: ViewMode;
    isSelected?: boolean;
    onSelect?: (task: GanttTask) => void;
    onDoubleClick?: (task: GanttTask) => void;
    onDragStart?: (task: GanttTask, handle: 'move' | 'left' | 'right', e: React.PointerEvent) => void;
}

export const TaskBar = memo(function TaskBar({
    task,
    rowStart,
    dateRange,
    viewMode,
    isSelected,
    onSelect,
    onDoubleClick,
    onDragStart,
}: TaskBarProps) {
    // Remove unused state
    // const [isHovered, setIsHovered] = useState(false);

    // Calculate position
    const startX = dateToX(task.start, dateRange.start, viewMode);
    const endX = dateToX(task.end, dateRange.start, viewMode);
    const columnWidth = getColumnWidth(viewMode);

    // Ensure minimum width of 1 day for visibility
    const minWidth = columnWidth;
    const width = Math.max(endX - startX, minWidth);

    // Handle for milestones (zero-duration tasks)
    const isMilestone = task.type === 'milestone' ||
        (task.start.getTime() === task.end.getTime());

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return; // Only left click

        onSelect?.(task);

        // Determine resize handle or move
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const handleWidth = 10;

        let handle: 'move' | 'left' | 'right' = 'move';
        if (relativeX <= handleWidth) {
            handle = 'left';
        } else if (relativeX >= rect.width - handleWidth) {
            handle = 'right';
        }

        onDragStart?.(task, handle, e);
    }, [task, onSelect, onDragStart]);

    const handleDoubleClick = useCallback(() => {
        onDoubleClick?.(task);
    }, [task, onDoubleClick]);

    if (isMilestone) {
        // Render milestone as diamond
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            className={cn(
                                "absolute cursor-pointer transition-transform hover:scale-110",
                                isSelected && "ring-2 ring-ring ring-offset-1"
                            )}
                            style={{
                                left: startX - 10,
                                top: rowStart + TASK_BAR_MARGIN + (TASK_BAR_HEIGHT / 2) - 10,
                                width: 20,
                                height: 20,
                                transform: 'rotate(45deg)',
                                backgroundColor: 'hsl(var(--primary))',
                                borderRadius: 3,
                            }}
                            onPointerDown={handlePointerDown}
                            onDoubleClick={handleDoubleClick}
                        />
                    </TooltipTrigger>
                    <TooltipContent>
                        <TaskTooltip task={task} />
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "absolute cursor-move group",
                            task.isCritical
                                ? "bg-orange-600 hover:bg-orange-700 shadow-[0_0_15px_rgba(234,88,12,0.4)] border border-orange-400"
                                : "bg-primary hover:bg-primary/90",
                            "transition-all duration-200",
                            isSelected && "ring-2 ring-ring ring-offset-1"
                        )}
                        style={{
                            left: startX,
                            top: rowStart + TASK_BAR_MARGIN,
                            width: width,
                            height: TASK_BAR_HEIGHT,
                            borderRadius: TASK_BAR_RADIUS,
                        }}
                        onPointerDown={handlePointerDown}
                        onDoubleClick={handleDoubleClick}
                    >
                        {/* Progress fill */}
                        <div
                            className="absolute inset-y-0 left-0 bg-primary-foreground/30 rounded-l-md transition-all"
                            style={{
                                width: `${Math.min(100, Math.max(0, task.progress))}%`,
                                borderRadius: task.progress >= 100 ? TASK_BAR_RADIUS : `${TASK_BAR_RADIUS}px 0 0 ${TASK_BAR_RADIUS}px`,
                            }}
                        />

                        {/* Task name */}
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                            <span className="text-xs font-medium text-primary-foreground truncate">
                                {task.name}
                            </span>
                        </div>

                        {/* Resize handles (visible on hover) */}
                        <div
                            className={cn(
                                "absolute left-0 inset-y-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100",
                                "bg-primary-foreground/20 transition-opacity rounded-l-md"
                            )}
                        />
                        <div
                            className={cn(
                                "absolute right-0 inset-y-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100",
                                "bg-primary-foreground/20 transition-opacity rounded-r-md"
                            )}
                        />
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <TaskTooltip task={task} />
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});

// Tooltip content for task details
function TaskTooltip({ task }: { task: GanttTask }) {
    return (
        <div className="text-xs space-y-1">
            <div className="font-semibold">{task.name}</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 text-muted-foreground">
                <span>Start:</span>
                <span className="text-foreground">{format(task.start, 'MMM d, yyyy')}</span>
                <span>End:</span>
                <span className="text-foreground">{format(task.end, 'MMM d, yyyy')}</span>
                <span>Progress:</span>
                <span className="text-foreground">{task.progress}%</span>
            </div>
        </div>
    );
}

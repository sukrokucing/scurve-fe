// Task bar component with progress indicator.
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { TASK_BAR_HEIGHT, TASK_BAR_RADIUS, TASK_BAR_MARGIN } from '../constants';

import { dateToX, getColumnWidth } from '../utils/positionUtils';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';


interface TaskBarProps {
    task: GanttTask;
    rowStart: number; // Pixel position from virtualRow.start.
    dateRange: DateRange;
    viewMode: ViewMode;
    editMode?: boolean;
    showProgress?: boolean;
    allowProgressEdit?: boolean;
    allowTaskMove?: boolean;
    allowTaskResize?: boolean;
    isSelected?: boolean;
    onSelect?: (task: GanttTask) => void;
    onDoubleClick?: (task: GanttTask) => void;
    onDragStart?: (task: GanttTask, handle: 'move' | 'left' | 'right', e: React.PointerEvent) => void;
    onProgressUpdate?: (task: GanttTask, progress: number) => void;
    previewLeftDeltaPx?: number;
    previewWidthDeltaPx?: number;
}

export const TaskBar = memo(function TaskBar({
    task,
    rowStart,
    dateRange,
    viewMode,
    editMode = true,
    showProgress = true,
    allowProgressEdit = true,
    allowTaskMove = true,
    allowTaskResize = true,
    isSelected,
    onSelect,
    onDoubleClick,
    onDragStart,
    onProgressUpdate,
    previewLeftDeltaPx = 0,
    previewWidthDeltaPx = 0,
}: TaskBarProps) {
    // Calculate position.
    const startX = dateToX(task.start, dateRange.start, viewMode);
    const endX = dateToX(task.end, dateRange.start, viewMode);
    const columnWidth = getColumnWidth(viewMode);

    // Ensure minimum width of 1 day for visibility.
    const minWidth = columnWidth;
    const width = Math.max(endX - startX, minWidth);
    const renderedLeft = startX + previewLeftDeltaPx;
    const renderedWidth = Math.max(minWidth, width + previewWidthDeltaPx);

    // Handle for milestones (zero-duration tasks).
    const isMilestone = task.type === 'milestone' ||
        (task.start.getTime() === task.end.getTime());
    const canMoveTask = editMode && allowTaskMove;
    const canResizeTask = editMode && allowTaskResize;
    const canEditProgress = editMode && showProgress && allowProgressEdit && !isMilestone && Boolean(onProgressUpdate);

    const taskBarRef = useRef<HTMLDivElement | null>(null);
    const [previewProgress, setPreviewProgress] = useState<number | null>(null);
    const previewProgressRef = useRef<number | null>(null);

    useEffect(() => {
        previewProgressRef.current = previewProgress;
    }, [previewProgress]);

    useEffect(() => {
        // Reset preview when task identity/real progress changes.
        setPreviewProgress(null);
        previewProgressRef.current = null;
    }, [task.id, task.progress]);

    const effectiveProgress = Math.max(0, Math.min(100, previewProgress ?? task.progress));
    const progressHandleSizePx = 14;
    const progressHandleLeftPx = Math.max(
        0,
        Math.min(
            Math.max(0, renderedWidth - progressHandleSizePx),
            ((effectiveProgress / 100) * renderedWidth) - (progressHandleSizePx / 2),
        ),
    );

    const startTaskDrag = useCallback((e: React.PointerEvent, requestedHandle: 'move' | 'left' | 'right' = 'move') => {
        if (e.button !== 0) return;

        onSelect?.(task);
        if (!editMode) return;

        let handle: 'move' | 'left' | 'right' = requestedHandle;
        if ((handle === 'left' || handle === 'right') && !canResizeTask) {
            if (!canMoveTask) return;
            handle = 'move';
        }

        if (handle === 'move' && !canMoveTask) return;
        onDragStart?.(task, handle, e);
    }, [task, onSelect, editMode, canResizeTask, canMoveTask, onDragStart]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return; // Only left click.

        // Determine resize handle or move.
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const handleWidth = 12;

        let handle: 'move' | 'left' | 'right' = 'move';
        if (relativeX <= handleWidth) handle = 'left';
        else if (relativeX >= rect.width - handleWidth) handle = 'right';

        startTaskDrag(e, handle);
    }, [startTaskDrag]);

    const handleResizePointerDown = useCallback((e: React.PointerEvent, side: 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation();
        startTaskDrag(e, side);
    }, [startTaskDrag]);

    const handleDoubleClick = useCallback(() => {
        onDoubleClick?.(task);
    }, [task, onDoubleClick]);

    const handleProgressPointerDown = useCallback((e: React.PointerEvent) => {
        if (!canEditProgress || !onProgressUpdate || !taskBarRef.current) return;
        if (e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();
        onSelect?.(task);

        const handleElement = e.currentTarget as HTMLElement;
        const pointerId = e.pointerId;
        let previewRafId: number | null = null;
        let pendingPreviewProgress: number | null = null;

        const flushPreviewProgress = () => {
            if (pendingPreviewProgress === null) return;
            const next = pendingPreviewProgress;
            pendingPreviewProgress = null;
            setPreviewProgress(next);
            previewProgressRef.current = next;
        };

        const updateFromClientX = (clientX: number, immediate = false) => {
            const bar = taskBarRef.current;
            if (!bar) return;
            const rect = bar.getBoundingClientRect();
            if (rect.width <= 0) return;

            const ratio = (clientX - rect.left) / rect.width;
            const next = Math.max(0, Math.min(100, ratio * 100));
            if (immediate) {
                setPreviewProgress(next);
                previewProgressRef.current = next;
                return;
            }

            pendingPreviewProgress = next;
            if (previewRafId === null) {
                previewRafId = requestAnimationFrame(() => {
                    previewRafId = null;
                    flushPreviewProgress();
                });
            }
        };

        updateFromClientX(e.clientX);

        const finish = (clientX?: number) => {
            if (previewRafId !== null) {
                cancelAnimationFrame(previewRafId);
                previewRafId = null;
            }

            if (typeof clientX === 'number') {
                updateFromClientX(clientX, true);
            } else {
                flushPreviewProgress();
            }

            const finalProgress = Math.round(previewProgressRef.current ?? task.progress);
            setPreviewProgress(null);
            previewProgressRef.current = null;

            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
            handleElement.removeEventListener('lostpointercapture', handleLostCapture);

            try {
                if (handleElement.hasPointerCapture(pointerId)) {
                    handleElement.releasePointerCapture(pointerId);
                }
            } catch {
                // Ignore capture release failures.
            }

            if (finalProgress !== Math.round(task.progress)) {
                onProgressUpdate(task, finalProgress);
            }
        };

        const handlePointerMove = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            updateFromClientX(ev.clientX);
        };

        const handlePointerUp = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            finish(ev.clientX);
        };

        const handlePointerCancel = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            finish();
        };

        const handleLostCapture = () => {
            finish();
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
        handleElement.addEventListener('lostpointercapture', handleLostCapture);

        try {
            handleElement.setPointerCapture(pointerId);
        } catch {
            // Keep drag behavior even if pointer capture isn't granted.
        }
    }, [canEditProgress, onProgressUpdate, onSelect, task]);

    if (isMilestone) {
        // Render milestone as diamond.
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div
                            className={cn(
                                "absolute transition-transform hover:scale-110",
                                canMoveTask ? "cursor-move" : "cursor-pointer",
                                isSelected && "ring-2 ring-ring ring-offset-1"
                            )}
                            style={{
                                left: startX - 10 + previewLeftDeltaPx,
                                top: rowStart + TASK_BAR_MARGIN + (TASK_BAR_HEIGHT / 2) - 10,
                                width: 20,
                                height: 20,
                                transform: 'rotate(45deg)',
                                backgroundColor: 'hsl(var(--primary))',
                                borderRadius: 3,
                            }}
                            onPointerDown={handlePointerDown}
                            onDoubleClick={handleDoubleClick}
                            data-testid="gantt-task-bar"
                            data-task-id={task.id}
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
                        ref={taskBarRef}
                        className={cn(
                            "absolute group",
                            canMoveTask ? "cursor-move" : canResizeTask ? "cursor-ew-resize" : "cursor-pointer",
                            task.isCritical
                                ? "bg-orange-600 hover:bg-orange-700 shadow-[0_0_15px_rgba(234,88,12,0.4)] border border-orange-400"
                                : "bg-primary hover:bg-primary/90",
                            "transition-colors duration-150",
                            isSelected && "ring-2 ring-ring ring-offset-1"
                        )}
                        style={{
                            left: renderedLeft,
                            top: rowStart + TASK_BAR_MARGIN,
                            width: renderedWidth,
                            height: TASK_BAR_HEIGHT,
                            borderRadius: TASK_BAR_RADIUS,
                        }}
                        onPointerDown={handlePointerDown}
                        onDoubleClick={handleDoubleClick}
                        data-testid="gantt-task-bar"
                        data-task-id={task.id}
                    >
                        {showProgress && (
                            <div
                                className={cn(
                                    "absolute inset-y-0 left-0 bg-primary-foreground/30 rounded-l-md",
                                    previewProgress === null ? "transition-[width] duration-150" : "transition-none"
                                )}
                                style={{
                                    width: `${effectiveProgress}%`,
                                    borderRadius: effectiveProgress >= 100 ? TASK_BAR_RADIUS : `${TASK_BAR_RADIUS}px 0 0 ${TASK_BAR_RADIUS}px`,
                                }}
                                data-testid="gantt-task-progress-fill"
                                data-task-id={task.id}
                            />
                        )}

                        {/* Task name */}
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                            <span className="text-xs font-medium text-primary-foreground truncate">
                                {task.name}
                            </span>
                        </div>

                        {/* Resize handles (persistently visible for selected rows). */}
                        {canResizeTask && (
                            <>
                                <div
                                    className={cn(
                                        "absolute left-0 inset-y-0 w-3 cursor-ew-resize transition-opacity rounded-l-md",
                                        isSelected ? "opacity-100" : (canMoveTask ? "opacity-0 group-hover:opacity-100" : "opacity-80"),
                                        "bg-primary-foreground/20"
                                    )}
                                    onPointerDown={(e) => handleResizePointerDown(e, 'left')}
                                    data-testid="gantt-task-resize-left"
                                    data-task-id={task.id}
                                />
                                <div
                                    className={cn(
                                        "absolute right-0 inset-y-0 w-3 cursor-ew-resize transition-opacity rounded-r-md",
                                        isSelected ? "opacity-100" : (canMoveTask ? "opacity-0 group-hover:opacity-100" : "opacity-80"),
                                        "bg-primary-foreground/20"
                                    )}
                                    onPointerDown={(e) => handleResizePointerDown(e, 'right')}
                                    data-testid="gantt-task-resize-right"
                                    data-task-id={task.id}
                                />
                            </>
                        )}

                        {canEditProgress && (
                            <button
                                type="button"
                                className={cn(
                                    "absolute -translate-y-1/2 h-3.5 w-3.5 rounded-full border border-primary-foreground/70 bg-primary-foreground shadow-sm",
                                    "transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/80",
                                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                                style={{
                                    left: `${progressHandleLeftPx}px`,
                                    top: '50%',
                                }}
                                onPointerDown={handleProgressPointerDown}
                                onClick={(e) => e.preventDefault()}
                                aria-label={`Adjust progress for ${task.name}`}
                                data-testid="gantt-task-progress-handle"
                                data-task-id={task.id}
                            />
                        )}
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

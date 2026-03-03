// Task bar component with progress indicator.
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { TASK_BAR_HEIGHT, TASK_BAR_RADIUS, TASK_BAR_MARGIN } from '../constants';

import { dateToX, getColumnWidth, xToDate } from '../utils/positionUtils';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    const progressSliderRef = useRef<HTMLDivElement | null>(null);
    const [previewProgress, setPreviewProgress] = useState<number | null>(null);
    const previewProgressRef = useRef<number | null>(null);
    const [isProgressDragging, setIsProgressDragging] = useState(false);
    const [progressPointerPx, setProgressPointerPx] = useState<number | null>(null);
    const showProgressEditor = canEditProgress && (isSelected || isProgressDragging);

    useEffect(() => {
        previewProgressRef.current = previewProgress;
    }, [previewProgress]);

    useEffect(() => {
        // Reset preview when task identity/real progress changes.
        setPreviewProgress(null);
        previewProgressRef.current = null;
        setIsProgressDragging(false);
        setProgressPointerPx(null);
    }, [task.id, task.progress]);

    const effectiveProgress = Math.max(0, Math.min(100, previewProgress ?? task.progress));
    const sliderInsetPx = 6;
    const sliderWidthPx = Math.max(1, renderedWidth - (sliderInsetPx * 2));
    const sliderProgressPx = sliderInsetPx + ((effectiveProgress / 100) * sliderWidthPx);
    const renderedEndDate = xToDate(renderedLeft + renderedWidth, dateRange.start, viewMode);
    const isOverdue = !isMilestone && effectiveProgress < 100 && renderedEndDate.getTime() < Date.now();
    const progressHandleSizePx = 14;
    const minProgressHandleLeftPx = sliderInsetPx - (progressHandleSizePx / 2);
    const maxProgressHandleLeftPx = renderedWidth - sliderInsetPx - (progressHandleSizePx / 2);
    const progressHandleLeftPx = Math.max(
        minProgressHandleLeftPx,
        Math.min(
            maxProgressHandleLeftPx,
            sliderProgressPx - (progressHandleSizePx / 2),
        ),
    );
    const progressLabelLeftPx = Math.max(
        20,
        Math.min(renderedWidth - 20, progressPointerPx ?? sliderProgressPx),
    );
    const showProgressValue = isSelected || isProgressDragging;
    const progressLabelTopPx = rowStart <= 20 ? TASK_BAR_HEIGHT + 6 : -28;
    const trackFillClass = isOverdue ? "bg-destructive-foreground/55" : "bg-primary-foreground/55";
    const trackBackgroundClass = isOverdue ? "bg-destructive-foreground/25" : "bg-primary-foreground/25";
    const barTextClass = isOverdue ? "text-destructive-foreground" : "text-primary-foreground";
    const thumbBorderClass = isOverdue ? "border-destructive-foreground/70" : "border-primary-foreground/70";
    const thumbBgClass = isOverdue ? "bg-destructive-foreground" : "bg-primary-foreground";
    const focusRingClass = isOverdue ? "focus-visible:ring-destructive-foreground/80" : "focus-visible:ring-primary-foreground/80";

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
        setIsProgressDragging(true);

        const handleElement = e.currentTarget as HTMLElement;
        const pointerId = e.pointerId;
        let previewRafId: number | null = null;
        let pendingPreviewProgress: number | null = null;
        let pendingPointerPx: number | null = null;

        const flushPreviewProgress = () => {
            if (pendingPreviewProgress !== null) {
                const next = pendingPreviewProgress;
                pendingPreviewProgress = null;
                setPreviewProgress(next);
                previewProgressRef.current = next;
            }

            if (pendingPointerPx !== null) {
                setProgressPointerPx(pendingPointerPx);
                pendingPointerPx = null;
            }
        };

        const updateFromClientX = (clientX: number, immediate = false) => {
            const bar = taskBarRef.current;
            if (!bar) return;
            const slider = progressSliderRef.current;
            const rect = slider?.getBoundingClientRect() ?? bar.getBoundingClientRect();
            if (rect.width <= 0) return;

            const clampedClientX = Math.max(rect.left, Math.min(rect.right, clientX));
            const ratio = (clampedClientX - rect.left) / rect.width;
            const next = Math.max(0, Math.min(100, ratio * 100));
            const nextPointerPx = slider
                ? sliderInsetPx + (ratio * sliderWidthPx)
                : ratio * renderedWidth;
            if (immediate) {
                setPreviewProgress(next);
                previewProgressRef.current = next;
                setProgressPointerPx(nextPointerPx);
                return;
            }

            pendingPreviewProgress = next;
            pendingPointerPx = nextPointerPx;
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
            const currentProgress = Math.round(task.progress);

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

            setIsProgressDragging(false);
            setProgressPointerPx(null);

            if (finalProgress !== currentProgress) {
                // Keep the optimistic preview until props catch up from async save.
                setPreviewProgress(finalProgress);
                previewProgressRef.current = finalProgress;
                onProgressUpdate(task, finalProgress);
            } else {
                setPreviewProgress(null);
                previewProgressRef.current = null;
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

        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('pointerup', handlePointerUp, { passive: true });
        window.addEventListener('pointercancel', handlePointerCancel, { passive: true });
        handleElement.addEventListener('lostpointercapture', handleLostCapture);

        try {
            handleElement.setPointerCapture(pointerId);
        } catch {
            // Keep drag behavior even if pointer capture isn't granted.
        }
    }, [canEditProgress, onProgressUpdate, onSelect, renderedWidth, sliderInsetPx, sliderWidthPx, task]);

    if (isMilestone) {
        // Render milestone as diamond.
        return (
            <Tooltip delayDuration={90}>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "absolute z-20 transition-transform hover:scale-110",
                            canMoveTask ? "cursor-move" : "cursor-pointer",
                            isSelected && "ring-2 ring-ring ring-offset-1"
                        )}
                        style={{
                            left: startX - 10 + previewLeftDeltaPx,
                            top: rowStart + TASK_BAR_MARGIN + (TASK_BAR_HEIGHT / 2) - 10,
                            width: 20,
                            height: 20,
                            transform: 'rotate(45deg)',
                            backgroundColor: isOverdue ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                            borderRadius: 3,
                        }}
                        onPointerDown={handlePointerDown}
                        onDoubleClick={handleDoubleClick}
                        data-testid="gantt-task-bar"
                        data-task-id={task.id}
                        data-can-move={canMoveTask ? "true" : "false"}
                        data-can-resize={canResizeTask ? "true" : "false"}
                        data-can-progress-edit={canEditProgress ? "true" : "false"}
                    />
                </TooltipTrigger>
                <TooltipContent>
                    <TaskTooltip task={task} />
                </TooltipContent>
            </Tooltip>
        );
    }

    return (
        <Tooltip delayDuration={40}>
            <TooltipTrigger asChild>
                <div
                    ref={taskBarRef}
                    className={cn(
                        "absolute group",
                        // Keep active/dragged bars above Today line to prevent label overlap while editing.
                        (isSelected || isProgressDragging) ? "z-[60]" : "z-20",
                        canMoveTask ? "cursor-move" : canResizeTask ? "cursor-ew-resize" : "cursor-pointer",
                        isOverdue
                            ? "bg-destructive hover:bg-destructive/90 shadow-[0_0_15px_hsl(var(--destructive)/0.35)] border border-destructive/70"
                            :
                        task.isCritical
                            ? "bg-warning hover:bg-warning/90 shadow-[0_0_15px_hsl(var(--warning)/0.35)] border border-warning/70"
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
                    data-can-move={canMoveTask ? "true" : "false"}
                    data-can-resize={canResizeTask ? "true" : "false"}
                    data-can-progress-edit={canEditProgress ? "true" : "false"}
                >
                        {showProgress && (
                            <div
                                className={cn(
                                    "absolute inset-y-0 left-0 rounded-l-md",
                                    isOverdue ? "bg-destructive-foreground/30" : "bg-primary-foreground/30",
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
                        <div className={cn(
                            "absolute inset-0 flex items-center px-2 overflow-hidden",
                            canEditProgress && "pb-2",
                        )}>
                            <span className={cn("text-xs font-medium truncate", barTextClass)} title={task.name}>
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
                                        isOverdue ? "bg-destructive-foreground/20" : "bg-primary-foreground/20"
                                    )}
                                    onPointerDown={(e) => handleResizePointerDown(e, 'left')}
                                    data-testid="gantt-task-resize-left"
                                    data-task-id={task.id}
                                />
                                <div
                                    className={cn(
                                        "absolute right-0 inset-y-0 w-3 cursor-ew-resize transition-opacity rounded-r-md",
                                        isSelected ? "opacity-100" : (canMoveTask ? "opacity-0 group-hover:opacity-100" : "opacity-80"),
                                        isOverdue ? "bg-destructive-foreground/20" : "bg-primary-foreground/20"
                                    )}
                                    onPointerDown={(e) => handleResizePointerDown(e, 'right')}
                                    data-testid="gantt-task-resize-right"
                                    data-task-id={task.id}
                                />
                            </>
                        )}

                        {showProgressEditor && (
                            <>
                                <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-10 flex justify-center">
                                    <div
                                        ref={progressSliderRef}
                                        className="pointer-events-auto relative h-3 w-[calc(100%-12px)] cursor-ew-resize"
                                        onPointerDown={handleProgressPointerDown}
                                        data-testid="gantt-task-progress-slider"
                                        data-task-id={task.id}
                                    >
                                        <div className={cn("absolute inset-x-0 top-1 h-1 rounded-full", trackBackgroundClass)} />
                                        <div
                                            className={cn(
                                                "absolute left-0 top-1 h-1 rounded-full",
                                                trackFillClass,
                                                previewProgress === null && !isProgressDragging ? "transition-[width] duration-150" : "transition-none",
                                            )}
                                            style={{
                                                width: `${effectiveProgress}%`,
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className={cn(
                                                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border shadow-sm",
                                                thumbBorderClass,
                                                thumbBgClass,
                                                "transition-opacity focus:outline-none focus-visible:ring-2",
                                                focusRingClass,
                                                "opacity-100",
                                            )}
                                            style={{
                                                left: `${progressHandleLeftPx}px`,
                                            }}
                                            onPointerDown={handleProgressPointerDown}
                                            onClick={(e) => e.preventDefault()}
                                            aria-label={`Adjust progress for ${task.name}`}
                                            data-testid="gantt-task-progress-handle"
                                            data-task-id={task.id}
                                        />
                                    </div>
                                </div>
                                {showProgressValue && (
                                    <div
                                        className="pointer-events-none absolute z-50 -translate-x-1/2 rounded border border-border bg-background/95 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm"
                                        style={{ left: `${progressLabelLeftPx}px`, top: `${progressLabelTopPx}px` }}
                                        data-testid="gantt-task-progress-value"
                                        data-task-id={task.id}
                                    >
                                        {Math.round(effectiveProgress)}%
                                    </div>
                                )}
                            </>
                        )}
                </div>
            </TooltipTrigger>
            <TooltipContent>
                <TaskTooltip task={task} />
            </TooltipContent>
        </Tooltip>
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

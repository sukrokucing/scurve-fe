// Drag hooks for task movement and resizing.
import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { addDays, addMonths, addQuarters, addYears } from 'date-fns';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { dateToX, getColumnWidth } from '../utils/positionUtils';

export type DragHandle = 'move' | 'left' | 'right';

interface DragState {
    isDragging: boolean;
    task: GanttTask | null;
    handle: DragHandle;
    startX: number;
    startTask: GanttTask | null;
    startScrollLeft: number;
}

interface UseTaskDragProps {
    tasks: GanttTask[];
    dateRange: DateRange;
    viewMode: ViewMode;
    onTasksUpdate: (tasks: GanttTask[]) => void;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    editMode?: boolean;
    allowTaskMove?: boolean;
    allowTaskResize?: boolean;
    snapToGrid?: boolean;
    smoothDragging?: boolean;
    animationSpeed?: number;
    edgeAutoScroll?: boolean;
    autoScrollThreshold?: number;
    autoScrollSpeed?: number;
}

interface UseTaskDragReturn {
    dragState: DragState;
    handleDragStart: (task: GanttTask, handle: DragHandle, e: React.PointerEvent) => void;
    previewBars: Record<string, { leftDelta: number; widthDelta: number }>;
}

const IDLE_DRAG_STATE: DragState = {
    isDragging: false,
    task: null,
    handle: 'move',
    startX: 0,
    startTask: null,
    startScrollLeft: 0,
};

export function useTaskDrag({
    tasks,
    dateRange,
    viewMode,
    onTasksUpdate,
    scrollContainerRef,
    editMode = true,
    allowTaskMove = true,
    allowTaskResize = true,
    snapToGrid = true,
    smoothDragging = true,
    animationSpeed = 0.25,
    edgeAutoScroll = true,
    autoScrollThreshold = 72,
    autoScrollSpeed = 16,
}: UseTaskDragProps): UseTaskDragReturn {
    const [dragState, setDragState] = useState<DragState>(IDLE_DRAG_STATE);
    const [previewBars, setPreviewBars] = useState<Record<string, { leftDelta: number; widthDelta: number }>>({});

    // Mutable state to track current drag without React commits.
    const currentDrag = useRef<{
        deltaX: number;
        originalTask: GanttTask | null;
        baseWidthPx: number;
        descendants: GanttTask[];
    }>({ deltaX: 0, originalTask: null, baseWidthPx: 0, descendants: [] });

    const pointerXRef = useRef(0);
    const targetDeltaRef = useRef(0);
    const renderedDeltaRef = useRef(0);
    const rafIdRef = useRef<number | null>(null);
    const captureTargetRef = useRef<HTMLElement | null>(null);
    const pointerIdRef = useRef<number | null>(null);

    const columnWidth = getColumnWidth(viewMode);
    const clampedAnimationSpeed = Math.min(1, Math.max(0.05, animationSpeed));
    const clampedThreshold = Math.max(24, autoScrollThreshold);
    const clampedScrollSpeed = Math.max(1, autoScrollSpeed);

    const barsEqual = useCallback(
        (
            previous: Record<string, { leftDelta: number; widthDelta: number }>,
            next: Record<string, { leftDelta: number; widthDelta: number }>
        ) => {
            const previousKeys = Object.keys(previous);
            const nextKeys = Object.keys(next);
            if (previousKeys.length !== nextKeys.length) return false;

            for (const key of nextKeys) {
                const prev = previous[key];
                const nxt = next[key];
                if (!prev || !nxt) return false;
                if (Math.abs(prev.leftDelta - nxt.leftDelta) > 0.25) return false;
                if (Math.abs(prev.widthDelta - nxt.widthDelta) > 0.25) return false;
            }

            return true;
        },
        []
    );

    const clampResizeDelta = useCallback((deltaX: number, handle: DragHandle, baseWidthPx: number) => {
        if (handle === 'left') {
            return Math.min(deltaX, baseWidthPx - columnWidth);
        }
        if (handle === 'right') {
            return Math.max(deltaX, columnWidth - baseWidthPx);
        }
        return deltaX;
    }, [columnWidth]);

    const buildPreviewBars = useCallback((visualDeltaX: number) => {
        const current = currentDrag.current;
        if (!current.originalTask) return {};

        // Quantize preview updates to avoid excessive re-renders while preserving smoothness.
        const normalizedDelta = Math.round(visualDeltaX * 2) / 2;

        if (dragState.handle === 'move') {
            const next: Record<string, { leftDelta: number; widthDelta: number }> = {
                [current.originalTask.id]: { leftDelta: normalizedDelta, widthDelta: 0 },
            };

            current.descendants.forEach((descendant) => {
                next[descendant.id] = { leftDelta: normalizedDelta, widthDelta: 0 };
            });
            return next;
        }

        if (dragState.handle === 'left') {
            const clamped = clampResizeDelta(normalizedDelta, 'left', current.baseWidthPx);
            return {
                [current.originalTask.id]: {
                    leftDelta: clamped,
                    widthDelta: -clamped,
                },
            };
        }

        const clamped = clampResizeDelta(normalizedDelta, 'right', current.baseWidthPx);
        return {
            [current.originalTask.id]: {
                leftDelta: 0,
                widthDelta: clamped,
            },
        };
    }, [clampResizeDelta, dragState.handle]);

    const clearDragRuntime = useCallback(() => {
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }

        const captureTarget = captureTargetRef.current;
        const pointerId = pointerIdRef.current;
        if (captureTarget && pointerId !== null) {
            try {
                if (captureTarget.hasPointerCapture(pointerId)) {
                    captureTarget.releasePointerCapture(pointerId);
                }
            } catch {
                // Ignore release failures (browser already canceled capture).
            }
        }

        captureTargetRef.current = null;
        pointerIdRef.current = null;
        pointerXRef.current = 0;
        targetDeltaRef.current = 0;
        renderedDeltaRef.current = 0;
    }, []);

    const handleDragStart = useCallback((task: GanttTask, handle: DragHandle, e: React.PointerEvent) => {
        if (!editMode) return;
        if (handle === 'move' && !allowTaskMove) return;
        if ((handle === 'left' || handle === 'right') && !allowTaskResize) return;

        e.preventDefault();
        e.stopPropagation();

        clearDragRuntime();

        const captureTarget = e.currentTarget as HTMLElement;
        captureTargetRef.current = captureTarget;
        pointerIdRef.current = e.pointerId;
        pointerXRef.current = e.clientX;

        try {
            captureTarget.setPointerCapture(e.pointerId);
        } catch {
            // Continue without hard pointer capture in browsers that reject it.
        }

        // Initialize mutable state.
        const baseWidthPx = Math.max(
            columnWidth,
            dateToX(task.end, dateRange.start, viewMode) - dateToX(task.start, dateRange.start, viewMode)
        );

        currentDrag.current = {
            deltaX: 0,
            originalTask: { ...task },
            baseWidthPx,
            descendants: handle === 'move' ? findDescendants(task.id, tasks) : [],
        };

        const initialScrollLeft = scrollContainerRef?.current?.scrollLeft ?? 0;

        setDragState({
            isDragging: true,
            task,
            handle,
            startX: e.clientX,
            startTask: { ...task },
            startScrollLeft: initialScrollLeft,
        });
        setPreviewBars({});
    }, [allowTaskMove, allowTaskResize, clearDragRuntime, columnWidth, dateRange.start, editMode, scrollContainerRef, tasks, viewMode]);

    const handleDragMove = useCallback((e: PointerEvent) => {
        if (!dragState.isDragging || !currentDrag.current.originalTask) return;
        pointerXRef.current = e.clientX;
    }, [dragState.isDragging]);

    const applyDragFrame = useCallback(() => {
        if (!dragState.isDragging || !currentDrag.current.originalTask) {
            rafIdRef.current = null;
            return;
        }

        const scrollContainer = scrollContainerRef?.current ?? null;

        if (edgeAutoScroll && scrollContainer) {
            const rect = scrollContainer.getBoundingClientRect();
            const pointerX = pointerXRef.current;
            let scrollDelta = 0;

            if (pointerX > rect.right - clampedThreshold) {
                const proximity = Math.min(1, (pointerX - (rect.right - clampedThreshold)) / clampedThreshold);
                scrollDelta = clampedScrollSpeed * proximity;
            } else if (pointerX < rect.left + clampedThreshold) {
                const proximity = Math.min(1, ((rect.left + clampedThreshold) - pointerX) / clampedThreshold);
                scrollDelta = -clampedScrollSpeed * proximity;
            }

            if (scrollDelta !== 0) {
                const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
                const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, scrollContainer.scrollLeft + scrollDelta));
                scrollContainer.scrollLeft = nextScrollLeft;
            }
        }

        const currentScrollLeft = scrollContainer?.scrollLeft ?? dragState.startScrollLeft;
        const scrollCompensation = currentScrollLeft - dragState.startScrollLeft;
        const targetDelta = (pointerXRef.current - dragState.startX) + scrollCompensation;

        targetDeltaRef.current = targetDelta;
        currentDrag.current.deltaX = targetDelta;

        const nextRenderedDelta = smoothDragging
            ? renderedDeltaRef.current + ((targetDelta - renderedDeltaRef.current) * clampedAnimationSpeed)
            : targetDelta;

        renderedDeltaRef.current = Math.abs(targetDelta - nextRenderedDelta) < 0.25
            ? targetDelta
            : nextRenderedDelta;

        const nextPreview = buildPreviewBars(renderedDeltaRef.current);
        setPreviewBars((previous) => (barsEqual(previous, nextPreview) ? previous : nextPreview));

        rafIdRef.current = requestAnimationFrame(applyDragFrame);
    }, [
        barsEqual,
        buildPreviewBars,
        clampedAnimationSpeed,
        clampedScrollSpeed,
        clampedThreshold,
        dragState.isDragging,
        dragState.startScrollLeft,
        dragState.startX,
        edgeAutoScroll,
        scrollContainerRef,
        smoothDragging,
    ]);

    const handleDragEnd = useCallback(() => {
        if (dragState.isDragging && currentDrag.current.originalTask) {
            const originalTask = currentDrag.current.originalTask;
            const baseWidthPx = currentDrag.current.baseWidthPx;
            const effectiveDeltaX = clampResizeDelta(targetDeltaRef.current, dragState.handle, baseWidthPx);

            // Convert pixel delta to the current view unit to match preview behavior.
            const rawDeltaUnits = effectiveDeltaX / columnWidth;
            const deltaUnits = normalizeDeltaUnits(rawDeltaUnits, viewMode, snapToGrid);

            let newStart = originalTask.start;
            let newEnd = originalTask.end;

            switch (dragState.handle) {
                case 'move':
                    newStart = shiftDateByViewUnits(originalTask.start, deltaUnits, viewMode);
                    newEnd = shiftDateByViewUnits(originalTask.end, deltaUnits, viewMode);
                    break;
                case 'left':
                    newStart = shiftDateByViewUnits(originalTask.start, deltaUnits, viewMode);
                    if (newStart >= originalTask.end) {
                        newStart = addDays(originalTask.end, -1);
                    }
                    break;
                case 'right':
                    newEnd = shiftDateByViewUnits(originalTask.end, deltaUnits, viewMode);
                    if (newEnd <= originalTask.start) {
                        newEnd = addDays(originalTask.start, 1);
                    }
                    break;
            }

            // Only update if changed.
            if (
                newStart.getTime() !== originalTask.start.getTime()
                || newEnd.getTime() !== originalTask.end.getTime()
            ) {
                const updates: GanttTask[] = [
                    {
                        ...originalTask,
                        start: newStart,
                        end: newEnd,
                    },
                ];

                // If moving entire task, move descendants too.
                if (dragState.handle === 'move') {
                    currentDrag.current.descendants.forEach((d) => {
                        updates.push({
                            ...d,
                            start: shiftDateByViewUnits(d.start, deltaUnits, viewMode),
                            end: shiftDateByViewUnits(d.end, deltaUnits, viewMode),
                        });
                    });
                }

                onTasksUpdate(updates);
            }
        }

        setDragState(IDLE_DRAG_STATE);
        setPreviewBars({});
        currentDrag.current = { deltaX: 0, originalTask: null, baseWidthPx: 0, descendants: [] };
        clearDragRuntime();
    }, [clampResizeDelta, clearDragRuntime, columnWidth, dragState.handle, dragState.isDragging, onTasksUpdate, snapToGrid, viewMode]);

    // Attach global pointer lifecycle events when dragging.
    useEffect(() => {
        if (!dragState.isDragging) return undefined;

        const handleCancel = () => handleDragEnd();
        const handleVisibilityChange = () => {
            if (document.hidden) handleCancel();
        };

        window.addEventListener('pointermove', handleDragMove, { passive: true });
        window.addEventListener('pointerup', handleCancel, { passive: true });
        window.addEventListener('pointercancel', handleCancel, { passive: true });
        window.addEventListener('blur', handleCancel);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const captureTarget = captureTargetRef.current;
        captureTarget?.addEventListener('lostpointercapture', handleCancel);

        return () => {
            window.removeEventListener('pointermove', handleDragMove);
            window.removeEventListener('pointerup', handleCancel);
            window.removeEventListener('pointercancel', handleCancel);
            window.removeEventListener('blur', handleCancel);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            captureTarget?.removeEventListener('lostpointercapture', handleCancel);
        };
    }, [dragState.isDragging, handleDragEnd, handleDragMove]);

    // Update drag ghost via RAF to keep movement smooth and synced with auto-scroll.
    useEffect(() => {
        if (!dragState.isDragging) return undefined;

        rafIdRef.current = requestAnimationFrame(applyDragFrame);
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, [applyDragFrame, dragState.isDragging]);

    return {
        dragState,
        handleDragStart,
        previewBars,
    };
}

// Helper to find all tasks that depend on this task (recursively)
function findDescendants(taskId: string, allTasks: GanttTask[], visited = new Set<string>()): GanttTask[] {
    if (visited.has(taskId)) return [];
    visited.add(taskId);

    const descendants: GanttTask[] = [];
    const directChildren = allTasks.filter(t => t.dependencies.includes(taskId));

    for (const child of directChildren) {
        descendants.push(child);
        const nested = findDescendants(child.id, allTasks, visited);
        descendants.push(...nested);
    }

    return descendants;
}

function normalizeDeltaUnits(deltaUnits: number, viewMode: ViewMode, snapToGrid: boolean): number {
    const normalized = snapToGrid ? Math.round(deltaUnits) : deltaUnits;

    // Month-like units must stay discrete to avoid Date overflow/rounding artifacts.
    if (viewMode === 'month' || viewMode === 'quarter' || viewMode === 'year') {
        return Math.round(normalized);
    }

    return normalized;
}

function shiftDateByViewUnits(date: Date, deltaUnits: number, viewMode: ViewMode): Date {
    switch (viewMode) {
        case 'day':
            return addDays(date, deltaUnits);
        case 'week':
            return addDays(date, deltaUnits * 7);
        case 'month':
            return addMonths(date, Math.round(deltaUnits));
        case 'quarter':
            return addQuarters(date, Math.round(deltaUnits));
        case 'year':
            return addYears(date, Math.round(deltaUnits));
        default:
            return addDays(date, deltaUnits);
    }
}

// Drag hooks for task movement and resizing
import { useState, useCallback, useRef, useEffect } from 'react';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { xToDate, dateToX, getColumnWidth } from '../utils/positionUtils';
import { addDays, differenceInDays } from 'date-fns';

export type DragHandle = 'move' | 'left' | 'right';

interface DragState {
    isDragging: boolean;
    task: GanttTask | null;
    handle: DragHandle;
    startX: number;
    startTask: GanttTask | null;
}

interface UseTaskDragProps {
    dateRange: DateRange;
    viewMode: ViewMode;
    onTaskUpdate: (task: GanttTask) => void;
    snapToGrid?: boolean;
}

interface UseTaskDragReturn {
    dragState: DragState;
    handleDragStart: (task: GanttTask, handle: DragHandle, e: React.PointerEvent) => void;
    handleDragMove: (e: PointerEvent) => void;
    handleDragEnd: () => void;
    previewTask: GanttTask | null;
}

export function useTaskDrag({
    dateRange,
    viewMode,
    onTaskUpdate,
    snapToGrid = true,
}: UseTaskDragProps): UseTaskDragReturn {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        task: null,
        handle: 'move',
        startX: 0,
        startTask: null,
    });

    const [previewTask, setPreviewTask] = useState<GanttTask | null>(null);
    const columnWidth = getColumnWidth(viewMode);

    const handleDragStart = useCallback((
        task: GanttTask,
        handle: DragHandle,
        e: React.PointerEvent
    ) => {
        e.preventDefault();
        e.stopPropagation();

        // Capture pointer for tracking outside element
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        setDragState({
            isDragging: true,
            task,
            handle,
            startX: e.clientX,
            startTask: { ...task },
        });
        setPreviewTask({ ...task });
    }, []);

    const handleDragMove = useCallback((e: PointerEvent) => {
        if (!dragState.isDragging || !dragState.startTask) return;

        const deltaX = e.clientX - dragState.startX;

        // Convert pixel delta to days
        let deltaDays = Math.round(deltaX / columnWidth);

        if (!snapToGrid) {
            deltaDays = deltaX / columnWidth;
        }

        const originalTask = dragState.startTask;
        let newStart = originalTask.start;
        let newEnd = originalTask.end;
        const duration = differenceInDays(originalTask.end, originalTask.start);

        switch (dragState.handle) {
            case 'move':
                // Move both start and end
                newStart = addDays(originalTask.start, deltaDays);
                newEnd = addDays(originalTask.end, deltaDays);
                break;
            case 'left':
                // Resize from left (change start only)
                newStart = addDays(originalTask.start, deltaDays);
                // Ensure start doesn't go past end
                if (newStart >= originalTask.end) {
                    newStart = addDays(originalTask.end, -1);
                }
                break;
            case 'right':
                // Resize from right (change end only)
                newEnd = addDays(originalTask.end, deltaDays);
                // Ensure end doesn't go before start
                if (newEnd <= originalTask.start) {
                    newEnd = addDays(originalTask.start, 1);
                }
                break;
        }

        setPreviewTask({
            ...originalTask,
            start: newStart,
            end: newEnd,
        });
    }, [dragState, columnWidth, snapToGrid]);

    const handleDragEnd = useCallback(() => {
        if (previewTask && dragState.isDragging) {
            onTaskUpdate(previewTask);
        }

        setDragState({
            isDragging: false,
            task: null,
            handle: 'move',
            startX: 0,
            startTask: null,
        });
        setPreviewTask(null);
    }, [previewTask, dragState.isDragging, onTaskUpdate]);

    // Attach global pointer events when dragging
    useEffect(() => {
        if (dragState.isDragging) {
            window.addEventListener('pointermove', handleDragMove);
            window.addEventListener('pointerup', handleDragEnd);

            return () => {
                window.removeEventListener('pointermove', handleDragMove);
                window.removeEventListener('pointerup', handleDragEnd);
            };
        }
    }, [dragState.isDragging, handleDragMove, handleDragEnd]);

    return {
        dragState,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        previewTask,
    };
}

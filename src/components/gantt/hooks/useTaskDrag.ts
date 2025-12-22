// Drag hooks for task movement and resizing
// Drag hooks for task movement and resizing
import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';

import type { GanttTask, ViewMode, DateRange } from '../types';
import { getColumnWidth } from '../utils/positionUtils';

import { addDays } from 'date-fns';


export type DragHandle = 'move' | 'left' | 'right';

interface DragState {
    isDragging: boolean;
    task: GanttTask | null;
    handle: DragHandle;
    startX: number;
    startTask: GanttTask | null;
}

interface UseTaskDragProps {
    tasks: GanttTask[];
    dateRange: DateRange;
    viewMode: ViewMode;
    onTasksUpdate: (tasks: GanttTask[]) => void;
    snapToGrid?: boolean;
}

interface UseTaskDragReturn {
    dragState: DragState;
    handleDragStart: (task: GanttTask, handle: DragHandle, e: React.PointerEvent) => void;
    ghostRef: RefObject<HTMLDivElement | null>;
}

export function useTaskDrag({
    tasks,
    viewMode,
    onTasksUpdate,
    snapToGrid = true,
}: UseTaskDragProps): UseTaskDragReturn {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        task: null,
        handle: 'move',
        startX: 0,
        startTask: null,
    });

    // Ref for the ghost element - direct DOM manipulation
    const ghostRef = useRef<HTMLDivElement>(null);

    // Mutable state to track current drag without re-renders
    const currentDrag = useRef<{
        deltaX: number;
        originalTask: GanttTask | null;
    }>({ deltaX: 0, originalTask: null });

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

        // Initialize mutable state
        currentDrag.current = {
            deltaX: 0,
            originalTask: { ...task },
        };

        // Reset ghost transform
        if (ghostRef.current) {
            ghostRef.current.style.transform = 'translate3d(0, 0, 0)';
            ghostRef.current.style.willChange = 'transform';
        }

        setDragState({
            isDragging: true,
            task,
            handle,
            startX: e.clientX,
            startTask: { ...task },
        });
    }, []);

    const handleDragMove = useCallback((e: PointerEvent) => {
        if (!dragState.isDragging || !currentDrag.current.originalTask) return;

        const deltaX = e.clientX - dragState.startX;
        currentDrag.current.deltaX = deltaX;

        // Direct DOM update - Zero React commits
        if (ghostRef.current) {
            ghostRef.current.style.transform = `translate3d(${deltaX}px, 0, 0)`;
        }
    }, [dragState.isDragging, dragState.startX]);

    const handleDragEnd = useCallback(() => {
        if (dragState.isDragging && currentDrag.current.originalTask) {
            const { deltaX, originalTask } = currentDrag.current;

            // Calculate final dates based on total delta
            // Convert pixel delta to days
            let deltaDays = Math.round(deltaX / columnWidth);

            if (!snapToGrid) {
                deltaDays = deltaX / columnWidth;
            }

            let newStart = originalTask.start;
            let newEnd = originalTask.end;

            switch (dragState.handle) {
                case 'move':
                    newStart = addDays(originalTask.start, deltaDays);
                    newEnd = addDays(originalTask.end, deltaDays);
                    break;
                case 'left':
                    newStart = addDays(originalTask.start, deltaDays);
                    if (newStart >= originalTask.end) {
                        newStart = addDays(originalTask.end, -1);
                    }
                    break;
                case 'right':
                    newEnd = addDays(originalTask.end, deltaDays);
                    if (newEnd <= originalTask.start) {
                        newEnd = addDays(originalTask.start, 1);
                    }
                    break;
            }

            // Only update if changed
            if (newStart.getTime() !== originalTask.start.getTime() ||
                newEnd.getTime() !== originalTask.end.getTime()) {

                const updates: GanttTask[] = [];

                // Main task update
                updates.push({
                    ...originalTask,
                    start: newStart,
                    end: newEnd,
                });

                // If moving entire task, move descendants too
                if (dragState.handle === 'move') {
                    const descendants = findDescendants(originalTask.id, tasks);
                    descendants.forEach(d => {
                        updates.push({
                            ...d,
                            start: addDays(d.start, deltaDays),
                            end: addDays(d.end, deltaDays),
                        });
                    });
                }

                onTasksUpdate(updates);
            }
        }

        setDragState({
            isDragging: false,
            task: null,
            handle: 'move',
            startX: 0,
            startTask: null,
        });

        // Reset mutable state
        currentDrag.current = { deltaX: 0, originalTask: null };
    }, [dragState.isDragging, dragState.handle, columnWidth, snapToGrid, onTasksUpdate, tasks]);

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
        ghostRef, // Expose ref instead of previewTask
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

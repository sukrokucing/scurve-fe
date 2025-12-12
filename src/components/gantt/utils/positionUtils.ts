// Position utilities for converting dates to pixels and vice versa
import { differenceInDays, differenceInHours, addDays } from 'date-fns';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { COLUMN_WIDTH, ROW_HEIGHT, TASK_BAR_HEIGHT, TASK_BAR_MARGIN } from '../constants';

/**
 * Get the column width for a specific view mode
 */
export function getColumnWidth(viewMode: ViewMode): number {
    return COLUMN_WIDTH[viewMode];
}

/**
 * Convert a date to X position (pixels from left)
 */
export function dateToX(
    date: Date,
    rangeStart: Date,
    viewMode: ViewMode
): number {
    const columnWidth = getColumnWidth(viewMode);

    switch (viewMode) {
        case 'day':
            // Days from start + fraction of day
            const days = differenceInDays(date, rangeStart);
            const hourFraction = date.getHours() / 24;
            return (days + hourFraction) * columnWidth;
        case 'week':
            // Weeks from start
            return (differenceInDays(date, rangeStart) / 7) * columnWidth;
        case 'month':
            // Approximate months from start
            const startMonth = rangeStart.getFullYear() * 12 + rangeStart.getMonth();
            const dateMonth = date.getFullYear() * 12 + date.getMonth();
            const dayOfMonth = date.getDate() / 30; // Approximation
            return (dateMonth - startMonth + dayOfMonth) * columnWidth;
        default:
            return differenceInDays(date, rangeStart) * columnWidth;
    }
}

/**
 * Convert X position back to a date
 */
export function xToDate(
    x: number,
    rangeStart: Date,
    viewMode: ViewMode
): Date {
    const columnWidth = getColumnWidth(viewMode);

    switch (viewMode) {
        case 'day':
            const days = x / columnWidth;
            return addDays(rangeStart, Math.round(days));
        case 'week':
            const weeks = x / columnWidth;
            return addDays(rangeStart, Math.round(weeks * 7));
        case 'month':
            const months = x / columnWidth;
            return new Date(
                rangeStart.getFullYear(),
                rangeStart.getMonth() + Math.round(months),
                1
            );
        default:
            return addDays(rangeStart, Math.round(x / columnWidth));
    }
}

/**
 * Get task bar position and dimensions
 */
export function getTaskBarPosition(
    task: GanttTask,
    rangeStart: Date,
    viewMode: ViewMode,
    rowIndex: number
): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const columnWidth = getColumnWidth(viewMode);
    const startX = dateToX(task.start, rangeStart, viewMode);
    const endX = dateToX(task.end, rangeStart, viewMode);

    // Minimum width for visibility
    const width = Math.max(endX - startX, 20);

    return {
        x: startX,
        y: rowIndex * ROW_HEIGHT + TASK_BAR_MARGIN,
        width,
        height: TASK_BAR_HEIGHT,
    };
}

/**
 * Get the milestone position (diamond shape)
 */
export function getMilestonePosition(
    task: GanttTask,
    rangeStart: Date,
    viewMode: ViewMode,
    rowIndex: number
): {
    x: number;
    y: number;
    size: number;
} {
    const x = dateToX(task.start, rangeStart, viewMode);

    return {
        x,
        y: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
        size: 20,
    };
}

/**
 * Get total timeline width in pixels
 */
export function getTimelineWidth(
    columnCount: number,
    viewMode: ViewMode
): number {
    return columnCount * getColumnWidth(viewMode);
}

/**
 * Get total timeline height in pixels
 */
export function getTimelineHeight(taskCount: number): number {
    return taskCount * ROW_HEIGHT;
}

/**
 * Snap X position to nearest column boundary (for drag snapping)
 */
export function snapToGrid(x: number, viewMode: ViewMode): number {
    const columnWidth = getColumnWidth(viewMode);
    return Math.round(x / columnWidth) * columnWidth;
}

/**
 * Check if a point is within a task bar
 */
export function isPointInTaskBar(
    px: number,
    py: number,
    taskPosition: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        px >= taskPosition.x &&
        px <= taskPosition.x + taskPosition.width &&
        py >= taskPosition.y &&
        py <= taskPosition.y + taskPosition.height
    );
}

/**
 * Check if point is on left/right resize handle
 */
export function getResizeHandle(
    px: number,
    taskPosition: { x: number; width: number },
    handleWidth: number = 8
): 'left' | 'right' | null {
    if (px <= taskPosition.x + handleWidth) {
        return 'left';
    }
    if (px >= taskPosition.x + taskPosition.width - handleWidth) {
        return 'right';
    }
    return null;
}

// Position utilities for converting dates to pixels and vice versa
import { differenceInDays, addDays, startOfWeek, startOfQuarter, startOfYear } from 'date-fns';
import type { GanttTask, ViewMode } from '../types';

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
        case 'day': {
            // Days from start + fraction of day
            const days = differenceInDays(date, rangeStart);
            const hourFraction = date.getHours() / 24;
            return (days + hourFraction) * columnWidth;
        }
        case 'week': {
            // Weeks from week boundary (must match header generation).
            const weekAnchor = startOfWeek(rangeStart, { weekStartsOn: 1 });
            return (differenceInDays(date, weekAnchor) / 7) * columnWidth;
        }
        case 'month': {
            // Months from month boundary (must match header generation).
            const monthAnchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
            const startMonth = monthAnchor.getFullYear() * 12 + monthAnchor.getMonth();
            const dateMonth = date.getFullYear() * 12 + date.getMonth();
            const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            const dayOfMonth = (date.getDate() - 1 + date.getHours() / 24) / daysInMonth;
            return (dateMonth - startMonth + dayOfMonth) * columnWidth;
        }
        case 'quarter': {
            const quarterAnchor = startOfQuarter(rangeStart);
            const startQuarter = quarterAnchor.getFullYear() * 4 + Math.floor(quarterAnchor.getMonth() / 3);
            const quarterStart = startOfQuarter(date);
            const dateQuarter = quarterStart.getFullYear() * 4 + Math.floor(quarterStart.getMonth() / 3);
            const nextQuarter = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 1);
            const daysInQuarter = Math.max(1, differenceInDays(nextQuarter, quarterStart));
            const dayOfQuarter = differenceInDays(date, quarterStart) + date.getHours() / 24;
            const quarterFraction = dayOfQuarter / daysInQuarter;
            return (dateQuarter - startQuarter + quarterFraction) * columnWidth;
        }
        case 'year': {
            const yearAnchor = startOfYear(rangeStart);
            const yearStart = startOfYear(date);
            const startYear = yearAnchor.getFullYear();
            const dateYear = yearStart.getFullYear();
            const nextYear = new Date(yearStart.getFullYear() + 1, 0, 1);
            const daysInYear = Math.max(1, differenceInDays(nextYear, yearStart));
            const dayOfYear = differenceInDays(date, yearStart) + date.getHours() / 24;
            const yearFraction = dayOfYear / daysInYear;
            return (dateYear - startYear + yearFraction) * columnWidth;
        }
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
        case 'day': {
            const days = x / columnWidth;
            return addDays(rangeStart, Math.round(days));
        }
        case 'week': {
            const weeks = x / columnWidth;
            return addDays(startOfWeek(rangeStart, { weekStartsOn: 1 }), Math.round(weeks * 7));
        }
        case 'month': {
            const months = x / columnWidth;
            const monthAnchor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
            return new Date(
                monthAnchor.getFullYear(),
                monthAnchor.getMonth() + Math.round(months),
                1
            );
        }
        case 'quarter': {
            const quarters = x / columnWidth;
            const quarterAnchor = startOfQuarter(rangeStart);
            return new Date(
                quarterAnchor.getFullYear(),
                quarterAnchor.getMonth() + (Math.round(quarters) * 3),
                1
            );
        }
        case 'year': {
            const years = x / columnWidth;
            const yearAnchor = startOfYear(rangeStart);
            return new Date(yearAnchor.getFullYear() + Math.round(years), 0, 1);
        }
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

    const startX = dateToX(task.start, rangeStart, viewMode);
    const endX = dateToX(task.end, rangeStart, viewMode);

    const isMilestone = task.type === 'milestone' || task.start.getTime() === task.end.getTime();
    const minWidth = isMilestone ? 20 : getColumnWidth(viewMode);
    const width = Math.max(endX - startX, minWidth);

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

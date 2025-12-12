// Date utilities for Gantt chart calculations
import {
    startOfDay,
    endOfDay,
    addDays,
    differenceInDays,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    format,
    isWeekend,
    isToday,
    isSameDay,
    min,
    max,
} from 'date-fns';
import type { GanttTask, ViewMode, DateRange, ViewColumn } from '../types';
import { DEFAULT_RANGE_BEFORE, DEFAULT_RANGE_AFTER } from '../constants';

/**
 * Calculate the date range needed to display all tasks
 * Adds padding before/after for context
 */
export function calculateDateRange(tasks: GanttTask[]): DateRange {
    if (tasks.length === 0) {
        const today = startOfDay(new Date());
        return {
            start: addDays(today, -DEFAULT_RANGE_BEFORE),
            end: addDays(today, DEFAULT_RANGE_AFTER),
        };
    }

    const allDates = tasks.flatMap(t => [t.start, t.end]);
    const minDate = min(allDates);
    const maxDate = max(allDates);

    return {
        start: addDays(startOfDay(minDate), -DEFAULT_RANGE_BEFORE),
        end: addDays(endOfDay(maxDate), DEFAULT_RANGE_AFTER),
    };
}

/**
 * Get the number of columns (time units) in the date range
 */
export function getColumnCount(range: DateRange, viewMode: ViewMode): number {
    switch (viewMode) {
        case 'day':
            return differenceInDays(range.end, range.start) + 1;
        case 'week':
            // Calculate weeks between dates
            return Math.ceil(differenceInDays(range.end, range.start) / 7) + 1;
        case 'month':
            // Calculate months between dates
            const startMonth = range.start.getFullYear() * 12 + range.start.getMonth();
            const endMonth = range.end.getFullYear() * 12 + range.end.getMonth();
            return endMonth - startMonth + 1;
        default:
            return differenceInDays(range.end, range.start) + 1;
    }
}

/**
 * Generate column data for virtualization
 */
export function generateColumns(range: DateRange, viewMode: ViewMode): ViewColumn[] {
    const columns: ViewColumn[] = [];
    const count = getColumnCount(range, viewMode);

    for (let i = 0; i < count; i++) {
        let date: Date;
        let label: string;

        switch (viewMode) {
            case 'day':
                date = addDays(range.start, i);
                label = format(date, 'EEE, d');
                break;
            case 'week':
                date = addDays(startOfWeek(range.start, { weekStartsOn: 1 }), i * 7);
                label = `Week ${format(date, 'I')}`; // 'I' is ISO week number
                break;
            case 'month':
                date = new Date(
                    range.start.getFullYear(),
                    range.start.getMonth() + i,
                    1
                );
                label = format(date, 'MMM yyyy');
                break;
            default:
                date = addDays(range.start, i);
                label = format(date, 'EEE, d');
        }

        columns.push({
            date,
            label,
            isWeekend: viewMode === 'day' && isWeekend(date),
            isToday: viewMode === 'day' && isToday(date),
        });
    }

    return columns;
}

/**
 * Get the date for a specific column index
 */
export function getDateForColumn(
    range: DateRange,
    columnIndex: number,
    viewMode: ViewMode
): Date {
    switch (viewMode) {
        case 'day':
            return addDays(range.start, columnIndex);
        case 'week':
            return addDays(startOfWeek(range.start, { weekStartsOn: 1 }), columnIndex * 7);
        case 'month':
            return new Date(
                range.start.getFullYear(),
                range.start.getMonth() + columnIndex,
                1
            );
        default:
            return addDays(range.start, columnIndex);
    }
}

/**
 * Format date for header display
 */
export function formatHeaderDate(date: Date, viewMode: ViewMode): string {
    switch (viewMode) {
        case 'day':
            return format(date, 'EEE, d');
        case 'week':
            return `Week ${format(date, 'w')}`;
        case 'month':
            return format(date, 'MMM yyyy');
        default:
            return format(date, 'EEE, d');
    }
}

/**
 * Check if a date falls within a date range
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
    return date >= range.start && date <= range.end;
}

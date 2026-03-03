// Background grid for the Gantt timeline
import { memo } from 'react';
import { type VirtualItem } from '@tanstack/react-virtual';
import type { DateRange, ViewMode } from '../types';
import { ROW_HEIGHT, COLUMN_WIDTH } from '../constants';
import { cn } from '@/lib/utils';
import { isToday, isWeekend } from 'date-fns';
import { getDateForColumn } from '../utils/dateUtils';

interface TimelineGridProps {
    virtualColumns: VirtualItem[];
    virtualRows: VirtualItem[];
    dateRange: DateRange;
    viewMode: ViewMode;
    totalWidth: number;
    totalHeight: number;
}

export const TimelineGrid = memo(function TimelineGrid({
    virtualColumns,
    virtualRows,
    dateRange,
    viewMode,
    totalWidth,
    totalHeight,
}: TimelineGridProps) {
    const columnWidth = COLUMN_WIDTH[viewMode];
    const alignedColumnWidth = Math.round(columnWidth);

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: totalWidth, height: totalHeight }}
        >
            {/* Vertical grid lines (column separators) - positioned absolutely */}
            {virtualColumns.map((virtualColumn) => {
                const date = getDateForColumn(dateRange, virtualColumn.index, viewMode);
                const dayWeekend = viewMode === 'day' && isWeekend(date);
                const dayToday = viewMode === 'day' && isToday(date);

                return (
                    <div
                        key={`col-${virtualColumn.key}`}
                        className={cn(
                            "absolute top-0 border-r border-border/30",
                            dayWeekend && "bg-muted/20",
                            dayToday && "bg-primary/5"
                        )}
                        style={{
                            left: Math.round(virtualColumn.start),
                            width: alignedColumnWidth,
                            height: totalHeight,
                        }}
                    />
                );
            })}

            {/* Horizontal grid lines (row separators) - positioned absolutely */}
            {virtualRows.map((virtualRow) => (
                <div
                    key={`row-${virtualRow.key}`}
                    className="absolute left-0 border-b border-border/20"
                    style={{
                        top: Math.round(virtualRow.start),
                        width: totalWidth,
                        height: ROW_HEIGHT,
                    }}
                />
            ))}
        </div>
    );
});

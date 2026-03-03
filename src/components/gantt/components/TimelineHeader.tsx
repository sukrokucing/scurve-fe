// Timeline header with virtualized date columns
import { memo, useMemo } from 'react';
import { type VirtualItem } from '@tanstack/react-virtual';
import type { DateRange, ViewMode } from '../types';
import { HEADER_HEIGHT, COLUMN_WIDTH } from '../constants';
import { cn } from '@/lib/utils';
import { addDays, format, isToday, isWeekend } from 'date-fns';
import { getDateForColumn } from '../utils/dateUtils';

interface TimelineHeaderProps {
    virtualColumns: VirtualItem[];
    dateRange: DateRange;
    viewMode: ViewMode;
    columnCount: number;
    totalWidth: number;
}

export const TimelineHeader = memo(function TimelineHeader({
    virtualColumns,
    dateRange,
    viewMode,
    columnCount,
    totalWidth,
}: TimelineHeaderProps) {
    const columnWidth = COLUMN_WIDTH[viewMode];
    const alignedColumnWidth = Math.round(columnWidth);
    const rowHeight = HEADER_HEIGHT / 2;

    // Generate top-row group labels only for visible range + small buffer.
    const topRowItems = useMemo(() => {
        if (columnCount === 0 || virtualColumns.length === 0) return [];
        const items: { label: string; start: number; width: number; key: string }[] = [];
        const groupLabelForDate = (date: Date) => {
            if (viewMode === 'day' || viewMode === 'week') {
                return format(date, 'MMMM yyyy');
            }
            if (viewMode === 'year') {
                const decadeStart = Math.floor(date.getFullYear() / 10) * 10;
                return `${decadeStart}s`;
            }
            return format(date, 'yyyy');
        };
        const firstVisible = virtualColumns[0]?.index ?? 0;
        const lastVisible = virtualColumns[virtualColumns.length - 1]?.index ?? 0;
        const bufferedStart = Math.max(0, firstVisible - 2);
        const bufferedEnd = Math.min(columnCount - 1, lastVisible + 2);

        let currentLabel = '';
        let groupStart = bufferedStart;

        for (let index = bufferedStart; index <= bufferedEnd; index += 1) {
            const date = getDateForColumn(dateRange, index, viewMode);
            const nextLabel = groupLabelForDate(date);
            if (index === bufferedStart) {
                currentLabel = nextLabel;
                groupStart = bufferedStart;
                continue;
            }

            if (nextLabel !== currentLabel) {
                items.push({
                    label: currentLabel,
                    start: groupStart * columnWidth,
                    width: (index - groupStart) * columnWidth,
                    key: `group-${groupStart}-${index - 1}-${currentLabel}`,
                });
                currentLabel = nextLabel;
                groupStart = index;
            }
        }

        items.push({
            label: currentLabel,
            start: groupStart * columnWidth,
            width: ((bufferedEnd + 1) - groupStart) * columnWidth,
            key: `group-${groupStart}-${bufferedEnd}-${currentLabel}`,
        });

        return items;
    }, [columnCount, dateRange, virtualColumns, viewMode, columnWidth]);

    return (
        <div
            className="sticky top-0 z-50 bg-background border-b shadow-sm"
            style={{ height: HEADER_HEIGHT, width: totalWidth }}
        >
            {/* Top Row: Months/Years */}
            <div className="relative border-b" style={{ width: totalWidth, height: rowHeight }}>
                {topRowItems.map((item) => (
                    <div
                        key={item.key}
                    className="absolute flex items-center px-4 font-semibold text-sm text-foreground bg-background border-r whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{
                            left: Math.round(item.start),
                            width: Math.round(item.width),
                            height: rowHeight,
                        }}
                    >
                        {item.label}
                    </div>
                ))}
            </div>

            {/* Bottom Row: Days/Weeks/Months */}
            <div className="relative" style={{ width: totalWidth, height: rowHeight }}>
                {virtualColumns.map((virtualColumn) => {
                    const date = getDateForColumn(dateRange, virtualColumn.index, viewMode);
                    const dayWeekend = viewMode === 'day' && isWeekend(date);
                    const dayToday = viewMode === 'day' && isToday(date);

                    return (
                        <div
                            key={virtualColumn.key}
                        className={cn(
                            "absolute flex items-center justify-center border-r bg-background",
                            "text-xs font-medium text-muted-foreground",
                            dayWeekend && "bg-muted/50",
                            dayToday && "bg-primary/10 text-primary font-semibold"
                        )}
                        style={{
                            left: Math.round(virtualColumn.start),
                                width: alignedColumnWidth,
                                height: rowHeight,
                            }}
                        >
                            {/* Format label based on view mode */}
                            {viewMode === 'day' && format(date, 'EEE, d')}
                            {viewMode === 'week' && `W${format(date, 'I')} (${format(date, 'd')} - ${format(addDays(date, 6), 'd')})`}
                            {viewMode === 'month' && format(date, 'MMM')}
                            {viewMode === 'quarter' && `Q${Math.floor(date.getMonth() / 3) + 1}`}
                            {viewMode === 'year' && format(date, 'yyyy')}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

// Timeline header with virtualized date columns
import { memo, useMemo } from 'react';
import { type VirtualItem } from '@tanstack/react-virtual';
import type { ViewColumn, ViewMode } from '../types';
import { HEADER_HEIGHT, COLUMN_WIDTH } from '../constants';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';

interface TimelineHeaderProps {
    virtualColumns: VirtualItem[];
    allColumns: ViewColumn[];
    viewMode: ViewMode;
    totalWidth: number;
}

export const TimelineHeader = memo(function TimelineHeader({
    virtualColumns,
    allColumns,
    viewMode,
    totalWidth,
}: TimelineHeaderProps) {
    const columnWidth = COLUMN_WIDTH[viewMode];
    const rowHeight = HEADER_HEIGHT / 2;

    // Generate top row items (groups)
    const topRowItems = useMemo(() => {
        if (allColumns.length === 0) return [];
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

        let currentLabel = '';
        let groupStart = 0;

        allColumns.forEach((column, index) => {
            const nextLabel = groupLabelForDate(column.date);
            if (index === 0) {
                currentLabel = nextLabel;
                groupStart = 0;
                return;
            }

            if (nextLabel !== currentLabel) {
                items.push({
                    label: currentLabel,
                    start: groupStart * columnWidth,
                    width: (index - groupStart) * columnWidth,
                    key: `group-${groupStart}`,
                });
                currentLabel = nextLabel;
                groupStart = index;
            }
        });

        items.push({
            label: currentLabel,
            start: groupStart * columnWidth,
            width: (allColumns.length - groupStart) * columnWidth,
            key: `group-${groupStart}`,
        });

        return items;
    }, [allColumns, viewMode, columnWidth]);

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
                            left: item.start,
                            width: item.width,
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
                    const column = allColumns[virtualColumn.index];
                    if (!column) return null;

                    return (
                        <div
                            key={virtualColumn.key}
                        className={cn(
                            "absolute flex items-center justify-center border-r bg-background",
                            "text-xs font-medium text-muted-foreground",
                            viewMode === 'day' && column.isWeekend && "bg-muted/50",
                            viewMode === 'day' && column.isToday && "bg-primary/10 text-primary font-semibold"
                        )}
                        style={{
                            left: virtualColumn.start,
                                width: columnWidth,
                                height: rowHeight,
                            }}
                        >
                            {/* Format label based on view mode */}
                            {viewMode === 'day' && format(column.date, 'EEE, d')}
                            {viewMode === 'week' && `W${format(column.date, 'I')} (${format(column.date, 'd')} - ${format(addDays(column.date, 6), 'd')})`}
                            {viewMode === 'month' && format(column.date, 'MMM')}
                            {viewMode === 'quarter' && `Q${Math.floor(column.date.getMonth() / 3) + 1}`}
                            {viewMode === 'year' && format(column.date, 'yyyy')}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

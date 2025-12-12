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

    // Calculate visible range for top-row generation
    const visibleRange = useMemo(() => {
        if (virtualColumns.length === 0) return null;
        const firstCol = allColumns[virtualColumns[0].index];
        const lastCol = allColumns[virtualColumns[virtualColumns.length - 1].index];
        if (!firstCol || !lastCol) return null;

        return {
            start: firstCol.date,
            end: lastCol.date
        };
    }, [virtualColumns, allColumns]);

    // Generate top row items (groups)
    const topRowItems = useMemo(() => {
        if (!visibleRange) return [];
        const items: { label: string; start: number; width: number; key: string }[] = [];



        // This logic is complex because 'groups' might start before our visible area.
        // Instead, let's iterate through visible columns and group them dynamically

        let currentGroup: { label: string; startX: number; width: number } | null = null;

        // We need to look at ALL columns to get correct widths, but that's expensive for virtualized.
        // Actually, we can just render the top row based on the virtual columns' data
        // For each virtual column, determine its group.
        // If it's the start of a group OR start of viewport, start a new block.
        // This is tricky with virtualization.

        // Alternative Robust Approach:
        // Use `allColumns` (which isn't virtualized, just the data array) to generate the groups.
        // Since `allColumns` is already calculated, we can just iterate it once.
        // The count shouldn't be massive (a few thousand days max).

        let lastLabel = '';
        let startIdx = 0;

        allColumns.forEach((col, idx) => {
            let label = '';
            if (viewMode === 'day' || viewMode === 'week') {
                label = format(col.date, 'MMMM yyyy');
            } else {
                label = format(col.date, 'yyyy');
            }

            if (label !== lastLabel) {
                if (currentGroup) {
                    items.push({
                        label: currentGroup.label,
                        start: currentGroup.startX,
                        width: (idx - startIdx) * columnWidth,
                        key: `group-${startIdx}`
                    });
                }
                lastLabel = label;
                startIdx = idx;
                currentGroup = { label, startX: idx * columnWidth, width: 0 };
            }
        });

        // Push last group
        if (currentGroup) {
            items.push({
                label: currentGroup.label,
                start: currentGroup.startX,
                width: (allColumns.length - startIdx) * columnWidth,
                key: `group-${startIdx}`
            });
        }

        return items;

    }, [allColumns, viewMode, columnWidth, visibleRange]);

    // Filter top row items to only those visible (optional, but good for perf)
    const visibleTopRow = topRowItems; // CSS clipping handles the rest mostly

    return (
        <div
            className="sticky top-0 z-50 bg-background border-b shadow-sm"
            style={{ height: HEADER_HEIGHT, width: totalWidth }}
        >
            {/* Top Row: Months/Years */}
            <div className="relative border-b" style={{ width: totalWidth, height: rowHeight }}>
                {visibleTopRow.map((item) => (
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
                                column.isWeekend && "bg-muted/50",
                                column.isToday && "bg-primary/10 text-primary font-semibold"
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
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

// Background grid for the Gantt timeline
import { memo } from 'react';
import { type VirtualItem } from '@tanstack/react-virtual';
import type { ViewColumn, ViewMode } from '../types';
import { ROW_HEIGHT, COLUMN_WIDTH } from '../constants';
import { cn } from '@/lib/utils';

interface TimelineGridProps {
    virtualColumns: VirtualItem[];
    virtualRows: VirtualItem[];
    allColumns: ViewColumn[];
    viewMode: ViewMode;
    totalWidth: number;
    totalHeight: number;
}

export const TimelineGrid = memo(function TimelineGrid({
    virtualColumns,
    virtualRows,
    allColumns,
    viewMode,
    totalWidth,
    totalHeight,
}: TimelineGridProps) {
    const columnWidth = COLUMN_WIDTH[viewMode];

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: totalWidth, height: totalHeight }}
        >
            {/* Vertical grid lines (column separators) - positioned absolutely */}
            {virtualColumns.map((virtualColumn) => {
                const column = allColumns[virtualColumn.index];
                if (!column) return null;

                return (
                    <div
                        key={`col-${virtualColumn.key}`}
                        className={cn(
                            "absolute top-0 border-r border-border/30",
                            column.isWeekend && "bg-muted/20",
                            column.isToday && "bg-primary/5"
                        )}
                        style={{
                            left: virtualColumn.start,
                            width: columnWidth,
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
                        top: virtualRow.start,
                        width: totalWidth,
                        height: ROW_HEIGHT,
                    }}
                />
            ))}
        </div>
    );
});

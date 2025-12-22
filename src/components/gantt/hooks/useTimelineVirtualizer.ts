// Virtualization hooks for horizontal (columns) and vertical (rows) scrolling
import { useMemo, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { ROW_HEIGHT, COLUMN_WIDTH, OVERSCAN_ROWS, OVERSCAN_COLUMNS } from '../constants';

interface UseTimelineVirtualizerProps {
    containerRef: RefObject<HTMLDivElement>;
    tasks: GanttTask[];
    dateRange: DateRange;
    viewMode: ViewMode;
}

interface UseTimelineVirtualizerReturn {
    virtualRows: any[];
    totalHeight: number;
    virtualColumns: any[];
    totalWidth: number;
}

export function useTimelineVirtualizer({
    containerRef,
    tasks,
    dateRange,
    viewMode,
}: UseTimelineVirtualizerProps): UseTimelineVirtualizerReturn {
    // Calculate column count based on view mode
    const columnCount = useMemo(() => {
        const diffDays = Math.ceil(
            (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
        );
        return diffDays + 1;
    }, [dateRange]);

    const columnWidth = COLUMN_WIDTH[viewMode];

    // Vertical virtualizer (rows/tasks)
    const rowVirtualizer = useVirtualizer({
        count: tasks.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: OVERSCAN_ROWS,
    });

    // Horizontal virtualizer (columns/timeline)
    const columnVirtualizer = useVirtualizer({
        horizontal: true,
        count: columnCount,
        getScrollElement: () => containerRef.current,
        estimateSize: () => columnWidth,
        overscan: OVERSCAN_COLUMNS,
    });

    return {
        virtualRows: rowVirtualizer.getVirtualItems(),
        totalHeight: rowVirtualizer.getTotalSize(),
        virtualColumns: columnVirtualizer.getVirtualItems(),
        totalWidth: columnVirtualizer.getTotalSize(),
    };
}

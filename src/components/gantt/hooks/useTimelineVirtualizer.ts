// Virtualization hooks for horizontal (columns) and vertical (rows) scrolling
import { useCallback, useMemo, type RefObject } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { ROW_HEIGHT, COLUMN_WIDTH, OVERSCAN_ROWS, OVERSCAN_COLUMNS } from '../constants';
import { getColumnCount } from '../utils/dateUtils';

interface UseTimelineVirtualizerProps {
    containerRef: RefObject<HTMLDivElement | null>;
    tasks: GanttTask[];
    dateRange: DateRange;
    viewMode: ViewMode;
}

interface UseTimelineVirtualizerReturn {
    virtualRows: VirtualItem[];
    totalHeight: number;
    virtualColumns: VirtualItem[];
    totalWidth: number;
    columnCount: number;
}

export function useTimelineVirtualizer({
    containerRef,
    tasks,
    dateRange,
    viewMode,
}: UseTimelineVirtualizerProps): UseTimelineVirtualizerReturn {
    // Calculate column count based on view mode
    const columnCount = useMemo(
        () => getColumnCount(dateRange, viewMode),
        [dateRange, viewMode]
    );

    const columnWidth = COLUMN_WIDTH[viewMode];
    const rowKey = useCallback((index: number) => tasks[index]?.id ?? `row-${index}`, [tasks]);
    const columnKey = useCallback(
        (index: number) => `${viewMode}-${dateRange.start.getTime()}-${index}`,
        [dateRange.start, viewMode],
    );

    // Vertical virtualizer (rows/tasks)
    const rowVirtualizer = useVirtualizer({
        count: tasks.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => ROW_HEIGHT,
        getItemKey: rowKey,
        overscan: OVERSCAN_ROWS,
    });

    // Horizontal virtualizer (columns/timeline)
    const columnVirtualizer = useVirtualizer({
        horizontal: true,
        count: columnCount,
        getScrollElement: () => containerRef.current,
        estimateSize: () => columnWidth,
        getItemKey: columnKey,
        overscan: OVERSCAN_COLUMNS,
    });

    return {
        virtualRows: rowVirtualizer.getVirtualItems(),
        totalHeight: rowVirtualizer.getTotalSize(),
        virtualColumns: columnVirtualizer.getVirtualItems(),
        totalWidth: columnVirtualizer.getTotalSize(),
        columnCount,
    };
}

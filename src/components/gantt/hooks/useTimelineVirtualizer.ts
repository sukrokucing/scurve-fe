// Virtualization hooks for horizontal (columns) and vertical (rows) scrolling
import { useMemo, useCallback, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { GanttTask, ViewMode, DateRange } from '../types';
import { ROW_HEIGHT, OVERSCAN_ROWS, OVERSCAN_COLUMNS, COLUMN_WIDTH } from '../constants';
import { getColumnCount, generateColumns } from '../utils/dateUtils';

interface UseTimelineVirtualizerProps {
    containerRef: RefObject<HTMLDivElement>;
    tasks: GanttTask[];
    dateRange: DateRange;
    viewMode: ViewMode;
}

interface UseTimelineVirtualizerReturn {
    // Row (vertical) virtualization
    rowVirtualizer: ReturnType<typeof useVirtualizer>;
    virtualRows: VirtualItem[];
    totalHeight: number;

    // Column (horizontal) virtualization
    columnVirtualizer: ReturnType<typeof useVirtualizer>;
    virtualColumns: VirtualItem[];
    totalWidth: number;

    // Visible data
    visibleTasks: GanttTask[];
    visibleColumns: ReturnType<typeof generateColumns>;
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

    // Generate all column data (we'll filter to visible ones)
    const allColumns = useMemo(
        () => generateColumns(dateRange, viewMode),
        [dateRange, viewMode]
    );

    // Column width based on view mode
    const columnWidth = COLUMN_WIDTH[viewMode];

    // Row virtualizer (vertical scrolling)
    const rowVirtualizer = useVirtualizer({
        count: tasks.length,
        getScrollElement: () => containerRef.current,
        estimateSize: useCallback(() => ROW_HEIGHT, []),
        overscan: OVERSCAN_ROWS,
    });

    // Column virtualizer (horizontal scrolling)
    const columnVirtualizer = useVirtualizer({
        horizontal: true,
        count: columnCount,
        getScrollElement: () => containerRef.current,
        estimateSize: useCallback(() => columnWidth, [columnWidth]),
        overscan: OVERSCAN_COLUMNS,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const virtualColumns = columnVirtualizer.getVirtualItems();

    const totalHeight = rowVirtualizer.getTotalSize();
    const totalWidth = columnVirtualizer.getTotalSize();

    // Get visible tasks based on virtual rows
    const visibleTasks = useMemo(
        () => virtualRows.map(row => tasks[row.index]).filter(Boolean),
        [virtualRows, tasks]
    );

    // Get visible columns based on virtual columns
    const visibleColumns = useMemo(
        () => virtualColumns.map(col => allColumns[col.index]).filter(Boolean),
        [virtualColumns, allColumns]
    );

    return {
        rowVirtualizer,
        virtualRows,
        totalHeight,
        columnVirtualizer,
        virtualColumns,
        totalWidth,
        visibleTasks,
        visibleColumns,
    };
}

/**
 * Utility to get the offset transforms for virtualized content
 */
export function getVirtualOffset(virtualItems: VirtualItem[]): number {
    return virtualItems[0]?.start ?? 0;
}

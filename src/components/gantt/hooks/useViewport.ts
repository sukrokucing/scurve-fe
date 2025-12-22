// Viewport tracking hook for scroll position and visible range
import { useState, useEffect, useCallback, type RefObject } from 'react';

import type { DateRange, ViewMode } from '../types';
import { COLUMN_WIDTH } from '../constants';
import { xToDate } from '../utils/positionUtils';

interface Viewport {
    scrollLeft: number;
    scrollTop: number;
    width: number;
    height: number;
}

interface VisibleRange {
    startDate: Date;
    endDate: Date;
    startColumn: number;
    endColumn: number;
    startRow: number;
    endRow: number;
}

interface UseViewportProps {
    containerRef: RefObject<HTMLDivElement>;
    dateRange: DateRange;
    viewMode: ViewMode;
    rowHeight: number;

}

interface UseViewportReturn {
    viewport: Viewport;
    visibleRange: VisibleRange;
    scrollTo: (x: number, y: number) => void;
    scrollToDate: (date: Date) => void;
    scrollToTask: (taskIndex: number) => void;
}

export function useViewport({
    containerRef,
    dateRange,
    viewMode,
    rowHeight,

}: UseViewportProps): UseViewportReturn {
    const [viewport, setViewport] = useState<Viewport>({
        scrollLeft: 0,
        scrollTop: 0,
        width: 0,
        height: 0,
    });

    const columnWidth = COLUMN_WIDTH[viewMode];

    // Update viewport on scroll and resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateViewport = () => {
            setViewport({
                scrollLeft: container.scrollLeft,
                scrollTop: container.scrollTop,
                width: container.clientWidth,
                height: container.clientHeight,
            });
        };

        // Initial update
        updateViewport();

        // Listen for scroll events
        container.addEventListener('scroll', updateViewport, { passive: true });

        // Listen for resize
        const resizeObserver = new ResizeObserver(updateViewport);
        resizeObserver.observe(container);

        return () => {
            container.removeEventListener('scroll', updateViewport);
            resizeObserver.disconnect();
        };
    }, [containerRef]);

    // Calculate visible range
    const visibleRange: VisibleRange = {
        startDate: xToDate(viewport.scrollLeft, dateRange.start, viewMode),
        endDate: xToDate(viewport.scrollLeft + viewport.width, dateRange.start, viewMode),
        startColumn: Math.floor(viewport.scrollLeft / columnWidth),
        endColumn: Math.ceil((viewport.scrollLeft + viewport.width) / columnWidth),
        startRow: Math.floor(viewport.scrollTop / rowHeight),
        endRow: Math.ceil((viewport.scrollTop + viewport.height) / rowHeight),
    };

    // Scroll programmatically
    const scrollTo = useCallback((x: number, y: number) => {
        containerRef.current?.scrollTo({ left: x, top: y, behavior: 'smooth' });
    }, [containerRef]);

    // Scroll to specific date
    const scrollToDate = useCallback((date: Date) => {
        const daysDiff = Math.floor(
            (date.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
        );
        const x = daysDiff * columnWidth;
        containerRef.current?.scrollTo({ left: x, behavior: 'smooth' });
    }, [containerRef, dateRange.start, columnWidth]);

    // Scroll to specific task row
    const scrollToTask = useCallback((taskIndex: number) => {
        const y = taskIndex * rowHeight;
        containerRef.current?.scrollTo({ top: y, behavior: 'smooth' });
    }, [containerRef, rowHeight]);

    return {
        viewport,
        visibleRange,
        scrollTo,
        scrollToDate,
        scrollToTask,
    };
}

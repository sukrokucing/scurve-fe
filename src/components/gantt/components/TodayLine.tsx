// Today line indicator
import { memo } from 'react';
import type { DateRange, ViewMode } from '../types';
import { dateToX } from '../utils/positionUtils';

interface TodayLineProps {
    dateRange: DateRange;
    viewMode: ViewMode;
    totalHeight: number;
}

export const TodayLine = memo(function TodayLine({
    dateRange,
    viewMode,
    totalHeight,
}: TodayLineProps) {
    const alignToPixel = (value: number) => Math.round(value) + 0.5;
    const today = new Date();

    // Check if today is within the date range
    if (today < dateRange.start || today > dateRange.end) {
        return null;
    }

    const x = alignToPixel(dateToX(today, dateRange.start, viewMode));

    return (
        <div
            className="absolute pointer-events-none"
            style={{
                left: x,
                top: 0,
                height: totalHeight,
            }}
            data-testid="gantt-today-line"
        >
            {/* Main line: keep it behind sticky header and active task overlays. */}
            <div className="absolute inset-y-0 left-0 -translate-x-1/2 w-0.5 bg-destructive/70 shadow-[0_0_4px_hsl(var(--destructive)/0.45)] z-[35]" />

            {/* Today label: visible near header, similar to React-Modern-Gantt marker label. */}
            <div
                className="absolute left-0 -top-[11px] -translate-x-1/2 z-[70] rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground shadow-sm"
                title="Today"
                data-testid="gantt-today-label"
            >
                Today
            </div>
        </div>
    );
});

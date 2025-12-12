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
    const today = new Date();

    // Check if today is within the date range
    if (today < dateRange.start || today > dateRange.end) {
        return null;
    }

    const x = dateToX(today, dateRange.start, viewMode);

    return (
        <div
            className="absolute z-10 pointer-events-none"
            style={{
                left: x,
                top: 0,
                height: totalHeight,
            }}
        >
            {/* Main line */}
            <div className="w-0.5 h-full bg-destructive/70" />

            {/* Top indicator dot */}
            <div
                className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-destructive"
                title="Today"
            />
        </div>
    );
});

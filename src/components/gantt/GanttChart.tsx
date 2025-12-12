// Main Gantt Chart Component - Fully Virtualized
import { forwardRef, useState, useMemo, useCallback, useImperativeHandle, useRef } from 'react';
import type { GanttTask, GanttProps, ViewMode } from './types';
import { ROW_HEIGHT, HEADER_HEIGHT, COLUMN_WIDTH } from './constants';
import { calculateDateRange, generateColumns } from './utils/dateUtils';
import { useTimelineVirtualizer } from './hooks/useTimelineVirtualizer';
import { useTaskDrag } from './hooks/useTaskDrag';
import { TimelineHeader } from './components/TimelineHeader';
import { TimelineGrid } from './components/TimelineGrid';
import { TodayLine } from './components/TodayLine';
import { TaskBar } from './components/TaskBar';
import { DependencyLayer } from './components/DependencyArrow';

interface GanttChartProps extends GanttProps {
    viewMode: ViewMode;
    onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const GanttChart = forwardRef<HTMLDivElement, GanttChartProps>(function GanttChart({
    tasks,
    dependencies,
    onTaskUpdate,
    onTaskDelete,
    onAddDependency,
    onDeleteDependency,
    onTaskDoubleClick,
    viewMode,
    onScroll,
}, ref) {
    const localRef = useRef<HTMLDivElement>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    // Expose localRef to parent via forwarded ref
    useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

    // Calculate date range from tasks
    const dateRange = useMemo(() => calculateDateRange(tasks), [tasks]);

    // Generate all column data
    const allColumns = useMemo(
        () => generateColumns(dateRange, viewMode),
        [dateRange, viewMode]
    );

    // Setup virtualization
    const {
        virtualRows,
        totalHeight,
        virtualColumns,
        totalWidth,
    } = useTimelineVirtualizer({
        containerRef: localRef,
        tasks,
        dateRange,
        viewMode,
    });

    // Drag handling
    const { handleDragStart, previewTask, dragState } = useTaskDrag({
        dateRange,
        viewMode,
        onTaskUpdate,
    });

    return (
        <div className="flex flex-col h-full">
            {/* Timeline Container */}
            <div
                ref={localRef}
                className="flex-1 overflow-auto relative"
                style={{ contain: 'strict' }}
                onScroll={onScroll}
            >
                {/* Header - sticky at top */}
                <TimelineHeader
                    virtualColumns={virtualColumns}
                    allColumns={allColumns}
                    viewMode={viewMode}
                    totalWidth={totalWidth}
                />

                {/* Main timeline area */}
                <div
                    className="relative"
                    style={{
                        width: totalWidth,
                        height: totalHeight,
                    }}
                >
                    {/* Background grid */}
                    <TimelineGrid
                        virtualColumns={virtualColumns}
                        virtualRows={virtualRows}
                        allColumns={allColumns}
                        viewMode={viewMode}
                        totalWidth={totalWidth}
                        totalHeight={totalHeight}
                    />

                    {/* Today line */}
                    <TodayLine
                        dateRange={dateRange}
                        viewMode={viewMode}
                        totalHeight={totalHeight}
                    />

                    {/* Dependency arrows */}
                    <DependencyLayer
                        tasks={tasks}
                        dependencies={dependencies}
                        dateRange={dateRange}
                        viewMode={viewMode}
                        totalWidth={totalWidth}
                        totalHeight={totalHeight}
                    />

                    {/* Task bars - use absolute positioning based on virtualRow.start */}
                    {virtualRows.map((virtualRow) => {
                        const task = tasks[virtualRow.index];
                        if (!task) return null;

                        // Use preview task if this task is being dragged
                        const displayTask =
                            dragState.isDragging && previewTask && previewTask.id === task.id
                                ? previewTask
                                : task;

                        return (
                            <TaskBar
                                key={task.id}
                                task={displayTask}
                                rowStart={virtualRow.start}
                                dateRange={dateRange}
                                viewMode={viewMode}
                                isSelected={selectedTaskId === task.id}
                                onSelect={(t) => setSelectedTaskId(t.id)}
                                onDoubleClick={onTaskDoubleClick}
                                onDragStart={handleDragStart}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

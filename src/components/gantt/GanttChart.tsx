// Main Gantt Chart Component - Fully Virtualized
import { forwardRef, useState, useMemo, useImperativeHandle, useRef } from 'react';
import type { GanttProps } from './types';

import { HEADER_HEIGHT } from './constants';

import { calculateDateRange, generateColumns } from './utils/dateUtils';
import { useTimelineVirtualizer } from './hooks/useTimelineVirtualizer';
import { useTaskDrag } from './hooks/useTaskDrag';
import { TimelineHeader } from './components/TimelineHeader';
import { TimelineGrid as Grid } from './components/TimelineGrid';

import { TaskBar } from './components/TaskBar';
import { DependencyLayer } from './components/DependencyArrow';

export const GanttChart = forwardRef<HTMLDivElement, GanttProps>(function GanttChart({
    tasks,
    dependencies,
    onTasksUpdate,
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
        containerRef: localRef as any,
        tasks,
        dateRange,
        viewMode,
    });

    // Drag handling
    const { handleDragStart, dragState, ghostRef } = useTaskDrag({
        tasks,
        dateRange,
        viewMode,
        onTasksUpdate,
    });



    return (
        <div
            ref={localRef}
            className="relative flex-1 overflow-auto bg-background/50"
            onScroll={onScroll}
        >
            <div
                className="relative"
                style={{
                    width: totalWidth,
                    height: totalHeight + HEADER_HEIGHT,
                }}
            >
                {/* Header */}
                <TimelineHeader
                    virtualColumns={virtualColumns}
                    allColumns={allColumns}
                    viewMode={viewMode}
                    totalWidth={totalWidth}
                />

                {/* Content Area */}
                <div
                    className="relative"
                    style={{
                        height: totalHeight,
                        marginTop: HEADER_HEIGHT,
                    }}
                >
                    {/* Grid Lines */}
                    <Grid
                        virtualRows={virtualRows}
                        virtualColumns={virtualColumns}
                        allColumns={allColumns}
                        totalWidth={totalWidth}
                        totalHeight={totalHeight}
                        viewMode={viewMode}
                    />


                    {/* Dependency Layer */}
                    <DependencyLayer
                        tasks={tasks}
                        dependencies={dependencies}
                        dateRange={dateRange}
                        viewMode={viewMode}
                        totalWidth={totalWidth}
                        totalHeight={totalHeight}
                    />

                    {/* Task Bars */}
                    {virtualRows.map((virtualRow) => {
                        const task = tasks[virtualRow.index];
                        const isSelected = selectedTaskId === task.id;

                        return (
                            <TaskBar
                                key={task.id}
                                task={task}
                                rowStart={virtualRow.start}
                                dateRange={dateRange}
                                viewMode={viewMode}
                                isSelected={isSelected}
                                onDragStart={handleDragStart}
                                onSelect={(t) => setSelectedTaskId(t.id)}
                                onDoubleClick={onTaskDoubleClick}
                            />
                        );
                    })}

                    {/* Drag Preview - Direct DOM Manipulation */}
                    {dragState.isDragging && dragState.task && (
                        <div
                            ref={ghostRef}
                            className="absolute z-50 pointer-events-none will-change-transform"
                            style={{
                                top: 0, // We need to calculate the top offset or use the same logic as TaskBar
                                left: 0,
                                width: '100%',
                                height: 0, // Wrapper doesn't need height, just used for transform
                            }}
                        >
                            <TaskBar
                                task={dragState.task}
                                rowStart={virtualRows.find(r => r.index === tasks.findIndex(t => t.id === dragState.task?.id))?.start || 0}
                                dateRange={dateRange}
                                viewMode={viewMode}
                                isSelected={true}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

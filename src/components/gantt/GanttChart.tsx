// Main Gantt Chart Component - Fully Virtualized
import { forwardRef, useState, useMemo, useImperativeHandle, useRef, useCallback } from 'react';
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
    editMode = true,
    showProgress = true,
    allowProgressEdit = true,
    allowTaskMove = true,
    allowTaskResize = true,
    smoothDragging = true,
    animationSpeed = 0.45,
    edgeAutoScroll = true,
    autoScrollThreshold = 72,
    autoScrollSpeed = 16,
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
    const { handleDragStart, previewBars } = useTaskDrag({
        tasks,
        dateRange,
        viewMode,
        onTasksUpdate,
        scrollContainerRef: localRef,
        editMode,
        allowTaskMove,
        allowTaskResize,
        smoothDragging,
        animationSpeed,
        edgeAutoScroll,
        autoScrollThreshold,
        autoScrollSpeed,
    });

    const handleTaskProgressUpdate = useCallback((task: GanttProps['tasks'][number], progress: number) => {
        const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
        if (normalizedProgress === Math.round(task.progress)) return;

        onTasksUpdate([
            {
                ...task,
                progress: normalizedProgress,
            },
        ]);
    }, [onTasksUpdate]);

    const canEditProgress = editMode && showProgress && allowProgressEdit;
    const progressHandler = canEditProgress ? handleTaskProgressUpdate : undefined;

    return (
        <div
            ref={localRef}
            className="relative flex-1 overflow-auto bg-background/50"
            onScroll={onScroll}
            data-testid="gantt-chart-scroll-container"
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
                        previewBars={previewBars}
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
                                editMode={editMode}
                                showProgress={showProgress}
                                allowProgressEdit={allowProgressEdit}
                                allowTaskMove={allowTaskMove}
                                allowTaskResize={allowTaskResize}
                                onProgressUpdate={progressHandler}
                                previewLeftDeltaPx={previewBars[task.id]?.leftDelta ?? 0}
                                previewWidthDeltaPx={previewBars[task.id]?.widthDelta ?? 0}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

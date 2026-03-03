// Dependency arrow component (SVG)
import { memo, useMemo } from 'react';
import type { GanttTask, GanttDependency, ViewMode, DateRange } from '../types';
import { ROW_HEIGHT, TASK_BAR_HEIGHT } from '../constants';
import { getTaskBarPosition } from '../utils/positionUtils';

const alignToPixel = (value: number) => Math.round(value) + 0.5;
const ARROW_INDENT = 20;
const EMPTY_PREVIEW_BARS: Record<string, { leftDelta: number; widthDelta: number }> = Object.freeze({});

interface DependencyArrowProps {
    predecessorTask: GanttTask;
    dependentTask: GanttTask;
    predecessorRowIndex: number;
    dependentRowIndex: number;
    dateRange: DateRange;
    viewMode: ViewMode;
    predecessorPreview?: { leftDelta: number; widthDelta: number };
    dependentPreview?: { leftDelta: number; widthDelta: number };
}

export const DependencyArrow = memo(function DependencyArrow({
    predecessorTask,
    dependentTask,
    predecessorRowIndex,
    dependentRowIndex,
    dateRange,
    viewMode,
    predecessorPreview,
    dependentPreview,
}: DependencyArrowProps) {
    const predecessorPos = getTaskBarPosition(predecessorTask, dateRange.start, viewMode, predecessorRowIndex);
    const dependentPos = getTaskBarPosition(dependentTask, dateRange.start, viewMode, dependentRowIndex);

    // Finish-to-start routing based on gantt-task-react orthogonal arrow style.
    const { path, arrowHeadPoints } = useMemo(() => {
        const predecessorLeftDelta = predecessorPreview?.leftDelta ?? 0;
        const predecessorWidthDelta = predecessorPreview?.widthDelta ?? 0;
        const dependentLeftDelta = dependentPreview?.leftDelta ?? 0;

        const startX = alignToPixel(predecessorPos.x + predecessorPos.width + predecessorLeftDelta + predecessorWidthDelta);
        const startY = alignToPixel(predecessorPos.y + TASK_BAR_HEIGHT / 2);
        const endX = alignToPixel(dependentPos.x + dependentLeftDelta);
        const endY = alignToPixel(dependentPos.y + TASK_BAR_HEIGHT / 2);
        const indexCompare = predecessorRowIndex > dependentRowIndex ? -1 : 1;
        const midY = alignToPixel(startY + ((indexCompare * ROW_HEIGHT) / 2));
        const firstHorizontalX = alignToPixel(startX + ARROW_INDENT);
        const sourceEndPosition = alignToPixel(startX + (ARROW_INDENT * 2));
        const beforeTargetX = alignToPixel(endX - ARROW_INDENT);
        const requiresDetour = sourceEndPosition >= endX;

        const segments = [
            `M ${startX} ${startY}`,
            `H ${firstHorizontalX}`,
            `V ${midY}`,
        ];

        if (requiresDetour) {
            segments.push(`H ${beforeTargetX}`);
        }

        // End with explicit line command so tests can read final absolute point.
        segments.push(`V ${endY}`, `H ${endX}`, `L ${endX} ${endY}`);

        const path = segments.join(' ');
        const size = 6;
        const arrowHeadPoints = `${endX},${endY} ${endX - size},${endY - size} ${endX - size},${endY + size}`;
        return { path, arrowHeadPoints };
    }, [
        dependentPos,
        dependentPreview,
        dependentRowIndex,
        predecessorPos,
        predecessorPreview,
        predecessorRowIndex,
    ]);

    return (
        <g
            className="dependency-arrow"
            data-testid="gantt-dependency-arrow"
            data-predecessor-id={predecessorTask.id}
            data-dependent-id={dependentTask.id}
        >
            {/* Arrow line */}
            <path
                d={path}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                shapeRendering="geometricPrecision"
                className="transition-colors hover:stroke-primary"
            />

            {/* Arrowhead */}
            <polygon
                points={arrowHeadPoints}
                fill="hsl(var(--muted-foreground))"
                className="transition-colors hover:fill-primary"
            />
        </g>
    );
});

interface DependencyLayerProps {
    tasks: GanttTask[];
    dependencies: GanttDependency[];
    dateRange: DateRange;
    viewMode: ViewMode;
    totalWidth: number;
    totalHeight: number;
    visibleRowRange?: { start: number; end: number } | null;
    previewBars?: Record<string, { leftDelta: number; widthDelta: number }>;
}

export const DependencyLayer = memo(function DependencyLayer({
    tasks,
    dependencies,
    dateRange,
    viewMode,
    totalWidth,
    totalHeight,
    visibleRowRange = null,
    previewBars = EMPTY_PREVIEW_BARS,
}: DependencyLayerProps) {
    // Create task index map for O(1) lookup
    const taskIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        tasks.forEach((task, index) => {
            map.set(task.id, index);
        });
        return map;
    }, [tasks]);

    // Create task map for O(1) lookup
    const taskMap = useMemo(() => {
        const map = new Map<string, GanttTask>();
        tasks.forEach((task) => {
            map.set(task.id, task);
        });
        return map;
    }, [tasks]);

    return (
        <svg
            className="absolute inset-0 pointer-events-none z-[5]"
            style={{ width: totalWidth, height: totalHeight }}
        >
            {dependencies.map((dep) => {
                // API semantics: source_task_id is dependent, target_task_id is predecessor.
                const predecessorTask = taskMap.get(dep.target_task_id);
                const dependentTask = taskMap.get(dep.source_task_id);
                const predecessorIndex = taskIndexMap.get(dep.target_task_id);
                const dependentIndex = taskIndexMap.get(dep.source_task_id);

                if (!predecessorTask || !dependentTask || predecessorIndex === undefined || dependentIndex === undefined) {
                    return null;
                }

                if (visibleRowRange) {
                    const rowBuffer = 6;
                    const minVisibleRow = visibleRowRange.start - rowBuffer;
                    const maxVisibleRow = visibleRowRange.end + rowBuffer;
                    const predecessorVisible = predecessorIndex >= minVisibleRow && predecessorIndex <= maxVisibleRow;
                    const dependentVisible = dependentIndex >= minVisibleRow && dependentIndex <= maxVisibleRow;
                    if (!predecessorVisible && !dependentVisible) {
                        return null;
                    }
                }

                return (
                    <DependencyArrow
                        key={dep.id}
                        predecessorTask={predecessorTask}
                        dependentTask={dependentTask}
                        predecessorRowIndex={predecessorIndex}
                        dependentRowIndex={dependentIndex}
                        dateRange={dateRange}
                        viewMode={viewMode}
                        predecessorPreview={previewBars[predecessorTask.id]}
                        dependentPreview={previewBars[dependentTask.id]}
                    />
                );
            })}
        </svg>
    );
});

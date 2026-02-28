// Dependency arrow component (SVG)
import { memo, useMemo } from 'react';
import type { GanttTask, GanttDependency, ViewMode, DateRange } from '../types';
import { TASK_BAR_HEIGHT } from '../constants';
import { getTaskBarPosition } from '../utils/positionUtils';

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

    // Finish-to-start: predecessor end -> dependent start.
    const path = useMemo(() => {
        const predecessorLeftDelta = predecessorPreview?.leftDelta ?? 0;
        const predecessorWidthDelta = predecessorPreview?.widthDelta ?? 0;
        const dependentLeftDelta = dependentPreview?.leftDelta ?? 0;

        const startX = predecessorPos.x + predecessorPos.width + predecessorLeftDelta + predecessorWidthDelta;
        const startY = predecessorPos.y + TASK_BAR_HEIGHT / 2;
        const endX = dependentPos.x + dependentLeftDelta;
        const endY = dependentPos.y + TASK_BAR_HEIGHT / 2;

        // Calculate control points for smooth curve
        const curveOffset = Math.min(50, Math.abs(endX - startX) / 3);

        // If target is to the left of source (backwards dependency)
        if (endX < startX) {
            // Go around: right, down/up, left
            return `
        M ${startX} ${startY}
        H ${startX + 20}
        V ${endY}
        H ${endX - 10}
        L ${endX} ${endY}
      `;
        }

        // Normal case: source before target
        return `
      M ${startX} ${startY}
      C ${startX + curveOffset} ${startY},
        ${endX - curveOffset} ${endY},
        ${endX} ${endY}
    `;
    }, [dependentPos, dependentPreview, predecessorPos, predecessorPreview]);

    // Arrowhead path
    const arrowHead = useMemo(() => {
        const dependentLeftDelta = dependentPreview?.leftDelta ?? 0;
        const endX = dependentPos.x + dependentLeftDelta;
        const endY = dependentPos.y + TASK_BAR_HEIGHT / 2;
        const size = 6;

        return `
      M ${endX} ${endY}
      L ${endX - size} ${endY - size}
      L ${endX - size} ${endY + size}
      Z
    `;
    }, [dependentPos, dependentPreview]);

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
                strokeLinecap="round"
                className="transition-colors hover:stroke-primary"
            />

            {/* Arrowhead */}
            <path
                d={arrowHead}
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
    previewBars?: Record<string, { leftDelta: number; widthDelta: number }>;
}

export const DependencyLayer = memo(function DependencyLayer({
    tasks,
    dependencies,
    dateRange,
    viewMode,
    totalWidth,
    totalHeight,
    previewBars = {},
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
            className="absolute inset-0 pointer-events-none z-5"
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

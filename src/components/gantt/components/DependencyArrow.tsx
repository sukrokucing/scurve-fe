// Dependency arrow component (SVG)
import { memo, useMemo } from 'react';
import type { GanttTask, GanttDependency, ViewMode, DateRange } from '../types';
import { TASK_BAR_HEIGHT } from '../constants';
import { getTaskBarPosition } from '../utils/positionUtils';

interface DependencyArrowProps {
    dependency: GanttDependency;
    sourceTask: GanttTask;
    targetTask: GanttTask;
    sourceRowIndex: number;
    targetRowIndex: number;
    dateRange: DateRange;
    viewMode: ViewMode;
}

export const DependencyArrow = memo(function DependencyArrow({
    sourceTask,
    targetTask,
    sourceRowIndex,
    targetRowIndex,
    dateRange,
    viewMode,
}: DependencyArrowProps) {
    const sourcePos = getTaskBarPosition(sourceTask, dateRange.start, viewMode, sourceRowIndex);
    const targetPos = getTaskBarPosition(targetTask, dateRange.start, viewMode, targetRowIndex);

    // Calculate arrow path based on dependency type
    const path = useMemo(() => {
        // Default: finish-to-start
        // Arrow goes from end of source to start of target
        const startX = sourcePos.x + sourcePos.width;
        const startY = sourcePos.y + TASK_BAR_HEIGHT / 2;
        const endX = targetPos.x;
        const endY = targetPos.y + TASK_BAR_HEIGHT / 2;

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
    }, [sourcePos, targetPos]);

    // Arrowhead path
    const arrowHead = useMemo(() => {
        const endX = targetPos.x;
        const endY = targetPos.y + TASK_BAR_HEIGHT / 2;
        const size = 6;

        return `
      M ${endX} ${endY}
      L ${endX - size} ${endY - size}
      L ${endX - size} ${endY + size}
      Z
    `;
    }, [targetPos]);

    return (
        <g className="dependency-arrow">
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
}

export const DependencyLayer = memo(function DependencyLayer({
    tasks,
    dependencies,
    dateRange,
    viewMode,
    totalWidth,
    totalHeight,
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
                const sourceTask = taskMap.get(dep.source_task_id);
                const targetTask = taskMap.get(dep.target_task_id);
                const sourceIndex = taskIndexMap.get(dep.source_task_id);
                const targetIndex = taskIndexMap.get(dep.target_task_id);

                if (!sourceTask || !targetTask || sourceIndex === undefined || targetIndex === undefined) {
                    return null;
                }

                return (
                    <DependencyArrow
                        key={dep.id}
                        dependency={dep}
                        sourceTask={sourceTask}
                        targetTask={targetTask}
                        sourceRowIndex={sourceIndex}
                        targetRowIndex={targetIndex}
                        dateRange={dateRange}
                        viewMode={viewMode}
                    />
                );
            })}
        </svg>
    );
});

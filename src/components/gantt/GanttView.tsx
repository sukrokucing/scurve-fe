// GanttView - Main container using custom GanttChart
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Task as DomainTask } from '@/types/domain';
import type { GanttTask, GanttDependency, ViewMode } from './types';
import { TaskTable } from './TaskTable';
import { GanttChart } from './GanttChart';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { ApiTaskDependency } from '@/api/openapiClient';
import { calculateDateRange } from './utils/dateUtils';
import { dateToX } from './utils/positionUtils';

// Re-export Progress from API types for compatibility
export type Progress = {
    id: string;
    task_id: string;
    progress: number;
};

interface GanttViewProps {
    tasks: DomainTask[];
    progress: Progress[];
    dependencies: ApiTaskDependency[];
    onUpdateTask: (task: GanttTask) => void;
    onDeleteTask: (taskId: string) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
    onDoubleClick: (task: GanttTask) => void;
}

export function GanttView({
    tasks,
    progress,
    dependencies,
    onUpdateTask,
    onDeleteTask,
    onAddDependency,
    onDeleteDependency,
    onDoubleClick,
}: GanttViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [isTableVisible, setIsTableVisible] = useState(true);

    // Scroll synchronization refs
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const isSyncingLeft = useRef(false);
    const isSyncingRight = useRef(false);

    const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (isSyncingLeft.current) {
            isSyncingLeft.current = false;
            return;
        }

        if (chartContainerRef.current) {
            isSyncingRight.current = true;
            chartContainerRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    }, []);

    const handleChartScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (isSyncingRight.current) {
            isSyncingRight.current = false;
            return;
        }

        if (tableContainerRef.current) {
            isSyncingLeft.current = true;
            tableContainerRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    }, []);

    // Transform API tasks to GanttTask format
    const ganttTasks = useMemo<GanttTask[]>(() => {
        return tasks.map((t) => {
            const taskProgress = progress.find((p) => p.task_id === t.id);

            // Use real start date if available, otherwise fallback to created_at
            const startDate = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);

            // Use real end date if available, otherwise fallback to due_date or start + 1 day
            const endDate = t.endDate
                ? new Date(t.endDate)
                : t.dueDate
                    ? new Date(t.dueDate)
                    : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

            // Map dependencies: find tasks that this task depends on
            const taskDependencies = dependencies
                .filter((d) => d.source_task_id === t.id)
                .map((d) => d.target_task_id);

            const isMilestone = startDate.getTime() === endDate.getTime();

            return {
                id: t.id,
                originalId: t.id,
                name: t.name,
                start: startDate,
                end: endDate,
                type: isMilestone ? 'milestone' : 'task',
                progress: t.progress ?? taskProgress?.progress ?? 0,
                progressId: taskProgress?.id,
                dependencies: taskDependencies,
                isDisabled: false,
                duration: t.durationDays,
                status: t.status,
            } as GanttTask;
        });
    }, [tasks, progress, dependencies]);

    // Transform dependencies to GanttDependency format
    const ganttDependencies = useMemo<GanttDependency[]>(() => {
        return dependencies.map((d) => ({
            id: d.id,
            source_task_id: d.source_task_id,
            target_task_id: d.target_task_id,
            type_: (d.type_ as GanttDependency['type_']) || 'finish-to-start',
        }));
    }, [dependencies]);

    const handleTaskChange = (task: GanttTask) => {
        onUpdateTask(task);
    };

    // Calculate date range for scroll positioning
    const dateRange = useMemo(() => calculateDateRange(ganttTasks), [ganttTasks]);

    const scrollToToday = useCallback(() => {
        if (chartContainerRef.current && ganttTasks.length > 0) {
            const today = new Date();
            // Check if today is within range
            if (today < dateRange.start || today > dateRange.end) {
                return;
            }

            const x = dateToX(today, dateRange.start, viewMode);
            // Scroll to center the today line (subtract half viewport width)
            const viewportWidth = chartContainerRef.current.clientWidth;
            const targetX = Math.max(0, x - viewportWidth / 2);

            chartContainerRef.current.scrollTo({ left: targetX, behavior: 'smooth' });
        }
    }, [ganttTasks, dateRange, viewMode]);

    // Initial scroll to today
    useEffect(() => {
        if (ganttTasks.length > 0) {
            // Small timeout to ensure layout is ready
            const timer = setTimeout(() => {
                scrollToToday();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []); // Run once on mount

    // Scroll to today when view mode changes
    useEffect(() => {
        // Small timeout to allow layout to settle after remount
        const timer = setTimeout(() => {
            scrollToToday();
        }, 100);
        return () => clearTimeout(timer);
    }, [viewMode, scrollToToday]);

    return (
        <div className="flex flex-col gap-4 h-[600px]">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gantt View</h2>

                {/* Global Toolbar */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsTableVisible(!isTableVisible)}
                        className="hidden md:flex"
                    >
                        {isTableVisible ? 'Hide Table' : 'Show Table'}
                    </Button>

                    <div className="h-6 w-px bg-border mx-2" />

                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="View" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="day">Day</SelectItem>
                            <SelectItem value="week">Week</SelectItem>
                            <SelectItem value="month">Month</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button variant="outline" size="sm" onClick={scrollToToday}>
                        <CalendarDays className="h-4 w-4 mr-1" />
                        Today
                    </Button>

                    <div className="flex items-center gap-1 ml-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                chartContainerRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
                            }}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                chartContainerRef.current?.scrollBy({ left: 300, behavior: 'smooth' });
                            }}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 border rounded-xl overflow-hidden glass shadow-sm">
                {/* Split View: Table (Fixed Width) | Timeline (Flex) */}
                {isTableVisible && (
                    <div className="w-[750px] min-w-[650px] max-w-[850px] border-r bg-background flex-none flex flex-col">
                        <TaskTable
                            ref={tableContainerRef}
                            tasks={ganttTasks}
                            dependencies={ganttDependencies}
                            onTaskUpdate={handleTaskChange}
                            onTaskDelete={(t) => onDeleteTask(t.originalId)}
                            onAddDependency={onAddDependency}
                            onDeleteDependency={onDeleteDependency}
                            onScroll={handleTableScroll}
                        />
                    </div>
                )}
                <div className="flex-1 bg-background overflow-hidden min-w-0 flex flex-col">
                    {ganttTasks.length > 0 ? (
                        <GanttChart
                            ref={chartContainerRef}
                            key={`${isTableVisible ? 'with-table' : 'full-width'}-${viewMode}`}
                            tasks={ganttTasks}
                            dependencies={ganttDependencies}
                            viewMode={viewMode}
                            onTaskUpdate={handleTaskChange}
                            onTaskDelete={(t) => onDeleteTask(t.originalId)}
                            onAddDependency={onAddDependency}
                            onDeleteDependency={onDeleteDependency}
                            onTaskDoubleClick={onDoubleClick}
                            onScroll={handleChartScroll}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            No tasks to display
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

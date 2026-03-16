// GanttView - Main container using custom GanttChart
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Task as DomainTask } from '@/types/domain';
import type { GanttTask, GanttDependency, ViewMode } from './types';
import { TaskTable } from './TaskTable';
import { GanttChart } from './GanttChart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, CheckCircle2, AlertCircle, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { ApiTaskDependency } from '@/api/openapiClient';
import { calculateDateRange } from './utils/dateUtils';
import { dateToX } from './utils/positionUtils';
import { useCriticalPath } from '@/api/queries/projects';

// Re-export Progress from API types for compatibility
export type Progress = {
    id: string;
    task_id: string;
    progress: number;
};

type InteractionPreset = 'view' | 'plan' | 'progress' | 'custom';

interface GanttViewProps {
    projectId: string; // Required for critical path
    tasks: DomainTask[];
    progress: Progress[];
    dependencies: ApiTaskDependency[];
    pendingChangesCount?: number;
    isSyncingChanges?: boolean;
    syncError?: string | null;
    lastSyncedAt?: number | null;
    onRetrySyncChanges?: () => void;
    onUpdateTasks: (tasks: GanttTask[]) => void;
    onDeleteTask: (taskId: string) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
    onDoubleClick: (task: GanttTask) => void;
}

export function GanttView({
    projectId,
    tasks,
    progress,
    dependencies,
    pendingChangesCount = 0,
    isSyncingChanges = false,
    syncError = null,
    lastSyncedAt = null,
    onRetrySyncChanges,
    onUpdateTasks,
    onDeleteTask,
    onAddDependency,
    onDeleteDependency,
    onDoubleClick,
}: GanttViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [isTableVisible, setIsTableVisible] = useState(true);
    const [editMode, setEditMode] = useState(true);
    const [showProgress, setShowProgress] = useState(true);
    const [allowProgressEdit, setAllowProgressEdit] = useState(true);
    const [allowTaskMove, setAllowTaskMove] = useState(true);
    const [allowTaskResize, setAllowTaskResize] = useState(true);
    const [focusMode, setFocusMode] = useState(true);
    const [interactionPreset, setInteractionPreset] = useState<InteractionPreset>('custom');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const { data: criticalPathIds } = useCriticalPath(projectId);

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

    const applyInteractionPreset = useCallback((preset: InteractionPreset) => {
        if (preset === 'custom') return;
        setInteractionPreset(preset);

        if (preset === 'view') {
            setEditMode(false);
            setShowProgress(true);
            setAllowProgressEdit(false);
            setAllowTaskMove(false);
            setAllowTaskResize(false);
            return;
        }

        if (preset === 'plan') {
            setEditMode(true);
            setShowProgress(true);
            setAllowProgressEdit(false);
            setAllowTaskMove(true);
            setAllowTaskResize(true);
            return;
        }

        setEditMode(true);
        setShowProgress(true);
        setAllowProgressEdit(true);
        setAllowTaskMove(false);
        setAllowTaskResize(false);
    }, []);

    const markCustomPreset = useCallback(() => {
        setInteractionPreset('custom');
    }, []);

    const interactionPresetLabel = useMemo(() => {
        if (interactionPreset === 'custom') return 'Custom';
        if (interactionPreset === 'view') return 'View';
        if (interactionPreset === 'progress') return 'Progress';
        return 'Plan';
    }, [interactionPreset]);

    // Transform API tasks to GanttTask format
    const ganttTasks = useMemo<GanttTask[]>(() => {
        const progressByTaskId = new Map(progress.map((entry) => [entry.task_id, entry] as const));
        const dependenciesBySourceId = new Map<string, string[]>();
        dependencies.forEach((dependency) => {
            const existing = dependenciesBySourceId.get(dependency.source_task_id);
            if (existing) {
                existing.push(dependency.target_task_id);
            } else {
                dependenciesBySourceId.set(dependency.source_task_id, [dependency.target_task_id]);
            }
        });
        const criticalPathSet = new Set(criticalPathIds ?? []);

        return tasks.map((t) => {
            const taskProgress = progressByTaskId.get(t.id);

            // Use real start date if available, otherwise fallback to created_at
            const startDate = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);

            // Use real end date if available, otherwise fallback to due_date or start + 1 day
            const endDate = t.endDate
                ? new Date(t.endDate)
                : t.dueDate
                    ? new Date(t.dueDate)
                    : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

            // Map dependencies: find tasks that this task depends on
            const taskDependencies = dependenciesBySourceId.get(t.id) ?? [];

            const isMilestone = startDate.getTime() === endDate.getTime();

            return {
                id: t.id,
                originalId: t.id,
                name: t.name,
                start: startDate,
                end: endDate,
                type: isMilestone ? 'milestone' : 'task',
                progress: t.actualProgressPct ?? t.progress ?? taskProgress?.progress ?? 0,
                progressId: taskProgress?.id,
                dependencies: taskDependencies,
                isDisabled: false,
                isCritical: criticalPathSet.has(t.id),
                duration: t.durationDays,
                status: t.status,
            } as GanttTask;
        });
    }, [tasks, progress, dependencies, criticalPathIds]);

    // Transform dependencies to GanttDependency format
    const ganttDependencies = useMemo<GanttDependency[]>(() => {
        return dependencies.map((d) => ({
            id: d.id,
            source_task_id: d.source_task_id,
            target_task_id: d.target_task_id,
            type_: (d.type_ as GanttDependency['type_']) || 'finish-to-start',
        }));
    }, [dependencies]);

    const handleTasksChange = (updatedTasks: GanttTask[]) => {
        onUpdateTasks(updatedTasks);
    };

    const syncIndicator = useMemo(() => {
        if (syncError) {
            return (
                <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="gap-1" data-testid="gantt-sync-indicator">
                        <AlertCircle className="h-3 w-3" />
                        Sync error
                    </Badge>
                    {onRetrySyncChanges ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onRetrySyncChanges}
                            data-testid="gantt-sync-retry-button"
                        >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Retry
                        </Button>
                    ) : null}
                </div>
            );
        }

        if (isSyncingChanges || pendingChangesCount > 0) {
            return (
                <Badge variant="secondary" className="gap-1" data-testid="gantt-sync-indicator">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {pendingChangesCount > 0 ? `Syncing (${pendingChangesCount} pending)` : 'Syncing...'}
                </Badge>
            );
        }

        if (lastSyncedAt) {
            return (
                <Badge variant="outline" className="gap-1 text-muted-foreground" data-testid="gantt-sync-indicator">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    {`Saved ${new Date(lastSyncedAt).toLocaleTimeString()}`}
                </Badge>
            );
        }

        return null;
    }, [isSyncingChanges, lastSyncedAt, onRetrySyncChanges, pendingChangesCount, syncError]);

    // Calculate date range for scroll positioning
    const dateRange = useMemo(() => calculateDateRange(ganttTasks), [ganttTasks]);

    const scrollToToday = useCallback(() => {
        if (chartContainerRef.current && ganttTasks.length > 0) {
            const today = new Date();
            const clampedDate = today < dateRange.start
                ? dateRange.start
                : (today > dateRange.end ? dateRange.end : today);
            const x = dateToX(clampedDate, dateRange.start, viewMode);
            // Scroll to center the today line (subtract half viewport width)
            const viewportWidth = chartContainerRef.current.clientWidth;
            const targetX = Math.max(0, x - viewportWidth / 2);

            chartContainerRef.current.scrollTo({ left: targetX, behavior: 'smooth' });
        }
    }, [ganttTasks, dateRange, viewMode]);

    // Initial/refresh scroll to today when focus mode is enabled.
    useEffect(() => {
        if (!focusMode || ganttTasks.length === 0) return;
        const timer = setTimeout(() => {
            scrollToToday();
        }, 100);
        return () => clearTimeout(timer);
    }, [focusMode, ganttTasks.length, scrollToToday]);

    // Scroll to today when view mode changes (focus mode only).
    useEffect(() => {
        if (!focusMode) return;
        // Small timeout to allow layout to settle after remount
        const timer = setTimeout(() => {
            scrollToToday();
        }, 100);
        return () => clearTimeout(timer);
    }, [viewMode, focusMode, scrollToToday]);

    return (
        <div className="flex flex-col gap-4 h-[600px]">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gantt View</h2>

                {/* Global Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsTableVisible(!isTableVisible)}
                        className="hidden md:flex"
                        data-testid="gantt-toggle-table-button"
                    >
                        {isTableVisible ? 'Hide Table' : 'Show Table'}
                    </Button>

                    {syncIndicator}

                    {syncIndicator ? <div className="mx-1 h-6 w-px bg-border md:mx-2" /> : null}

                    <Combobox
                        value={viewMode}
                        onChange={(v) => setViewMode(v as ViewMode)}
                        className="w-[96px] sm:w-[120px]"
                        placeholder="View"
                        searchPlaceholder="Search view..."
                        triggerAriaLabel="Gantt view mode"
                        triggerTestId="gantt-view-mode-combobox"
                        options={[
                            { value: 'day', label: 'Day' },
                            { value: 'week', label: 'Week' },
                            { value: 'month', label: 'Month' },
                            { value: 'quarter', label: 'Quarter' },
                            { value: 'year', label: 'Year' },
                        ]}
                    />

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={scrollToToday}
                        data-testid="gantt-today-button"
                    >
                        <CalendarDays className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Today</span>
                    </Button>

                    <Badge
                        variant="outline"
                        className="h-7 text-[11px]"
                        data-testid="gantt-interaction-preset-badge"
                        title={`Interaction mode: ${interactionPresetLabel}`}
                    >
                        {interactionPresetLabel}
                    </Badge>

                    <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" data-testid="gantt-advanced-toggle">
                                <SlidersHorizontal className="h-4 w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Advanced</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            sideOffset={10}
                            collisionPadding={12}
                            className="w-[340px] max-h-[70vh] space-y-4 overflow-y-auto p-3"
                            data-testid="gantt-advanced-panel"
                        >
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">Interaction mode</div>
                                <ToggleGroup
                                    type="single"
                                    value={interactionPreset === 'custom' ? undefined : interactionPreset}
                                    onValueChange={(value) => {
                                        if (!value) return;
                                        applyInteractionPreset(value as InteractionPreset);
                                    }}
                                    className="w-full"
                                >
                                    <ToggleGroupItem value="view" aria-label="View preset" className="h-9 flex-1 text-xs">
                                        View
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="plan" aria-label="Plan preset" className="h-9 flex-1 text-xs">
                                        Plan
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="progress" aria-label="Progress preset" className="h-9 flex-1 text-xs">
                                        Progress
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">Editing controls</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={editMode ? "secondary" : "outline"}
                                        size="sm"
                                        onClick={() => {
                                            markCustomPreset();
                                            setEditMode((prev) => {
                                                const next = !prev;
                                                if (next) {
                                                    // Restore default interactive controls when re-entering edit mode.
                                                    setAllowTaskMove(true);
                                                    setAllowTaskResize(true);
                                                    if (showProgress) {
                                                        setAllowProgressEdit(true);
                                                    }
                                                }
                                                return next;
                                            });
                                        }}
                                        data-testid="gantt-edit-mode-toggle"
                                    >
                                        Edit
                                    </Button>

                                    <Button
                                        variant={focusMode ? "secondary" : "outline"}
                                        size="sm"
                                        onClick={() => {
                                            markCustomPreset();
                                            setFocusMode((prev) => !prev);
                                        }}
                                        data-testid="gantt-focus-toggle"
                                    >
                                        Focus
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">Granular controls</div>
                                <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={allowTaskMove ? "secondary" : "outline"}
                                    size="sm"
                                    disabled={!editMode}
                                    onClick={() => {
                                        markCustomPreset();
                                        setAllowTaskMove((prev) => !prev);
                                    }}
                                    data-testid="gantt-move-toggle"
                                >
                                    Move
                                </Button>

                                <Button
                                    variant={allowTaskResize ? "secondary" : "outline"}
                                    size="sm"
                                    disabled={!editMode}
                                    onClick={() => {
                                        markCustomPreset();
                                        setAllowTaskResize((prev) => !prev);
                                    }}
                                    data-testid="gantt-resize-toggle"
                                >
                                    Resize
                                </Button>

                                <Button
                                    variant={showProgress ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() => {
                                        markCustomPreset();
                                        setShowProgress((prev) => !prev);
                                    }}
                                    data-testid="gantt-progress-visibility-toggle"
                                >
                                    Progress
                                </Button>

                                <Button
                                    variant={allowProgressEdit ? "secondary" : "outline"}
                                    size="sm"
                                    disabled={!editMode || !showProgress}
                                    onClick={() => {
                                        markCustomPreset();
                                        setAllowProgressEdit((prev) => !prev);
                                    }}
                                    data-testid="gantt-progress-edit-toggle"
                                >
                                    Progress Edit
                                </Button>
                                </div>
                            </div>

                            <div className="border-t pt-2">
                                <div className="mb-2 text-xs text-muted-foreground">Timeline scroll</div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            chartContainerRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
                                        }}
                                        aria-label="Scroll timeline left"
                                        data-testid="gantt-scroll-left-button"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            chartContainerRef.current?.scrollBy({ left: 300, behavior: 'smooth' });
                                        }}
                                        aria-label="Scroll timeline right"
                                        data-testid="gantt-scroll-right-button"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
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
                            onTasksUpdate={handleTasksChange}
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
                            key={isTableVisible ? 'with-table' : 'full-width'}
                            tasks={ganttTasks}
                            dependencies={ganttDependencies}
                            viewMode={viewMode}
                            onTasksUpdate={handleTasksChange}
                            onTaskDelete={(t) => onDeleteTask(t.originalId)}
                            onAddDependency={onAddDependency}
                            onDeleteDependency={onDeleteDependency}
                            onTaskDoubleClick={onDoubleClick}
                            editMode={editMode}
                            showProgress={showProgress}
                            allowProgressEdit={allowProgressEdit}
                            allowTaskMove={allowTaskMove}
                            allowTaskResize={allowTaskResize}
                            focusMode={focusMode}
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

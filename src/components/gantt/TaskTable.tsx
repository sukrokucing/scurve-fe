// Task Table component for editing tasks in split view
import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
} from '@tanstack/react-table';
import type { GanttTask, GanttDependency } from './types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Trash2, Plus, X } from 'lucide-react';
import { HEADER_HEIGHT, ROW_HEIGHT } from './constants';
import {
    Dialog,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const columnHelper = createColumnHelper<GanttTask>();

interface TaskTableProps {
    tasks: GanttTask[];
    dependencies: GanttDependency[];
    onTasksUpdate: (tasks: GanttTask[]) => void;
    onTaskDelete: (task: GanttTask) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
    onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const TaskTable = forwardRef<HTMLDivElement, TaskTableProps>(function TaskTable({
    tasks,
    dependencies,
    onTasksUpdate,
    onTaskDelete,
    onAddDependency,
    onDeleteDependency,
    onScroll,
}, ref) {
    const [data, setData] = useState(() => [...tasks]);
    const containerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

    useEffect(() => {
        setData(tasks);
    }, [tasks]);

    const taskById = useMemo(() => {
        const map = new Map<string, GanttTask>();
        tasks.forEach((task) => {
            map.set(task.id, task);
        });
        return map;
    }, [tasks]);

    const dependencyBySourceTarget = useMemo(() => {
        const map = new Map<string, GanttDependency>();
        dependencies.forEach((dependency) => {
            map.set(`${dependency.source_task_id}::${dependency.target_task_id}`, dependency);
        });
        return map;
    }, [dependencies]);

    const dependencyReachability = useMemo(() => {
        const adjacency = new Map<string, string[]>();
        tasks.forEach((task) => {
            adjacency.set(task.id, task.dependencies ?? []);
        });

        const cache = new Map<string, Set<string>>();
        const visiting = new Set<string>();

        const collectReachable = (taskId: string): Set<string> => {
            const cached = cache.get(taskId);
            if (cached) {
                return cached;
            }

            // Graph should be acyclic, but guard against accidental loops.
            if (visiting.has(taskId)) {
                return new Set<string>();
            }
            visiting.add(taskId);

            const reachable = new Set<string>();
            const nextTasks = adjacency.get(taskId) ?? [];
            nextTasks.forEach((nextTaskId) => {
                reachable.add(nextTaskId);
                const nested = collectReachable(nextTaskId);
                nested.forEach((nestedTaskId) => reachable.add(nestedTaskId));
            });

            visiting.delete(taskId);
            cache.set(taskId, reachable);
            return reachable;
        };

        tasks.forEach((task) => {
            collectReachable(task.id);
        });

        return cache;
    }, [tasks]);

    const [taskToDelete, setTaskToDelete] = useState<GanttTask | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const wouldCreateDependencyCycle = useCallback((dependentId: string, predecessorId: string) => {
        if (dependentId === predecessorId) return true;
        return dependencyReachability.get(predecessorId)?.has(dependentId) ?? false;
    }, [dependencyReachability]);

    const updateLocalTask = useCallback((taskId: string, patch: Partial<GanttTask>) => {
        setData((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
    }, []);

    const commitTaskName = useCallback((taskId: string, rawName: string) => {
        const sourceTask = taskById.get(taskId);
        if (!sourceTask) return;

        const nextName = rawName.trim();
        if (!nextName) {
            // Prevent empty task names in UI and restore server value.
            updateLocalTask(taskId, { name: sourceTask.name });
            return;
        }

        if (nextName === sourceTask.name) return;
        onTasksUpdate([{ ...sourceTask, name: nextName }]);
    }, [onTasksUpdate, taskById, updateLocalTask]);

    const columns = [
        columnHelper.display({
            id: 'rowNumber',
            header: '#',
            size: 50,
            cell: (info) => (
                <div className="text-center text-muted-foreground">
                    {info.row.index + 1}
                </div>
            ),
        }),
        columnHelper.accessor('name', {
            header: 'Task Name',
            size: 200,
            cell: (info) => {
                const task = info.row.original;
                return (
                    <Input
                        value={info.getValue()}
                        onChange={(e) => {
                            updateLocalTask(task.id, { name: e.target.value });
                        }}
                        onBlur={(e) => {
                            commitTaskName(task.id, e.target.value);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                (e.currentTarget as HTMLInputElement).blur();
                                return;
                            }
                            if (e.key === 'Escape') {
                                const sourceTask = taskById.get(task.id);
                                if (sourceTask) {
                                    updateLocalTask(task.id, { name: sourceTask.name });
                                }
                                (e.currentTarget as HTMLInputElement).blur();
                            }
                        }}
                        className="h-9 border-none shadow-none focus-visible:ring-1 min-w-0"
                        aria-label={`Task name row ${info.row.index + 1}`}
                        data-testid="gantt-table-task-name-input"
                    />
                );
            },
        }),
        columnHelper.accessor('duration', {
            header: 'Plan',
            size: 80,
            cell: (info) => (
                <div className="text-center">
                    {info.getValue() ? `${info.getValue()}d` : '-'}
                </div>
            ),
        }),
        columnHelper.accessor('status', {
            header: 'Status',
            size: 100,
            cell: (info) => {
                const status = info.getValue() || 'todo';
                const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
                    todo: "secondary",
                    in_progress: "default",
                    done: "outline",
                    blocked: "destructive"
                };
                return (
                    <Badge variant={variants[status] || "secondary"} className="capitalize">
                        {status.replace('_', ' ')}
                    </Badge>
                );
            },
        }),
        columnHelper.display({
            id: 'dependencies',
            header: 'Predecessors',
            size: 240,
            cell: (info) => {
                const task = info.row.original;
                const currentDeps = task.dependencies || [];
                const currentDepSet = new Set(currentDeps);
                const dependencyDetails = currentDeps.map((dependencyTaskId) => {
                    const dependencyTask = taskById.get(dependencyTaskId);
                    const dependencyObj = dependencyBySourceTarget.get(`${task.id}::${dependencyTaskId}`);
                    return {
                        dependencyTaskId,
                        label: dependencyTask?.name ?? 'Unknown',
                        dependencyObj,
                    };
                });
                const primaryDependency = dependencyDetails[0];
                const primaryDependencyId = primaryDependency?.dependencyObj?.id;
                const hiddenDependencies = dependencyDetails.slice(1);
                const hiddenDependencyCount = hiddenDependencies.length;
                const hiddenDependencyTitle = hiddenDependencies.map((dependency) => dependency.label).join(', ');
                const predecessorOptions = tasks
                    .filter((candidateTask) =>
                        candidateTask.id !== task.id
                        && !currentDepSet.has(candidateTask.id)
                        && !wouldCreateDependencyCycle(task.id, candidateTask.id)
                    )
                    .map((candidateTask) => ({ value: candidateTask.id, label: candidateTask.name }));
                const canAddPredecessor = predecessorOptions.length > 0;

                return (
                    <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap py-1 [scrollbar-width:thin]">
                        {primaryDependency ? (
                            <Badge variant="secondary" className="h-7 shrink-0 text-xs gap-1 px-1.5">
                                <span className="truncate max-w-[140px]" title={primaryDependency.label}>
                                    {primaryDependency.label}
                                </span>
                                {primaryDependencyId ? (
                                    <button
                                        type="button"
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-sm cursor-pointer hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong"
                                        aria-label={`Remove predecessor ${primaryDependency.label}`}
                                        data-testid="gantt-dependency-remove-button"
                                        onClick={() => onDeleteDependency(primaryDependencyId)}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                ) : null}
                            </Badge>
                        ) : null}

                        {hiddenDependencyCount > 0 ? (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong"
                                        aria-label={`Show ${hiddenDependencyCount} more predecessors for ${task.name}`}
                                        data-testid="gantt-dependency-overflow-trigger"
                                    >
                                        <Badge
                                            variant="outline"
                                            className="h-7 text-xs px-1.5"
                                            title={hiddenDependencyTitle}
                                            data-testid="gantt-dependency-overflow-badge"
                                        >
                                            +{hiddenDependencyCount}
                                        </Badge>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent
                                    align="start"
                                    className="w-[260px] p-2"
                                    data-testid="gantt-dependency-overflow-popover"
                                >
                                    <div className="px-1 pb-1 text-xs text-muted-foreground">Hidden predecessors</div>
                                    <div className="space-y-1">
                                        {hiddenDependencies.map((dependency) => {
                                            const dependencyId = dependency.dependencyObj?.id;
                                            return (
                                                <div
                                                    key={dependency.dependencyTaskId}
                                                    className="flex items-center gap-2 rounded-md border bg-surface px-2 py-1.5"
                                                >
                                                    <span className="min-w-0 flex-1 truncate text-xs" title={dependency.label}>
                                                        {dependency.label}
                                                    </span>
                                                    {dependencyId ? (
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-9 w-9 items-center justify-center rounded-sm cursor-pointer hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong"
                                                            aria-label={`Remove predecessor ${dependency.label}`}
                                                            data-testid="gantt-dependency-overflow-remove-button"
                                                            onClick={() => onDeleteDependency(dependencyId)}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        ) : null}

                        <Combobox
                            onChange={(val) => {
                                if (wouldCreateDependencyCycle(task.id, val)) return;
                                onAddDependency(task.id, val);
                            }}
                            placeholder="Add Predecessor..."
                            searchPlaceholder="Search tasks..."
                            matchTriggerWidth={false}
                            contentClassName="min-w-[260px] max-w-[420px] w-[min(420px,calc(100vw-2rem))]"
                            options={predecessorOptions}
                        >
                            <Button
                                type="button"
                                className="h-9 shrink-0 border-dashed border-2 rounded-md px-2 text-xs font-medium hover:border-primary hover:text-primary"
                                variant="outline"
                                disabled={!canAddPredecessor}
                                title={canAddPredecessor ? "Add predecessor" : "No valid predecessors available"}
                                aria-label={`Add predecessor to ${task.name}`}
                                data-testid="gantt-dependency-add-button"
                            >
                                <Plus className="mr-1 h-3 w-3" />
                                {canAddPredecessor ? "Add" : "None"}
                            </Button>
                        </Combobox>
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: '',
            size: 60,
            cell: (info) => (
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                        setTaskToDelete(info.row.original);
                        setConfirmOpen(true);
                    }}
                    aria-label={`Delete task ${info.row.original.name}`}
                    data-testid="gantt-table-row-delete-button"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            ),
        }),
    ];

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });
    const rows = table.getRowModel().rows;
    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => ROW_HEIGHT,
        getItemKey: (index) => rows[index]?.id ?? `table-row-${index}`,
        overscan: 8,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalVirtualHeight = rowVirtualizer.getTotalSize();
    const visibleColumnCount = table.getVisibleLeafColumns().length;
    const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
    const paddingBottom = virtualRows.length > 0
        ? totalVirtualHeight - virtualRows[virtualRows.length - 1].end
        : 0;

    return (
        <>
            <div
                ref={containerRef}
                className="w-full h-full overflow-auto"
                onScroll={onScroll}
            >
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-background text-muted-foreground font-medium sticky top-0 z-50 shadow-sm">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="p-0 border-r last:border-r-0 border-b bg-background"
                                        style={{ width: header.getSize(), height: HEADER_HEIGHT }}
                                    >
                                        <div className="flex items-center h-full px-4 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {paddingTop > 0 ? (
                            <tr aria-hidden="true">
                                <td colSpan={visibleColumnCount} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
                            </tr>
                        ) : null}

                        {virtualRows.map((virtualRow) => {
                            const row = rows[virtualRow.index];
                            if (!row) return null;
                            return (
                            <tr
                                key={row.id}
                                className="border-b hover:bg-muted/50 transition-colors h-[50px]"
                                style={{ height: `${virtualRow.size}px` }}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td
                                        key={cell.id}
                                        className="px-2 py-0 h-[50px]"
                                        style={{ width: cell.column.getSize() }}
                                    >
                                        <div className="flex items-center h-full">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                            );
                        })}

                        {paddingBottom > 0 ? (
                            <tr aria-hidden="true">
                                <td colSpan={visibleColumnCount} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setTaskToDelete(null); setConfirmOpen(open); }}>
                <AppDialogContent
                    title="Delete task"
                    description={`Are you sure you want to permanently delete "${taskToDelete?.name}"? This action cannot be undone.`}
                >
                    <div className="flex justify-end gap-2 mt-4">
                        <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={() => {
                            if (taskToDelete) {
                                onTaskDelete(taskToDelete);
                            }
                            setConfirmOpen(false);
                        }}>
                            Delete
                        </Button>
                    </div>
                    <DialogFooter />
                    <DialogClose />
                </AppDialogContent>
            </Dialog>
        </>
    );
});

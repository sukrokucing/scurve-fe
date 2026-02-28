// Task Table component for editing tasks in split view
import { useState, useEffect, useCallback, forwardRef } from 'react';
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
import { HEADER_HEIGHT } from './constants';
import {
    Dialog,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";

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

    useEffect(() => {
        setData(tasks);
    }, [tasks]);

    const [taskToDelete, setTaskToDelete] = useState<GanttTask | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const wouldCreateDependencyCycle = useCallback((dependentId: string, predecessorId: string) => {
        if (dependentId === predecessorId) return true;

        const dependencyMap = new Map<string, string[]>();
        tasks.forEach((task) => {
            dependencyMap.set(task.id, task.dependencies ?? []);
        });

        const stack = [predecessorId];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current || visited.has(current)) continue;
            if (current === dependentId) return true;
            visited.add(current);

            const next = dependencyMap.get(current) ?? [];
            next.forEach((taskId) => {
                if (!visited.has(taskId)) {
                    stack.push(taskId);
                }
            });
        }

        return false;
    }, [tasks]);

    const updateLocalTask = useCallback((taskId: string, patch: Partial<GanttTask>) => {
        setData((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
    }, []);

    const commitTaskName = useCallback((taskId: string, rawName: string) => {
        const sourceTask = tasks.find((task) => task.id === taskId);
        if (!sourceTask) return;

        const nextName = rawName.trim();
        if (!nextName) {
            // Prevent empty task names in UI and restore server value.
            updateLocalTask(taskId, { name: sourceTask.name });
            return;
        }

        if (nextName === sourceTask.name) return;
        onTasksUpdate([{ ...sourceTask, name: nextName }]);
    }, [tasks, onTasksUpdate, updateLocalTask]);

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
                                const sourceTask = tasks.find((item) => item.id === task.id);
                                if (sourceTask) {
                                    updateLocalTask(task.id, { name: sourceTask.name });
                                }
                                (e.currentTarget as HTMLInputElement).blur();
                            }
                        }}
                        className="h-8 border-none shadow-none focus-visible:ring-1 min-w-0"
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

                return (
                    <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap py-1 [scrollbar-width:thin]">
                        {currentDeps.map((depId) => {
                            const depTask = tasks.find((t) => t.id === depId);
                            const depObj = dependencies.find(
                                (d) => d.source_task_id === task.id && d.target_task_id === depId
                            );
                            const depLabel = depTask?.name ?? 'Unknown';

                            return (
                                <Badge key={depId} variant="secondary" className="h-6 shrink-0 text-xs gap-1 px-1">
                                    <span className="truncate max-w-[140px]" title={depLabel}>{depLabel}</span>
                                    {depObj && (
                                        <button
                                            type="button"
                                            className="cursor-pointer hover:text-destructive"
                                            aria-label={`Remove predecessor ${depTask?.name ?? depId}`}
                                            data-testid="gantt-dependency-remove-button"
                                            onClick={() => onDeleteDependency(depObj.id)}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </Badge>
                            );
                        })}
                        <Combobox
                            onChange={(val) => {
                                if (wouldCreateDependencyCycle(task.id, val)) return;
                                onAddDependency(task.id, val);
                            }}
                            placeholder="Add Predecessor..."
                            searchPlaceholder="Search tasks..."
                            options={tasks
                                .filter((t) =>
                                    t.id !== task.id
                                    && !currentDeps.includes(t.id)
                                    && !wouldCreateDependencyCycle(task.id, t.id)
                                )
                                .map(t => ({ value: t.id, label: t.name }))
                            }
                        >
                            <Button
                                type="button"
                                className="h-6 w-6 shrink-0 p-0 border-dashed border-2 rounded-full flex items-center justify-center hover:border-primary hover:text-primary"
                                variant="outline"
                                aria-label={`Add predecessor to ${task.name}`}
                                data-testid="gantt-dependency-add-button"
                            >
                                <Plus className="h-3 w-3" />
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
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
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

    return (
        <>
            <div
                ref={ref}
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
                        {table.getRowModel().rows.map((row) => (
                            <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors h-[50px]">
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
                        ))}
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

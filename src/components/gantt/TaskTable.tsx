// Task Table component for editing tasks in split view
import { useState, useEffect, forwardRef } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Trash2, Plus, X } from 'lucide-react';
import { HEADER_HEIGHT } from './constants';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog";

const columnHelper = createColumnHelper<GanttTask>();

interface TaskTableProps {
    tasks: GanttTask[];
    dependencies: GanttDependency[];
    onTaskUpdate: (task: GanttTask) => void;
    onTaskDelete: (task: GanttTask) => void;
    onAddDependency: (sourceId: string, targetId: string) => void;
    onDeleteDependency: (dependencyId: string) => void;
    onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const TaskTable = forwardRef<HTMLDivElement, TaskTableProps>(function TaskTable({
    tasks,
    dependencies,
    onTaskUpdate,
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
            cell: (info) => (
                <Input
                    value={info.getValue()}
                    onChange={(e) => {
                        const updated = { ...info.row.original, name: e.target.value };
                        onTaskUpdate(updated);
                    }}
                    className="h-8 border-none shadow-none focus-visible:ring-1 min-w-0"
                />
            ),
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
            size: 180,
            cell: (info) => {
                const task = info.row.original;
                const currentDeps = task.dependencies || [];

                return (
                    <div className="flex flex-wrap gap-1 items-center min-w-[150px]">
                        {currentDeps.map((depId) => {
                            const depTask = tasks.find((t) => t.id === depId);
                            const depObj = dependencies.find(
                                (d) => d.source_task_id === task.id && d.target_task_id === depId
                            );

                            return (
                                <Badge key={depId} variant="secondary" className="h-6 text-xs gap-1 px-1">
                                    <span className="truncate max-w-[80px]">{depTask?.name ?? 'Unknown'}</span>
                                    {depObj && (
                                        <X
                                            className="h-3 w-3 cursor-pointer hover:text-destructive"
                                            onClick={() => onDeleteDependency(depObj.id)}
                                        />
                                    )}
                                </Badge>
                            );
                        })}
                        <Select onValueChange={(val) => onAddDependency(task.id, val)}>
                            <SelectTrigger className="h-6 w-6 p-0 border-dashed border-2 rounded-full flex items-center justify-center hover:border-primary hover:text-primary">
                                <Plus className="h-3 w-3" />
                            </SelectTrigger>
                            <SelectContent>
                                {tasks
                                    .filter((t) => t.id !== task.id && !currentDeps.includes(t.id))
                                    .map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete task</DialogTitle>
                        <DialogDescription>Are you sure you want to permanently delete "{taskToDelete?.name}"? This action cannot be undone.</DialogDescription>
                    </DialogHeader>
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
                </DialogContent>
            </Dialog>
        </>
    );
});

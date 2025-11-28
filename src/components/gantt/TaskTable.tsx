import { useState, useEffect } from "react";
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
} from "@tanstack/react-table";
import type { GanttTask, GanttProps } from "./types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, X } from "lucide-react";

const columnHelper = createColumnHelper<GanttTask>();

export function TaskTable({ tasks, dependencies, onTaskUpdate, onTaskDelete, onAddDependency, onDeleteDependency }: GanttProps) {
    const [data, setData] = useState(() => [...tasks]);

    useEffect(() => {
        setData(tasks);
    }, [tasks]);

    const columns = [
        columnHelper.accessor("name", {
            header: "Task Name",
            cell: (info) => (
                <Input
                    value={info.getValue()}
                    onChange={(e) => {
                        const updated = { ...info.row.original, name: e.target.value };
                        onTaskUpdate(updated);
                    }}
                    className="h-8 border-none shadow-none focus-visible:ring-1"
                />
            ),
        }),
        columnHelper.accessor("start", {
            header: "Start Date",
            cell: (info) => (
                <Input
                    type="date"
                    value={info.getValue().toISOString().split("T")[0]}
                    onChange={(e) => {
                        const date = new Date(e.target.value);
                        if (!isNaN(date.getTime())) {
                            const updated = { ...info.row.original, start: date };
                            onTaskUpdate(updated);
                        }
                    }}
                    className="h-8 w-32 border-none shadow-none focus-visible:ring-1"
                />
            ),
        }),
        columnHelper.accessor("end", {
            header: "End Date",
            cell: (info) => (
                <Input
                    type="date"
                    value={info.getValue().toISOString().split("T")[0]}
                    onChange={(e) => {
                        const date = new Date(e.target.value);
                        if (!isNaN(date.getTime())) {
                            const updated = { ...info.row.original, end: date };
                            onTaskUpdate(updated);
                        }
                    }}
                    className="h-8 w-32 border-none shadow-none focus-visible:ring-1"
                />
            ),
        }),
        columnHelper.accessor("progress", {
            header: "%",
            cell: (info) => (
                <Input
                    type="number"
                    min="0"
                    max="100"
                    value={info.getValue()}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                            const updated = { ...info.row.original, progress: val };
                            onTaskUpdate(updated);
                        }
                    }}
                    className="h-8 w-16 border-none shadow-none focus-visible:ring-1"
                />
            ),
        }),
        columnHelper.display({
            id: "dependencies",
            header: "Predecessors",
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
                                    <span className="truncate max-w-[80px]">{depTask?.name ?? "Unknown"}</span>
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
            id: "actions",
            cell: (info) => (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onTaskDelete(info.row.original)}
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
        <div className="w-full">
            <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium sticky top-0 z-10">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <th key={header.id} className="h-10 px-4 border-b font-medium">
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50 transition-colors">
                            {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="p-1">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

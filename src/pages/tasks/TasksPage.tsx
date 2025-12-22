import { useEffect, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { addDays, format, isSameDay } from "date-fns";

import { useProjectsQuery } from "@/api/queries/projects";
import { useTasksByProject, useTaskMutation, useDeleteTask, useUpdateTask, useBatchUpdateTasks, useDependencies, useDependencyMutation, useDeleteDependency } from "@/api/queries/tasks";
import { taskSchema, type TaskFormValues } from "@/schemas/task";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import type { Task, TaskStatus } from "@/types/domain";
import type { components } from "@/types/api";

type Progress = components["schemas"]["Progress"];
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useNetworkStore } from "@/store/networkStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { GanttView } from "@/components/gantt/GanttView";
import type { GanttTask } from "@/components/gantt/types";
import { KanbanProvider, KanbanBoard, KanbanHeader, KanbanCards, KanbanCard } from "@/components/kanban/board";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, List, Kanban, CalendarRange, ListTodo } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";


const KANBAN_COLUMNS = [
    { id: "todo", title: "To Do" },
    { id: "in_progress", title: "In Progress" },
    { id: "blocked", title: "Blocked" },
    { id: "done", title: "Done" },
];

// Helper to format ISO date strings for datetime-local input
// Helper to format ISO date strings for datetime-local input
function formatDateForInput(isoDate: string | null | undefined): string {
    if (!isoDate) return "";
    try {
        const date = new Date(isoDate);
        // Format as YYYY-MM-DDTHH:MM for datetime-local input
        return format(date, "yyyy-MM-dd'T'HH:mm");
    } catch {
        return "";
    }
}



function getStatusVariant(status: string): "success" | "info" | "error" | "secondary" {
    switch (status) {
        case "todo":
            return "secondary";
        case "in_progress":
            return "info";
        case "blocked":
            return "error";
        case "done":
            return "success";
        default:
            return "secondary";
    }
}
// Types
type TaskFormMode = 'today' | 'plan' | 'range';

export function TasksPage() {
    const { data: projects } = useProjectsQuery();
    const [selectedProject, setSelectedProject] = useState<string>("");
    const [createMode, setCreateMode] = useState<'plan' | 'range' | 'today'>('plan');
    const [editMode, setEditMode] = useState<'plan' | 'range' | 'today'>('plan');

    useEffect(() => {
        if (!projects || projects.length === 0) return;
        setSelectedProject((current) => (current ? current : projects[0]?.id ?? ""));
    }, [projects]);
    const [view, setView] = useState<"list" | "gantt" | "kanban">("list");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Fetch tasks
    const { data: tasksData, isLoading: isLoadingTasks, refetch: refetchTasks, isRefetching: isRefetchingTasks } = useTasksByProject(
        selectedProject ?? "",
        false,
    );

    // Fetch progress (always fetch if we might need it, or only when in Gantt mode?)
    // For simplicity, let's fetch it if we are in Gantt mode or showProgress is true
    const { data: progressData, isLoading: isLoadingProgress } = useTasksByProject(
        selectedProject ?? "",
        true,
        { enabled: view === "gantt" }
    );
    // Optimization: We could disable this query if view !== 'gantt'.
    // However, the hook signature 'useTasksByProject' defines 'enabled: Boolean(projectId)'.
    // To implement "enabled: view === 'gantt'", we would need to pass options to the hook.
    // Since we can't change the hook signature easily without affecting other files,
    // I will modify the HOOK to accept options or modify the call site if possible.

    const { data: dependenciesData } = useDependencies(selectedProject ?? "");

    const tasks = (tasksData as Task[]) ?? [];
    const progress = (progressData as Progress[]) ?? [];
    const isLoading = isLoadingTasks || (view === "gantt" && isLoadingProgress);

    // Filter tasks
    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || task.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Virtualizer for List View
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: filteredTasks.slice((page - 1) * pageSize, page * pageSize).length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53, // Approximate height of a table row
        overscan: 5,
    });

    const isRefetching = isRefetchingTasks;

    // Re-run query when toggling progress view
    useEffect(() => {
        void refetchTasks();
    }, [view, refetchTasks]);

    const createForm = useForm<TaskFormValues>({ defaultValues: { title: "", plan: 1, progress: 0, status: "todo" } });
    const [createOpen, setCreateOpen] = useState(false);
    const createRef = useRef<HTMLInputElement | null>(null);
    const [editing, setEditing] = useState<Task | null>(null);
    const editForm = useForm<TaskFormValues>({ defaultValues: { title: "", plan: 1, progress: 0, status: "todo" } });

    const createMutation = useTaskMutation(selectedProject);
    const deleteMutation = useDeleteTask(selectedProject);
    const updateMutation = useUpdateTask();
    const batchUpdateMutation = useBatchUpdateTasks(selectedProject);
    const dependencyMutation = useDependencyMutation(selectedProject);
    const deleteDependencyMutation = useDeleteDependency(selectedProject);

    const currentProject = projects?.find((project) => project.id === selectedProject);
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Prepare content for CardContent to keep JSX simple and avoid nested ternaries
    const content = (() => {
        if (!selectedProject) return (
            <p className="text-sm text-muted-foreground">Choose a project to inspect its tasks.</p>
        );
        if (isLoading) return (
            <div className="space-y-2">
                <Skeleton className="w-full h-5" />
                <Skeleton className="w-5/6 h-5" />
                <Skeleton className="w-4/6 h-5" />
            </div>
        );
        if (!tasks || tasks.length === 0) return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                    <ListTodo className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No tasks found</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-2">
                    Get started by creating a new task using the button above.
                </p>
            </div>
        );

        if (view === "kanban") {
            return (
                <div className="h-[calc(100vh-280px)]">
                    <KanbanProvider
                        columns={KANBAN_COLUMNS}
                        data={filteredTasks.map(t => ({ ...t, column: t.status }))}
                        onColumnChange={(taskId, newColumnId) => {
                            updateMutation.mutate({
                                id: taskId,
                                projectId: selectedProject,
                                payload: { status: newColumnId as TaskStatus }
                            });
                        }}

                    >
                        {(column) => (
                            <KanbanBoard id={column.id} key={column.id}>
                                <KanbanHeader>
                                    {column.title}
                                    <Badge variant="secondary" className="ml-2">
                                        {filteredTasks.filter(t => t.status === column.id).length}
                                    </Badge>
                                </KanbanHeader>
                                <KanbanCards id={column.id}>
                                    {(task) => (
                                        <KanbanCard
                                            key={task.id}
                                            item={task}
                                            onDoubleClick={(item) => {
                                                const t = item as unknown as Task;
                                                setEditing(t);
                                                const start = t.startDate ? new Date(t.startDate) : new Date();
                                                const end = t.endDate ? new Date(t.endDate) : new Date();
                                                const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                                                let mode: 'plan' | 'range' | 'today' = 'range';

                                                if (isSameDay(start, end)) {
                                                    mode = 'today';
                                                } else if (t.durationDays && diffDays === t.durationDays) {
                                                    mode = 'plan';
                                                }

                                                setEditMode(mode);
                                                editForm.reset({
                                                    title: t.name,
                                                    plan: t.durationDays ?? 1,
                                                    start_date: formatDateForInput(t.startDate),
                                                    end_date: formatDateForInput(t.endDate),
                                                    progress: typeof t.progress === 'number' ? t.progress : 0,
                                                    status: t.status,
                                                    projectId: t.projectId
                                                });
                                            }}
                                        >

                                            <div className="font-medium text-sm leading-tight">{(task as any).name}</div>
                                            {(task as any).description && (
                                                <div className="text-xs text-muted-foreground line-clamp-2">{(task as any).description}</div>
                                            )}

                                            <div className="flex items-center justify-between pt-2">
                                                {(task as any).assigneeId && (
                                                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold">
                                                        U
                                                    </div>
                                                )}

                                                {(task as any).dueDate && (
                                                    <div className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                        {format(new Date((task as any).dueDate), "MMM d")}
                                                    </div>
                                                )}


                                            </div>
                                        </KanbanCard>
                                    )}
                                </KanbanCards>
                            </KanbanBoard>
                        )}
                    </KanbanProvider>
                </div>
            );
        }

        if (view === "gantt") {
            return (
                <GanttView
                    projectId={selectedProject || ""}
                    tasks={filteredTasks}
                    progress={progress}
                    dependencies={dependenciesData ?? []}
                    onUpdateTasks={(updatedTasks: GanttTask[]) => {
                        if (!selectedProject) return;

                        if (updatedTasks.length === 1) {
                            const task = updatedTasks[0];
                            updateMutation.mutate({
                                id: task.originalId,
                                projectId: selectedProject,
                                payload: {
                                    name: task.name,
                                    startDate: task.start.toISOString(),
                                    endDate: task.end.toISOString(),
                                    dueDate: task.end.toISOString(),
                                    progress: task.progress,
                                },
                            });
                        } else if (updatedTasks.length > 1) {
                            batchUpdateMutation.mutate({
                                tasks: updatedTasks.map(t => ({
                                    id: t.originalId,
                                    title: t.name,
                                    start_date: t.start.toISOString(),
                                    end_date: t.end.toISOString(),
                                    due_date: t.end.toISOString(),
                                    progress: t.progress,
                                }))
                            });
                        }
                    }}
                    onDeleteTask={(taskId) => {
                        deleteMutation.mutate(taskId);
                    }}
                    onAddDependency={(sourceId, targetId) => {
                        if (!selectedProject) return;
                        dependencyMutation.mutate({
                            source_task_id: sourceId,
                            target_task_id: targetId,
                            type_: "finish-to-start",
                        });
                    }}
                    onDeleteDependency={(dependencyId) => {
                        deleteDependencyMutation.mutate(dependencyId);
                    }}
                    onDoubleClick={(ganttTask) => {
                        // Find the full task object to edit
                        const taskToEdit = (filteredTasks as Task[]).find(t => t.id === ganttTask.originalId);
                        if (taskToEdit) {
                            setEditing(taskToEdit);
                            const start = new Date(taskToEdit.startDate || "");
                            const end = new Date(taskToEdit.endDate || "");
                            const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                            let mode: 'plan' | 'range' | 'today' = 'range';

                            if (isSameDay(start, end)) {
                                mode = 'today';
                            } else if (taskToEdit.durationDays && diffDays === taskToEdit.durationDays) {
                                mode = 'plan';
                            }

                            setEditMode(mode);
                            editForm.reset({
                                title: taskToEdit.name,
                                plan: taskToEdit.durationDays ?? 1,
                                start_date: formatDateForInput(taskToEdit.startDate),
                                end_date: formatDateForInput(taskToEdit.endDate),
                                progress: typeof taskToEdit.progress === 'number' ? taskToEdit.progress : 0,
                                status: taskToEdit.status,
                                projectId: taskToEdit.projectId
                            });
                        }
                    }}
                />
            );
        }

        // tasks present
        return (
            <div
                ref={parentRef}
                style={{
                    height: `calc(100vh - 280px)`,
                    overflow: 'auto',
                }}
            >
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Assignee</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rowVirtualizer.getVirtualItems().length === 0 && (
                            <TableRow key="no-tasks">
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No tasks found.
                                </TableCell>
                            </TableRow>
                        )}

                        {rowVirtualizer.getVirtualItems().length > 0 && (
                            <TableRow key={`spacer-start-${rowVirtualizer.getVirtualItems()[0].index}`} style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }}>
                                <TableCell colSpan={6} style={{ padding: 0 }} />
                            </TableRow>
                        )}

                        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                            const task = filteredTasks.slice((page - 1) * pageSize, page * pageSize)[virtualItem.index];
                            if (!task) return null; // Safety check
                            return (
                                <TableRow
                                    key={task.id}
                                    data-index={virtualItem.index}
                                    ref={rowVirtualizer.measureElement}
                                    onDoubleClick={() => {
                                        setEditing(task);
                                        const start = new Date(task.startDate || "");
                                        const end = new Date(task.endDate || "");
                                        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                                        let mode: 'plan' | 'range' | 'today' = 'range';

                                        if (isSameDay(start, end)) {
                                            mode = 'today';
                                        } else if (task.durationDays && diffDays === task.durationDays) {
                                            mode = 'plan';
                                        }

                                        setEditMode(mode);
                                        editForm.reset({
                                            title: task.name,
                                            plan: task.durationDays ?? 1,
                                            start_date: formatDateForInput(task.startDate),
                                            end_date: formatDateForInput(task.endDate),
                                            progress: typeof task.progress === 'number' ? task.progress : 0,
                                            status: task.status,
                                            projectId: task.projectId
                                        });
                                    }}
                                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                >
                                    <TableCell className="text-center text-muted-foreground">{virtualItem.index + 1}</TableCell>
                                    <TableCell className="font-medium">{task.name}</TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(task.status)}>
                                            {task.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{task.assigneeId ?? "—"}</TableCell>
                                    <TableCell>{task.durationDays ? `${task.durationDays}d` : "—"}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setEditing(task);
                                                    const start = new Date(task.startDate || "");
                                                    const end = new Date(task.endDate || "");
                                                    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                                                    let mode: 'plan' | 'range' | 'today' = 'range';

                                                    if (isSameDay(start, end)) {
                                                        mode = 'today';
                                                    } else if (task.durationDays && diffDays === task.durationDays) {
                                                        mode = 'plan';
                                                    }

                                                    setEditMode(mode);
                                                    editForm.reset({
                                                        title: task.name,
                                                        plan: task.durationDays ?? 1,
                                                        start_date: formatDateForInput(task.startDate),
                                                        end_date: formatDateForInput(task.endDate),
                                                        progress: typeof task.progress === 'number' ? task.progress : 0,
                                                        status: task.status,
                                                        projectId: task.projectId
                                                    });
                                                }}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive-outline"
                                                onClick={() => {
                                                    setTaskToDelete(task);
                                                    setConfirmOpen(true);
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}

                        {rowVirtualizer.getVirtualItems().length > 0 && (
                            <TableRow key={`spacer-end-${rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].index}`} style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px` }}>
                                <TableCell colSpan={6} style={{ padding: 0 }} />
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <DataTablePagination
                    currentPage={page}
                    totalPages={Math.ceil(filteredTasks.length / pageSize)}
                    pageSize={pageSize}
                    setPage={setPage}
                    setPageSize={setPageSize}
                    totalItems={filteredTasks.length}
                />
            </div>
        );
    })();

    const isRateLimited = useNetworkStore((state) => state.isRateLimited);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
                    <p className="text-muted-foreground leading-relaxed">
                        Track execution status and unblock your teams quickly.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <Combobox
                        options={projects?.map(p => ({ label: p.name, value: p.id })) ?? []}
                        value={selectedProject}
                        onChange={setSelectedProject}
                        className="w-56"
                        placeholder="Select project"
                        searchPlaceholder="Search projects..."
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => refetchTasks()}
                        disabled={!selectedProject || isRefetching || isRateLimited}
                    >
                        {isRateLimited ? "Cooling down..." : (isRefetching ? "Refreshing…" : "Refresh")}
                    </Button>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button type="button">New task</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create task</DialogTitle>
                                <DialogDescription>
                                    Create a new task for your project with optional progress tracking.
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...createForm}>
                                <form
                                    onSubmit={createForm.handleSubmit((values) => {
                                        createForm.clearErrors();
                                        const parsed = taskSchema.safeParse(values);
                                        if (!parsed.success) {
                                            const { fieldErrors } = parsed.error.flatten();
                                            Object.entries(fieldErrors).forEach(([k, v]) => {
                                                if (v && v.length) createForm.setError(k as keyof TaskFormValues, { type: "manual", message: v.join(", ") });
                                            });
                                            return;
                                        }

                                        // Determine target project: either from global selection or form selection
                                        const targetProjectId = selectedProject || parsed.data.projectId;
                                        if (!targetProjectId) {
                                            createForm.setError("projectId", { type: "manual", message: "Project is required" });
                                            return;
                                        }

                                        const dueDate = parsed.data.due_date
                                            ? new Date(parsed.data.due_date).toISOString()
                                            : null;
                                        const startDate = parsed.data.start_date
                                            ? new Date(parsed.data.start_date).toISOString()
                                            : null;
                                        const endDate = parsed.data.end_date
                                            ? new Date(parsed.data.end_date).toISOString()
                                            : null;

                                        const finalEndDate = endDate || (startDate && parsed.data.plan
                                            ? addDays(new Date(startDate), parsed.data.plan).toISOString()
                                            : null);

                                        createMutation.mutateAsync({
                                            name: parsed.data.title,
                                            dueDate: dueDate,
                                            startDate: startDate,
                                            endDate: finalEndDate,
                                            status: (parsed.data.status as any) || "todo",
                                            progress: parsed.data.progress || 0,
                                        })
                                            .then(() => {
                                                setCreateOpen(false);
                                                createForm.reset();
                                            })
                                            .catch((err: unknown) => {
                                                const fieldErrors = extractFieldErrorsFromAxios(err);
                                                if (fieldErrors) {
                                                    Object.entries(fieldErrors).forEach(([k, v]) => {
                                                        if (v && v.length) createForm.setError(k as keyof TaskFormValues, { type: "server", message: v.join(", ") });
                                                    });
                                                    return;
                                                }
                                            });
                                    })}
                                    className="space-y-6"
                                >
                                    <FormField
                                        control={createForm.control}
                                        name="projectId"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Project</FormLabel>
                                                <Combobox
                                                    options={projects?.map(p => ({ label: p.name, value: p.id })) ?? []}
                                                    value={field.value || selectedProject}
                                                    onChange={field.onChange}
                                                    placeholder="Select a project"
                                                    searchPlaceholder="Search projects..."
                                                    className="w-full"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={createForm.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Title</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        className={
                                                            createForm.formState.errors.title
                                                                ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0"
                                                                : ""
                                                        }
                                                        ref={(e) => {
                                                            if (typeof field.ref === "function") field.ref(e);
                                                            else if (field.ref && "current" in field.ref) (field.ref as { current?: HTMLInputElement | null }).current = e;
                                                            createRef.current = e;
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Schedule Mode Toggle - Horizontal Layout */}
                                    <div className="space-y-2">
                                        <Label>Duration</Label>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <ToggleGroup
                                                type="single"
                                                value={createMode}
                                                onValueChange={(value: TaskFormMode) => {
                                                    if (!value) return;
                                                    if (value === 'today') {
                                                        setCreateMode('today');
                                                        const now = new Date();
                                                        const endOfDay = new Date(now);
                                                        endOfDay.setHours(23, 59, 59, 999);
                                                        createForm.setValue("start_date", now.toISOString());
                                                        createForm.setValue("end_date", endOfDay.toISOString());
                                                        createForm.setValue("due_date", endOfDay.toISOString());
                                                        createForm.setValue("plan", 1);
                                                    } else if (value === 'plan') {
                                                        setCreateMode('plan');
                                                        const plan = createForm.getValues("plan") || 1;
                                                        const now = new Date();
                                                        const end = addDays(now, plan);
                                                        createForm.setValue("start_date", now.toISOString());
                                                        createForm.setValue("end_date", end.toISOString());
                                                        createForm.setValue("due_date", end.toISOString());
                                                    } else if (value === 'range') {
                                                        setCreateMode('range');
                                                        const start = createForm.getValues("start_date");
                                                        if (!start) {
                                                            const now = new Date();
                                                            const plan = createForm.getValues("plan") || 1;
                                                            const end = addDays(now, plan);
                                                            createForm.setValue("start_date", now.toISOString());
                                                            createForm.setValue("end_date", end.toISOString());
                                                            createForm.setValue("due_date", end.toISOString());
                                                        }
                                                    }
                                                }}
                                            >
                                                <ToggleGroupItem value="today">Today</ToggleGroupItem>
                                                <ToggleGroupItem value="plan">Duration</ToggleGroupItem>
                                                <ToggleGroupItem value="range">Custom</ToggleGroupItem>
                                            </ToggleGroup>

                                            {createMode === 'today' && (
                                                <Input
                                                    type="time"
                                                    className="w-28"
                                                    value={createForm.watch("start_date") ? format(new Date(createForm.watch("start_date")!), "HH:mm") : format(new Date(), "HH:mm")}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val) {
                                                            const [hours, minutes] = val.split(':').map(Number);
                                                            const today = new Date();
                                                            today.setHours(hours, minutes, 0, 0);
                                                            const endOfDay = new Date(today);
                                                            endOfDay.setHours(23, 59, 59, 999);
                                                            createForm.setValue("start_date", today.toISOString());
                                                            createForm.setValue("end_date", endOfDay.toISOString());
                                                            createForm.setValue("due_date", endOfDay.toISOString());
                                                            createForm.setValue("plan", 1);
                                                        }
                                                    }}
                                                />
                                            )}

                                            {createMode === 'plan' && (
                                                <Combobox
                                                    value={String(createForm.watch("plan") || 1)}
                                                    onChange={(val) => {
                                                        const newPlan = parseInt(val) || 1;
                                                        createForm.setValue("plan", newPlan);
                                                        const now = new Date();
                                                        const newEndDate = addDays(now, newPlan);
                                                        createForm.setValue("start_date", now.toISOString());
                                                        createForm.setValue("end_date", newEndDate.toISOString());
                                                        createForm.setValue("due_date", newEndDate.toISOString());
                                                    }}
                                                    options={[
                                                        { value: "1", label: "1 day" },
                                                        { value: "2", label: "2 days" },
                                                        { value: "3", label: "3 days" },
                                                        { value: "4", label: "4 days" },
                                                        { value: "5", label: "5 days" },
                                                    ]}
                                                    placeholder="Duration"
                                                    searchPlaceholder="Search days..."
                                                    className="w-28"
                                                />
                                            )}
                                        </div>

                                        {/* Date Range Inputs - Show below when range mode */}
                                        {createMode === 'range' && (
                                            <div className="grid grid-cols-2 gap-3 pt-2">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Start</Label>
                                                    <Input
                                                        type="datetime-local"
                                                        value={formatDateForInput(createForm.watch("start_date"))}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val) {
                                                                const date = new Date(val);
                                                                createForm.setValue("start_date", date.toISOString());
                                                                const endStr = createForm.getValues("end_date");
                                                                if (endStr) {
                                                                    const end = new Date(endStr);
                                                                    const days = Math.max(1, Math.ceil((end.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
                                                                    createForm.setValue("plan", days);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">End</Label>
                                                    <Input
                                                        type="datetime-local"
                                                        value={formatDateForInput(createForm.watch("end_date"))}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val) {
                                                                const date = new Date(val);
                                                                createForm.setValue("end_date", date.toISOString());
                                                                createForm.setValue("due_date", date.toISOString());
                                                                const startStr = createForm.getValues("start_date");
                                                                if (startStr) {
                                                                    const start = new Date(startStr);
                                                                    const days = Math.max(1, Math.ceil((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                                                                    createForm.setValue("plan", days);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Live Preview */}
                                        <p className="text-xs text-muted-foreground pt-1">
                                            {createMode === 'today' && (
                                                <>
                                                    Today {createForm.watch("start_date") ? format(new Date(createForm.watch("start_date")!), "HH:mm") : format(new Date(), "HH:mm")} → 23:59
                                                </>
                                            )}
                                            {createMode === 'plan' && createForm.watch("start_date") && createForm.watch("end_date") && (
                                                <>
                                                    {format(new Date(createForm.watch("start_date")!), "MMM d")} → {format(new Date(createForm.watch("end_date")!), "MMM d")} ({createForm.watch("plan")} day{(createForm.watch("plan") || 1) > 1 ? 's' : ''})
                                                </>
                                            )}
                                            {createMode === 'range' && createForm.watch("start_date") && createForm.watch("end_date") && (
                                                <>
                                                    {format(new Date(createForm.watch("start_date")!), "MMM d, HH:mm")} → {format(new Date(createForm.watch("end_date")!), "MMM d, HH:mm")}
                                                </>
                                            )}
                                        </p>
                                    </div>

                                    {/* Progress - Optional */}
                                    <FormField
                                        control={createForm.control}
                                        name="progress"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center justify-between text-muted-foreground">
                                                    <span>Progress (Optional)</span>
                                                    <span className="text-sm font-mono bg-primary/10 px-2 py-0.5 rounded">
                                                        {field.value ?? 0}%
                                                    </span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        step="5"
                                                        value={field.value ?? 0}
                                                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                                                        className="w-full"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex justify-end">
                                        <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                                        <Button type="submit" disabled={createForm.formState.isSubmitting}>
                                            {createForm.formState.isSubmitting ? "Creating…" : "Create"}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                            <DialogFooter />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
            <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle>{currentProject?.name ?? "Select a project"}</CardTitle>
                    <CardDescription>
                        View project backlog, progress and blockers from the backend API.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        {/* Search and Filter Toolbar */}
                        <div className="flex items-center gap-3 flex-1">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search tasks..."
                                    className="pl-9 h-10"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Combobox
                                value={statusFilter}
                                onChange={setStatusFilter}
                                options={[
                                    { value: "all", label: "All Status" },
                                    { value: "todo", label: "To Do" },
                                    { value: "in_progress", label: "In Progress" },
                                    { value: "blocked", label: "Blocked" },
                                    { value: "done", label: "Done" },
                                ]}
                                placeholder="Status"
                                searchPlaceholder="Search status..."
                                className="w-[140px]"
                            />
                        </div>

                        {/* View Toggle */}
                        <div className="flex items-center gap-2">
                            <Button variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")} className="h-10">
                                <List className="mr-2 h-4 w-4" />
                                List
                            </Button>
                            <Button variant={view === "kanban" ? "default" : "outline"} onClick={() => setView("kanban")} className="h-10">
                                <Kanban className="mr-2 h-4 w-4" />
                                Board
                            </Button>
                            <Button variant={view === "gantt" ? "default" : "outline"} onClick={() => setView("gantt")} className="h-10">
                                <CalendarRange className="mr-2 h-4 w-4" />
                                Gantt
                            </Button>
                        </div>
                    </div>
                    {content}
                </CardContent>
            </Card>
            {/* Edit dialog */}
            <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit task</DialogTitle>
                        <DialogDescription>
                            Update the task details and save your changes.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form
                            onSubmit={editForm.handleSubmit((values) => {
                                if (!editing) return;
                                editForm.clearErrors();
                                const parsed = taskSchema.safeParse(values);
                                if (!parsed.success) {
                                    const { fieldErrors } = parsed.error.flatten();
                                    Object.entries(fieldErrors).forEach(([k, v]) => {
                                        if (v && v.length) editForm.setError(k as keyof TaskFormValues, { type: "manual", message: v.join(", ") });
                                    });
                                    return;
                                }
                                const startDate = parsed.data.start_date
                                    ? new Date(parsed.data.start_date).toISOString()
                                    : undefined;
                                const endDate = parsed.data.end_date
                                    ? new Date(parsed.data.end_date).toISOString()
                                    : undefined;

                                const finalEndDate = endDate || (startDate && parsed.data.plan
                                    ? addDays(new Date(startDate), parsed.data.plan).toISOString()
                                    : undefined);

                                updateMutation.mutateAsync({
                                    id: editing.id,
                                    projectId: selectedProject,
                                    payload: {
                                        name: parsed.data.title,
                                        startDate,
                                        endDate: finalEndDate,
                                        progress: parsed.data.progress,
                                        durationDays: parsed.data.plan
                                    }
                                })

                                    .then(() => {
                                        setEditing(null);
                                    })
                                    .catch((err: unknown) => {
                                        const fieldErrors = extractFieldErrorsFromAxios(err);
                                        if (fieldErrors) {
                                            Object.entries(fieldErrors).forEach(([k, v]) => {
                                                if (v && v.length) editForm.setError(k as keyof TaskFormValues, { type: "server", message: v.join(", ") });
                                            });
                                            return;
                                        }
                                        // otherwise hook shows toast
                                    });
                            })}
                            className="space-y-6"
                        >
                            <FormField control={editForm.control} name="title" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Title</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="Enter task name..."
                                            className={editForm.formState.errors.title ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0" : ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            {/* Schedule Mode Toggle - Horizontal Layout */}
                            <div className="space-y-2">
                                <Label>Duration</Label>
                                <div className="flex flex-wrap items-center gap-3">
                                    <ToggleGroup
                                        type="single"
                                        value={editMode}
                                        onValueChange={(value: TaskFormMode) => {
                                            if (!value) return;
                                            if (value === 'today') {
                                                setEditMode('today');
                                                const now = new Date();
                                                const endOfDay = new Date(now);
                                                endOfDay.setHours(23, 59, 59, 999);
                                                editForm.setValue("start_date", now.toISOString());
                                                editForm.setValue("end_date", endOfDay.toISOString());
                                                editForm.setValue("due_date", endOfDay.toISOString());
                                                editForm.setValue("plan", 1);
                                            } else if (value === 'plan') {
                                                setEditMode('plan');
                                                const plan = editForm.getValues("plan") || 1;
                                                const now = new Date();
                                                const end = addDays(now, plan);
                                                editForm.setValue("start_date", now.toISOString());
                                                editForm.setValue("end_date", end.toISOString());
                                                editForm.setValue("due_date", end.toISOString());
                                            } else if (value === 'range') {
                                                setEditMode('range');
                                                const start = editForm.getValues("start_date");
                                                if (!start) {
                                                    const now = new Date();
                                                    const plan = editForm.getValues("plan") || 1;
                                                    const end = addDays(now, plan);
                                                    editForm.setValue("start_date", now.toISOString());
                                                    editForm.setValue("end_date", end.toISOString());
                                                    editForm.setValue("due_date", end.toISOString());
                                                }
                                            }
                                        }}
                                    >
                                        <ToggleGroupItem value="today">Today</ToggleGroupItem>
                                        <ToggleGroupItem value="plan">Duration</ToggleGroupItem>
                                        <ToggleGroupItem value="range">Custom</ToggleGroupItem>
                                    </ToggleGroup>

                                    {editMode === 'today' && (
                                        <Input
                                            type="time"
                                            className="w-28"
                                            value={editForm.watch("start_date") ? format(new Date(editForm.watch("start_date")!), "HH:mm") : format(new Date(), "HH:mm")}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val) {
                                                    const [hours, minutes] = val.split(':').map(Number);
                                                    const today = new Date();
                                                    today.setHours(hours, minutes, 0, 0);
                                                    const endOfDay = new Date(today);
                                                    endOfDay.setHours(23, 59, 59, 999);
                                                    editForm.setValue("start_date", today.toISOString());
                                                    editForm.setValue("end_date", endOfDay.toISOString());
                                                    editForm.setValue("due_date", endOfDay.toISOString());
                                                    editForm.setValue("plan", 1);
                                                }
                                            }}
                                        />
                                    )}

                                    {editMode === 'plan' && (
                                        <Combobox
                                            value={String(editForm.watch("plan") || 1)}
                                            onChange={(val) => {
                                                const newPlan = parseInt(val) || 1;
                                                editForm.setValue("plan", newPlan);
                                                const now = new Date();
                                                const newEndDate = addDays(now, newPlan);
                                                editForm.setValue("start_date", now.toISOString());
                                                editForm.setValue("end_date", newEndDate.toISOString());
                                                editForm.setValue("due_date", newEndDate.toISOString());
                                            }}
                                            options={[
                                                { value: "1", label: "1 day" },
                                                { value: "2", label: "2 days" },
                                                { value: "3", label: "3 days" },
                                                { value: "4", label: "4 days" },
                                                { value: "5", label: "5 days" },
                                            ]}
                                            placeholder="Duration"
                                            searchPlaceholder="Search days..."
                                            className="w-28"
                                        />
                                    )}
                                </div>

                                {/* Date Range Inputs - Show below when range mode */}
                                {editMode === 'range' && (
                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">Start</Label>
                                            <Input
                                                type="datetime-local"
                                                value={formatDateForInput(editForm.watch("start_date"))}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        const date = new Date(val);
                                                        editForm.setValue("start_date", date.toISOString());
                                                        const endStr = editForm.getValues("end_date");
                                                        if (endStr) {
                                                            const end = new Date(endStr);
                                                            const days = Math.max(1, Math.ceil((end.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
                                                            editForm.setValue("plan", days);
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">End</Label>
                                            <Input
                                                type="datetime-local"
                                                value={formatDateForInput(editForm.watch("end_date"))}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        const date = new Date(val);
                                                        editForm.setValue("end_date", date.toISOString());
                                                        editForm.setValue("due_date", date.toISOString());
                                                        const startStr = editForm.getValues("start_date");
                                                        if (startStr) {
                                                            const start = new Date(startStr);
                                                            const days = Math.max(1, Math.ceil((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                                                            editForm.setValue("plan", days);
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Live Preview */}
                                <p className="text-xs text-muted-foreground pt-1">
                                    {editMode === 'today' && (
                                        <>
                                            Today {editForm.watch("start_date") ? format(new Date(editForm.watch("start_date")!), "HH:mm") : format(new Date(), "HH:mm")} → 23:59
                                        </>
                                    )}
                                    {editMode === 'plan' && editForm.watch("start_date") && editForm.watch("end_date") && (
                                        <>
                                            {format(new Date(editForm.watch("start_date")!), "MMM d")} → {format(new Date(editForm.watch("end_date")!), "MMM d")} ({editForm.watch("plan")} day{(editForm.watch("plan") || 1) > 1 ? 's' : ''})
                                        </>
                                    )}
                                    {editMode === 'range' && editForm.watch("start_date") && editForm.watch("end_date") && (
                                        <>
                                            {format(new Date(editForm.watch("start_date")!), "MMM d, HH:mm")} → {format(new Date(editForm.watch("end_date")!), "MMM d, HH:mm")}
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Progress - Optional */}
                            <FormField control={editForm.control} name="progress" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center justify-between text-muted-foreground">
                                        <span>Progress (Optional)</span>
                                        <span className="text-sm font-mono bg-primary/10 px-2 py-0.5 rounded">
                                            {field.value ?? 0}%
                                        </span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={field.value ?? 0}
                                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </FormControl>
                                </FormItem>
                            )} />

                            <div className="flex justify-end">
                                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                                <Button type="submit" disabled={updateMutation.status === "pending"}>{updateMutation.status === "pending" ? "Saving…" : "Save"}</Button>
                            </div>
                        </form>
                    </Form>
                    <DialogFooter />
                </DialogContent>
            </Dialog>
            {/* Confirm delete dialog */}
            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setTaskToDelete(null); setConfirmOpen(open); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete task</DialogTitle>
                        <DialogDescription>Are you sure you want to permanently delete this task? This action cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={() => {
                            if (!taskToDelete) return;
                            deleteMutation.mutate(taskToDelete.id);
                            setConfirmOpen(false);
                        }}>
                            Delete
                        </Button>
                    </div>
                    <DialogFooter />
                    <DialogClose />
                </DialogContent>
            </Dialog>
        </div>
    );
}

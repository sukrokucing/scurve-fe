import { useEffect, useState, useRef } from "react";

import { useProjectsQuery } from "@/api/queries/projects";
import { useTasksByProject, useTaskMutation, useDeleteTask, useUpdateTask, useDependencies, useDependencyMutation, useDeleteDependency } from "@/api/queries/tasks";
import { taskSchema, type TaskFormValues } from "@/schemas/task";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import type { Task } from "@/types/domain";
import type { components } from "@/types/api";

type Progress = components["schemas"]["Progress"];
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { Search, Filter, List, Kanban, CalendarRange, ListTodo } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function TasksPage() {
    const { data: projects } = useProjectsQuery();
    const [selectedProject, setSelectedProject] = useState<string>("");

    useEffect(() => {
        if (!projects || projects.length === 0) return;
        setSelectedProject((current) => (current ? current : projects[0]?.id ?? ""));
    }, [projects]);
    const [showProgress, setShowProgress] = useState(false);
    const [viewMode, setViewMode] = useState<"list" | "gantt" | "kanban">("list");
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
    );

    const { data: dependenciesData } = useDependencies(selectedProject ?? "");

    const tasks = (tasksData as Task[]) ?? [];
    const progress = (progressData as Progress[]) ?? [];
    const isLoading = isLoadingTasks || (viewMode === "gantt" && isLoadingProgress);

    // Filter tasks
    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || task.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    const isRefetching = isRefetchingTasks;

    // Re-run query when toggling progress view
    useEffect(() => {
        void refetchTasks();
    }, [showProgress, refetchTasks]);

    const createForm = useForm<TaskFormValues>({ defaultValues: { title: "", due_date: "", status: "todo" } });
    const [createOpen, setCreateOpen] = useState(false);
    const createRef = useRef<HTMLInputElement | null>(null);
    const [editing, setEditing] = useState<Task | null>(null);
    const editForm = useForm<TaskFormValues>({ defaultValues: { title: "", due_date: "", status: "todo" } });

    const createMutation = useTaskMutation(selectedProject);
    const deleteMutation = useDeleteTask(selectedProject);
    const updateMutation = useUpdateTask();
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

        if (viewMode === "kanban") {
            return (
                <div className="h-[calc(100vh-280px)]">
                    <KanbanBoard
                        tasks={filteredTasks}
                        onUpdateTask={(taskId, newStatus) => {
                            updateMutation.mutate({
                                id: taskId,
                                projectId: selectedProject,
                                payload: { status: newStatus }
                            });
                        }}
                    />
                </div>
            );
        }

        if (viewMode === "gantt") {
            return (
                <GanttView
                    tasks={filteredTasks}
                    progress={progress}
                    dependencies={dependenciesData ?? []}
                    onUpdateTask={(task: GanttTask) => {
                        if (!selectedProject) return;
                        updateMutation.mutate({
                            id: task.originalId,
                            projectId: selectedProject,
                            payload: {
                                name: task.name, // Assuming 'name' is the field for task title
                                start_date: task.start.toISOString(),
                                end_date: task.end.toISOString(),
                                due_date: task.end.toISOString(), // Keep due_date synced with end_date for now
                                progress: task.progress, // Update progress directly on task
                            },
                        });

                        // Also update separate progress entry for backward compatibility if needed
                        if (task.progressId) {
                            // update progress logic...
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
                />
            );
        }

        // tasks present
        if (showProgress) {
            return (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Task ID</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>Created</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {progress.map((p) => (
                            <TableRow key={p.id}>
                                <TableCell className="font-medium">{p.task_id}</TableCell>
                                <TableCell>{typeof p.progress === "number" ? `${p.progress}%` : "—"}</TableCell>
                                <TableCell>{p.note ?? "—"}</TableCell>
                                <TableCell>{p.created_at}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            );
        }

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assignee</TableHead>
                        <TableHead>Due date</TableHead>
                        <TableHead className="text-right">Progress</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(filteredTasks as Task[]).map((task) => (
                        <TableRow key={task.id}>
                            <TableCell className="font-medium">{task.name}</TableCell>
                            <TableCell className="capitalize">{task.status.replace(/_/g, " ")}</TableCell>
                            <TableCell>{task.assigneeId ?? "—"}</TableCell>
                            <TableCell>{task.dueDate ?? "—"}</TableCell>
                            <TableCell className="text-right">{typeof task.progress === "number" ? `${task.progress}%` : "—"}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => {
                                        setEditing(task);
                                        editForm.reset({ title: task.name, due_date: task.dueDate ?? "", status: task.status });
                                    }}>
                                        Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => {
                                        setTaskToDelete(task);
                                        setConfirmOpen(true);
                                    }}>
                                        Delete
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    })();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
                    <p className="text-muted-foreground">
                        Track execution status and unblock your teams quickly.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                        {/* Provide an accessible name for the combobox trigger so screen readers can announce it */}
                        <SelectTrigger className="w-56" aria-label="Select project">
                            <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                            {projects?.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => refetchTasks()}
                        disabled={!selectedProject || isRefetching}
                    >
                        {isRefetching ? "Refreshing…" : "Refresh"}
                    </Button>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button type="button">New task</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create task</DialogTitle>
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
                                        const dueDate = parsed.data.due_date
                                            ? new Date(parsed.data.due_date).toISOString()
                                            : null;
                                        createMutation.mutateAsync({ name: parsed.data.title, dueDate, status: parsed.data.status ?? "todo" })
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
                                                // otherwise hook shows toast
                                            });
                                    })}
                                    className="space-y-4"
                                >
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
                                                            // forward react-hook-form ref and keep local ref for autofocus
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

                                    <FormField
                                        control={createForm.control}
                                        name="due_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Due date</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        type="datetime-local"
                                                        className={
                                                            createForm.formState.errors.due_date
                                                                ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0"
                                                                : ""
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex justify-end">
                                        <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                                        <Button type="submit" disabled={createMutation.status === "pending"}>
                                            {createMutation.status === "pending" ? "Creating…" : "Create"}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                            <DialogFooter />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>{currentProject?.name ?? "Select a project"}</CardTitle>
                    <CardDescription>
                        View project backlog, progress and blockers from the backend API.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        {/* Search and Filter Toolbar */}
                        <div className="flex items-center gap-2 flex-1">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search tasks..."
                                    className="pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[140px]">
                                    <Filter className="mr-2 h-4 w-4" />
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="todo">To Do</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="blocked">Blocked</SelectItem>
                                    <SelectItem value="done">Done</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* View Toggle */}
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                            <Button
                                variant={viewMode === "list" ? "background" : "ghost"}
                                size="sm"
                                className={viewMode === "list" ? "bg-background shadow-sm" : ""}
                                onClick={() => setViewMode("list")}
                            >
                                <List className="h-4 w-4 mr-2" />
                                List
                            </Button>
                            <Button
                                variant={viewMode === "kanban" ? "background" : "ghost"}
                                size="sm"
                                className={viewMode === "kanban" ? "bg-background shadow-sm" : ""}
                                onClick={() => setViewMode("kanban")}
                            >
                                <Kanban className="h-4 w-4 mr-2" />
                                Board
                            </Button>
                            <Button
                                variant={viewMode === "gantt" ? "background" : "ghost"}
                                size="sm"
                                className={viewMode === "gantt" ? "bg-background shadow-sm" : ""}
                                onClick={() => setViewMode("gantt")}
                            >
                                <CalendarRange className="h-4 w-4 mr-2" />
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
                                const dueDate = parsed.data.due_date
                                    ? new Date(parsed.data.due_date).toISOString()
                                    : null;
                                updateMutation.mutateAsync({ id: editing.id, projectId: selectedProject, payload: { name: parsed.data.title, dueDate, status: parsed.data.status } })
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
                            className="space-y-4"
                        >
                            <FormField control={editForm.control} name="title" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Title</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            className={editForm.formState.errors.title ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0" : ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={editForm.control} name="due_date" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Due date</FormLabel>
                                    <FormControl>
                                        <Input {...field} type="datetime-local" className={editForm.formState.errors.due_date ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0" : ""} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={editForm.control} name="status" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Status</FormLabel>
                                    <FormControl>
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="todo">To do</SelectItem>
                                                <SelectItem value="in_progress">In progress</SelectItem>
                                                <SelectItem value="blocked">Blocked</SelectItem>
                                                <SelectItem value="done">Done</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormControl>
                                    <FormMessage />
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

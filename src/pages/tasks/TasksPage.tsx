import { useEffect, useState, useRef } from "react";

import { useProjectsQuery } from "@/api/queries/projects";
import { useTasksByProject, useTaskMutation, useDeleteTask, useUpdateTask } from "@/api/queries/tasks";
import { taskSchema, type TaskFormValues } from "@/schemas/task";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import type { Task } from "@/types/domain";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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

export function TasksPage() {
  const { data: projects } = useProjectsQuery();
  const [selectedProject, setSelectedProject] = useState<string | undefined>();

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    setSelectedProject((current) => current ?? projects[0]?.id);
  }, [projects]);
  const { data: tasks, isLoading, refetch, isRefetching } = useTasksByProject(
    selectedProject ?? "",
  );

  const createForm = useForm<TaskFormValues>({ defaultValues: { title: "", due_date: "", status: "todo" } });
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const editForm = useForm<TaskFormValues>({ defaultValues: { title: "", due_date: "", status: "todo" } });

  const createMutation = useTaskMutation(selectedProject);
  const deleteMutation = useDeleteTask(selectedProject);
  const updateMutation = useUpdateTask();

  const currentProject = projects?.find((project) => project.id === selectedProject);

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
            onClick={() => refetch()}
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
                    createMutation.mutateAsync({ name: parsed.data.title, dueDate: parsed.data.due_date ?? undefined, status: parsed.data.status ?? "todo" })
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
          {!selectedProject ? (
            <p className="text-sm text-muted-foreground">
              Choose a project to inspect its tasks.
            </p>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-4/6" />
            </div>
          ) : tasks && tasks.length > 0 ? (
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
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.name}</TableCell>
                    <TableCell className="capitalize">{task.status.replace(/_/g, " ")}</TableCell>
                    <TableCell>{task.assigneeId ?? "—"}</TableCell>
                    <TableCell>{task.dueDate ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {typeof task.progress === "number" ? `${task.progress}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                              setEditing(task);
                              editForm.reset({ title: task.name, due_date: task.dueDate ?? "", status: task.status });
                            }}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => {
                          if (confirm(`Delete task "${task.name}"? This cannot be undone.`)) {
                            deleteMutation.mutate(task.id);
                          }
                        }}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tasks retrieved. Create tasks via the backend API to populate this view.
            </p>
          )}
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
                updateMutation.mutateAsync({ id: editing.id, projectId: selectedProject, payload: { name: parsed.data.title, dueDate: parsed.data.due_date ?? undefined, status: parsed.data.status } })
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
    </div>
  );
}

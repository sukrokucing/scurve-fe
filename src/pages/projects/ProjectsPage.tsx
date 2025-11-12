import { useMemo, useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { projectSchema, type ProjectFormValues } from "@/schemas/project";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useProjectsQuery } from "@/api/queries/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { openapi } from "@/api/openapiClient";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import type { Project } from "@/types/domain";

export function ProjectsPage() {
  const { data: projects, isLoading, refetch, isRefetching } = useProjectsQuery();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Project | null>(null);
  const createForm = useForm<ProjectFormValues>({
    defaultValues: { name: "", description: "", theme_color: "#3498db" },
  });

  const editForm = useForm<ProjectFormValues>({
    defaultValues: { name: "", description: "", theme_color: "#3498db" },
  });

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const createNameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (createDialogOpen) {
      setTimeout(() => createNameRef.current?.focus(), 0);
    }
  }, [createDialogOpen]);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string; theme_color?: string }) =>
      openapi.createProject(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Created project "${data.name}"`);
      setCreateDialogOpen(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      let extra = "";
      if (isAxiosError(err) && err.response) {
        try {
          const status = err.response.status;
          const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
          extra = ` (status: ${status}) ${body}`;
        } catch {
          // ignore stringify errors
        }
      }
      toast.error(`Failed to create project: ${message}${extra}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; payload: { name?: string; description?: string; theme_color?: string } }) =>
      openapi.updateProject(args.id, args.payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Updated project "${data.name}"`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      let extra = "";
      if (isAxiosError(err) && err.response) {
        try {
          const status = err.response.status;
          const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
          extra = ` (status: ${status}) ${body}`;
        } catch {
          // ignore stringify errors
        }
      }
      toast.error(`Failed to update project: ${message}${extra}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await openapi.deleteProject(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Deleted project`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      let extra = "";
      if (isAxiosError(err) && err.response) {
        try {
          const status = err.response.status;
          const body = typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data);
          extra = ` (status: ${status}) ${body}`;
        } catch {
          // ignore stringify errors
        }
      }
      toast.error(`Failed to delete project: ${message}${extra}`);
    },
  });

  const rows = useMemo(() => projects ?? [], [projects]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Monitor progress and manage milestones.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? "Refreshing…" : "Refresh"}
          </Button>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button">New project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit((values) => {
                    createForm.clearErrors();
                    const parsed = projectSchema.safeParse(values);
                    if (!parsed.success) {
                      const { fieldErrors } = parsed.error.flatten();
                      Object.entries(fieldErrors).forEach(([k, v]) => {
                        if (v && v.length) createForm.setError(k as keyof ProjectFormValues, { type: "manual", message: v.join(", ") });
                      });
                      return;
                    }
                    createMutation.mutateAsync(parsed.data)
                      .then(() => {
                        // success behavior (closing/reset) handled in hook onSuccess
                      })
                      .catch((err: unknown) => {
                        const fieldErrors = extractFieldErrorsFromAxios(err);
                        if (fieldErrors) {
                          Object.entries(fieldErrors).forEach(([k, v]) => {
                            if (v && v.length) createForm.setError(k as keyof ProjectFormValues, { type: "server", message: v.join(", ") });
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
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={
                              createForm.formState.errors.name
                                ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0"
                                : ""
                            }
                            ref={(e) => {
                              // forward react-hook-form ref and keep local ref for autofocus
                  if (typeof field.ref === "function") field.ref(e);
                    else if (field.ref && "current" in field.ref) (field.ref as { current?: HTMLInputElement | null }).current = e;
                              createNameRef.current = e;
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={
                              createForm.formState.errors.description
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
                    <Button type="submit" disabled={createMutation.status === "pending"}>
                      {createMutation.status === "pending" ? "Creating…" : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
              <DialogFooter />
            </DialogContent>
          </Dialog>

          {/* Confirm delete dialog */}
          <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setProjectToDelete(null); setConfirmOpen(open); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete project</DialogTitle>
                <DialogDescription>Are you sure you want to permanently delete this project? This action cannot be undone.</DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                <Button type="button" variant="destructive" onClick={() => {
                  if (!projectToDelete) return;
                  deleteMutation.mutate(projectToDelete.id);
                  setConfirmOpen(false);
                }}>
                  Delete
                </Button>
              </div>
              <DialogFooter />
              <DialogClose />
            </DialogContent>
          </Dialog>

          {/* Edit dialog (controlled) */}
          <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit project</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form
                  onSubmit={editForm.handleSubmit((values) => {
                    if (!editing) return;
                    editForm.clearErrors();
                    const parsed = projectSchema.safeParse(values);
                    if (!parsed.success) {
                      const { fieldErrors } = parsed.error.flatten();
                      Object.entries(fieldErrors).forEach(([k, v]) => {
                        if (v && v.length) editForm.setError(k as keyof ProjectFormValues, { type: "manual", message: v.join(", ") });
                      });
                      return;
                    }
                    updateMutation.mutateAsync({ id: editing.id, payload: parsed.data })
                      .then(() => {
                        // success handled by hook toasts/cache; UI closes in hook or we can close here
                        setEditing(null);
                      })
                      .catch((err: unknown) => {
                        const fieldErrors = extractFieldErrorsFromAxios(err);
                        if (fieldErrors) {
                          Object.entries(fieldErrors).forEach(([k, v]) => {
                            if (v && v.length) editForm.setError(k as keyof ProjectFormValues, { type: "server", message: v.join(", ") });
                          });
                          return;
                        }
                        // otherwise hook shows toast
                      });
                  })}
                  className="space-y-4"
                >
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={
                              editForm.formState.errors.name
                                ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0"
                                : ""
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className={
                              editForm.formState.errors.description
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
                    <Button type="submit" disabled={updateMutation.status === "pending"}>
                      {updateMutation.status === "pending" ? "Saving…" : "Save"}
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
          <CardTitle>Workspace projects</CardTitle>
          <CardDescription>Fetched from the S-Curve backend in real-time.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-5/6" />
              <Skeleton className="h-5 w-4/6" />
            </div>
          ) : rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell className="capitalize">{project.status}</TableCell>
                    <TableCell>
                      {project.startDate && project.endDate
                        ? `${project.startDate} → ${project.endDate}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="mr-4">{typeof project.progress === "number" ? `${project.progress}%` : "—"}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(project);
                            editForm.reset({ name: project.name, description: project.description ?? "", theme_color: "#3498db" });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setProjectToDelete(project);
                            setConfirmOpen(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No projects found. Use the backend API to seed data.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

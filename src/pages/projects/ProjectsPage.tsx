import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";

import { useForm, type UseFormReturn } from "react-hook-form";
import { projectSchema, type ProjectFormValues } from "@/schemas/project";

import {
    useCreateProjectMutation,
    useDeleteProjectMutation,
    useProjectSCurveHealthFallbacks,
    usePortfolioSCurveSummary,
    useProjectsQuery,
    useUpdateProjectByIdMutation,
} from "@/api/queries/projects";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { AppDataTable } from "@/components/ui/app-data-table";
import { Input } from "@/components/ui/input";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRealtimeStore } from "@/store/realtimeStore";
import type { Project } from "@/types/domain";

const projectColumnHelper = createColumnHelper<Project>();

function getMutationErrorMessage(err: unknown, action: string) {
    if (!isAxiosError(err)) return `Failed to ${action} project`;

    const status = err.response?.status;
    const payload = err.response?.data as { message?: string; detail?: string; error?: string } | undefined;
    const backendMessage = payload?.message ?? payload?.detail ?? payload?.error;

    if (backendMessage && status) return `Failed to ${action} project (${status}): ${backendMessage}`;
    if (backendMessage) return `Failed to ${action} project: ${backendMessage}`;
    if (status) return `Failed to ${action} project (${status})`;
    return `Failed to ${action} project`;
}

export function ProjectsPage() {
    const navigate = useNavigate();
    const { data: projects, isLoading, refetch, isRefetching, error } = useProjectsQuery();
    const clearAllRemoteChanges = useRealtimeStore((state) => state.clearAllRemoteChanges);
    const remoteChangesByProjectId = useRealtimeStore((state) => state.remoteChangesByProjectId);
    const { data: portfolioSummary } = usePortfolioSCurveSummary("progress");
    const [editing, setEditing] = useState<Project | null>(null);
    const [projectQuery, setProjectQuery] = useState("");
    const createForm = useForm<ProjectFormValues>({
        defaultValues: { name: "", description: "" },
    });

    const editForm = useForm<ProjectFormValues>({
        defaultValues: { name: "", description: "" },
    });

    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Pagination State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    useEffect(() => {
        setPage(1);
    }, [projectQuery]);

    const createNameRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (createDialogOpen) {
            setTimeout(() => createNameRef.current?.focus(), 0);
        }
    }, [createDialogOpen]);

    const createMutation = useCreateProjectMutation();
    const updateMutation = useUpdateProjectByIdMutation();
    const deleteMutation = useDeleteProjectMutation();

    const createProject = useCallback((payload: { name: string; description?: string; theme_color?: string }) => {
        return createMutation.mutateAsync(payload, {
            onSuccess: (data) => {
                toast.success(`Created project "${data.name}"`);
                setCreateDialogOpen(false);
                createForm.reset({ name: "", description: "", theme_color: data.theme_color });
                navigate(`/projects/${data.id}/settings?onboard=1`);
            },
            onError: (err: unknown) => {
                toast.error(getMutationErrorMessage(err, "create"));
            },
        });
    }, [createForm, createMutation, navigate]);

    const updateProject = useCallback((args: { id: string; payload: { name?: string; description?: string; theme_color?: string } }) => {
        return updateMutation.mutateAsync(args, {
            onSuccess: (data) => {
                toast.success(`Updated project "${data.name}"`);
            },
            onError: (err: unknown) => {
                toast.error(getMutationErrorMessage(err, "update"));
            },
        });
    }, [updateMutation]);

    const deleteProject = useCallback((id: string) => {
        return deleteMutation.mutateAsync(id, {
            onSuccess: () => {
                toast.success("Deleted project");
                setConfirmOpen(false);
                setProjectToDelete(null);
            },
            onError: (err: unknown) => {
                toast.error(getMutationErrorMessage(err, "delete"));
            },
        });
    }, [deleteMutation]);

    const createPending = createMutation.status === "pending";
    const updatePending = updateMutation.status === "pending";
    const deletePending = deleteMutation.status === "pending";

    const rows = (projects as unknown as Project[]) ?? [];
    const projectSummaryById = useMemo(() => {
        const byId = new Map<string, {
            actualPct: number | null;
            dataStatus: string;
            metricSupported: boolean;
            stage: string | null;
        }>();
        const summaryProjects = Array.isArray(portfolioSummary?.projects) ? portfolioSummary.projects : [];
        summaryProjects.forEach((item) => {
            byId.set(item.project_id, {
                actualPct: typeof item.actual_pct === "number" && Number.isFinite(item.actual_pct) ? item.actual_pct : null,
                dataStatus: item.data_status,
                metricSupported: item.metric_supported,
                stage: item.stage ?? null,
            });
        });
        return byId;
    }, [portfolioSummary?.projects]);
    const normalizedProjectQuery = projectQuery.trim().toLowerCase();
    const trimmedProjectQuery = projectQuery.trim();
    const filteredRows = normalizedProjectQuery.length === 0
        ? rows
        : rows.filter((project) => {
            const summary = projectSummaryById.get(project.id);
            const haystack = `${project.name} ${project.description ?? ""} ${summary?.stage ?? ""} ${summary?.dataStatus ?? ""}`.toLowerCase();
            return haystack.includes(normalizedProjectQuery);
        });
    const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
    const visibleFallbackProjectIds = useMemo(
        () => paginatedRows
            .map((project) => project.id)
            .filter((projectId) => !projectSummaryById.has(projectId)),
        [paginatedRows, projectSummaryById],
    );
    const { dataByProjectId: fallbackHealthByProjectId } = useProjectSCurveHealthFallbacks(
        visibleFallbackProjectIds,
        "progress",
        { enabled: visibleFallbackProjectIds.length > 0 },
    );
    const resolvedProjectSummaryById = useMemo(() => {
        const byId = new Map(projectSummaryById);
        fallbackHealthByProjectId.forEach((health, projectId) => {
            if (!health || byId.has(projectId)) return;
            byId.set(projectId, {
                actualPct: typeof health.actual_pct === "number" && Number.isFinite(health.actual_pct) ? health.actual_pct : null,
                dataStatus: health.data_status,
                metricSupported: health.metric_supported,
                stage: health.stage ?? null,
            });
        });
        return byId;
    }, [fallbackHealthByProjectId, projectSummaryById]);
    const remoteChangeCount = useMemo(
        () => Object.keys(remoteChangesByProjectId).length,
        [remoteChangesByProjectId],
    );
    const latestRemoteChangeSummary = useMemo(() => {
        const changes = Object.values(remoteChangesByProjectId);
        if (changes.length === 0) return null;
        return changes
            .slice()
            .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0]
            ?.summary ?? null;
    }, [remoteChangesByProjectId]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
                    <p className="text-muted-foreground">Monitor progress and manage milestones.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant={remoteChangeCount > 0 ? "default" : "secondary"}
                        className={cn(
                            "relative",
                            remoteChangeCount > 0
                                ? "ring-2 ring-amber-400/70 ring-offset-2 ring-offset-background"
                                : undefined,
                        )}
                        onClick={async () => {
                            await refetch();
                            clearAllRemoteChanges();
                        }}
                        disabled={isRefetching}
                        title={latestRemoteChangeSummary ?? undefined}
                        data-testid="projects-refresh-button"
                    >
                        {remoteChangeCount > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-amber-950">
                                {remoteChangeCount > 9 ? "9+" : remoteChangeCount}
                            </span>
                        ) : null}
                        {isRefetching ? "Refreshing…" : (remoteChangeCount > 0 ? "Refresh updates" : "Refresh")}
                    </Button>

                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button type="button" data-testid="projects-new-button">New project</Button>
                        </DialogTrigger>
                        <AppDialogContent
                            title="Create project"
                            description="Add a new project to your workspace."
                        >
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
                                        createProject(parsed.data)
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
                                    className="space-y-6"
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
                                                        data-testid="projects-create-name-input"
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
                                                        data-testid="projects-create-description-input"
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
                                        <Button
                                            type="submit"
                                            disabled={createPending}
                                            data-testid="projects-create-submit-button"
                                        >
                                            {createPending ? "Creating…" : "Create"}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                            <DialogFooter />
                        </AppDialogContent>
                    </Dialog>

                    {/* Confirm delete dialog */}
                    <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) setProjectToDelete(null); setConfirmOpen(open); }}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete project</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {projectToDelete
                                        ? `Delete "${projectToDelete.name}" permanently? This action cannot be undone.`
                                        : "Are you sure you want to permanently delete this project? This action cannot be undone."}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel asChild>
                                    <Button type="button" variant="ghost" disabled={deletePending}>Cancel</Button>
                                </AlertDialogCancel>
                                <AlertDialogAction asChild>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        disabled={!projectToDelete || deletePending}
                                        onClick={() => {
                                            if (!projectToDelete) return;
                                            void deleteProject(projectToDelete.id);
                                        }}
                                        data-testid="projects-delete-confirm-button"
                                    >
                                        {deletePending
                                            ? "Deleting…"
                                            : projectToDelete
                                                ? `Delete "${projectToDelete.name}"`
                                                : "Delete"}
                                    </Button>
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Edit dialog (controlled) */}
                    <Dialog
                        open={Boolean(editing)}
                        onOpenChange={(open) => {
                            if (!open && updatePending) return;
                            if (!open) setEditing(null);
                        }}
                    >
                        <AppDialogContent
                            title="Edit project"
                            description="Update project details and save your changes."
                        >
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
                                        updateProject({ id: editing.id, payload: parsed.data })
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
                                    className="space-y-6"
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
                                                        data-testid="projects-edit-description-input"
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
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            disabled={updatePending}
                                            data-testid="projects-edit-cancel-button"
                                            onClick={() => setEditing(null)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={updatePending}
                                            data-testid="projects-edit-save-button"
                                        >
                                            {updatePending ? "Saving…" : "Save"}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                            <DialogFooter />
                        </AppDialogContent>
                    </Dialog>
                </div>
            </div>
            <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle>Workspace projects</CardTitle>
                    <CardDescription>Fetched from the S-Curve backend in real-time.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Input
                            value={projectQuery}
                            onChange={(event) => setProjectQuery(event.target.value)}
                            placeholder="Search projects by name, description, stage, or data status…"
                            className="sm:max-w-md"
                            data-testid="projects-search-input"
                            aria-label="Search projects"
                        />
                        {projectQuery.length > 0 ? (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setProjectQuery("")}
                            >
                                Clear
                            </Button>
                        ) : null}
                    </div>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="projects-filter-summary">
                        {trimmedProjectQuery ? (
                            <>
                                <Badge variant="outline">Search: {trimmedProjectQuery}</Badge>
                                <Badge variant="outline">{filteredRows.length} match(es)</Badge>
                                <span>Filtering name, description, stage, and data status.</span>
                            </>
                        ) : (
                            <span>Search filters projects by name, description, stage, and data status.</span>
                        )}
                    </div>
                    {error ? (
                        <div role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            <div className="flex items-start justify-between gap-3">
                                <div>Failed to load projects from the backend.</div>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => void refetch()}>
                                        Retry
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-5/6" />
                            <Skeleton className="h-5 w-4/6" />
                        </div>
                    ) : filteredRows.length > 0 ? (
                        <>
                            <VirtualizedProjectsTable
                                projects={paginatedRows}
                                projectSummaryById={resolvedProjectSummaryById}
                                setEditing={setEditing}
                                editForm={editForm}
                                setProjectToDelete={setProjectToDelete}
                                setConfirmOpen={setConfirmOpen}
                            />
                            <DataTablePagination
                                currentPage={page}
                                totalPages={Math.ceil(filteredRows.length / pageSize)}
                                pageSize={pageSize}
                                setPage={setPage}
                                setPageSize={setPageSize}
                                totalItems={filteredRows.length}
                            />
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {projectQuery.length > 0
                                ? "No projects match your search."
                                : "No projects found. Use the backend API to seed data."}
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function VirtualizedProjectsTable({
    projects,
    projectSummaryById,
    setEditing,
    editForm,
    setProjectToDelete,
    setConfirmOpen
}: {
    projects: Project[];
    projectSummaryById: Map<string, {
        actualPct: number | null;
        dataStatus: string;
        metricSupported: boolean;
        stage: string | null;
    }>;
    setEditing: (p: Project) => void;
    editForm: UseFormReturn<ProjectFormValues>;
    setProjectToDelete: (p: Project) => void;
    setConfirmOpen: (o: boolean) => void;
}) {
    const formatActualProgress = useCallback((projectId: string) => {
        const summary = projectSummaryById.get(projectId);
        if (!summary) return "N/A";
        if (!summary.metricSupported || summary.dataStatus === "unsupported_metric") return "Unsupported";
        if (summary.dataStatus === "insufficient_data") return "Insufficient data";
        if (typeof summary.actualPct === "number") return `${summary.actualPct.toFixed(1)}%`;
        return "N/A";
    }, [projectSummaryById]);

    const formatStage = useCallback((projectId: string) => {
        const stage = projectSummaryById.get(projectId)?.stage;
        if (!stage) return "N/A";
        if (stage === "lag") return "Lag";
        if (stage === "log") return "Log";
        if (stage === "maturity") return "Maturity";
        if (stage === "decline") return "Decline";
        return stage;
    }, [projectSummaryById]);
    const columns = useMemo<ColumnDef<Project, unknown>[]>(() => ([
        projectColumnHelper.accessor("name", {
            header: "Name",
            cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        projectColumnHelper.accessor("description", {
            header: "Description",
            cell: (info) => info.getValue() || "—",
        }),
        projectColumnHelper.display({
            id: "stage",
            header: "S-Curve Stage",
            cell: (info) => formatStage(info.row.original.id),
        }),
        projectColumnHelper.display({
            id: "actualProgress",
            header: () => <div className="text-right">Actual Progress</div>,
            cell: (info) => {
                const project = info.row.original;
                return (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="mr-4">{formatActualProgress(project.id)}</span>
                        <Button
                            size="sm"
                            variant="outline"
                            asChild
                        >
                            <Link
                                to={`/projects/${project.id}/settings`}
                                data-testid="projects-row-settings-link"
                            >
                                Settings
                            </Link>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            asChild
                        >
                            <Link
                                to={`/projects/${project.id}/dashboard`}
                                data-testid="projects-row-dashboard-link"
                            >
                                Dashboard
                            </Link>
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="hidden xl:inline-flex"
                            data-testid="projects-row-edit-button"
                            onClick={() => {
                                setEditing(project);
                                editForm.reset({ name: project.name, description: project.description ?? "" });
                            }}
                        >
                            Edit
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive-outline"
                            className="hidden xl:inline-flex"
                            data-testid="projects-row-delete-button"
                            onClick={() => {
                                setProjectToDelete(project);
                                setConfirmOpen(true);
                            }}
                        >
                            Delete
                        </Button>
                        <div className="xl:hidden">
                            <ProjectRowCompactActions
                                project={project}
                                setEditing={setEditing}
                                editForm={editForm}
                                setProjectToDelete={setProjectToDelete}
                                setConfirmOpen={setConfirmOpen}
                            />
                        </div>
                    </div>
                );
            },
        }),
    ]), [editForm, formatActualProgress, formatStage, setConfirmOpen, setEditing, setProjectToDelete]);

    return (
        <div
            className="overflow-x-auto"
        >
            <AppDataTable
                data={projects}
                columns={columns}
                getRowId={(row) => row.id}
                headerClassName="sticky top-0 bg-background z-10"
                rowClassName="hover:bg-surface-hover transition-colors"
            />
        </div>
    );
}

function ProjectRowCompactActions({
    project,
    setEditing,
    editForm,
    setProjectToDelete,
    setConfirmOpen,
}: {
    project: Project;
    setEditing: (p: Project) => void;
    editForm: UseFormReturn<ProjectFormValues>;
    setProjectToDelete: (p: Project) => void;
    setConfirmOpen: (o: boolean) => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`More actions for ${project.name}`}
                    data-testid="projects-row-actions-toggle"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 p-1">
                <DropdownMenuItem
                    data-testid="projects-row-compact-edit-button"
                    onClick={() => {
                        setEditing(project);
                        editForm.reset({ name: project.name, description: project.description ?? "" });
                    }}
                >
                    Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="focus:bg-destructive/15 focus:text-destructive text-destructive"
                    data-testid="projects-row-compact-delete-button"
                    onClick={() => {
                        setProjectToDelete(project);
                        setConfirmOpen(true);
                    }}
                >
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}



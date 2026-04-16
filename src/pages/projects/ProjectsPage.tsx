import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { formatDistanceToNowStrict } from "date-fns";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import { isPresenceRecentlyActive, summarizePresenceRoutes } from "@/lib/realtimePresentation";
import { useMedia } from "@/hooks/vendor/reactUse";
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

function getStageLabel(stage: string | null | undefined) {
    if (!stage) return "Not ready";
    if (stage === "lag") return "Lag";
    if (stage === "log") return "Log";
    if (stage === "maturity") return "Maturity";
    if (stage === "decline") return "Decline";
    return stage;
}

function getStageVariant(stage: string | null | undefined): "outline" | "secondary" | "success" | "warning" | "error" {
    if (stage === "maturity") return "success";
    if (stage === "log") return "secondary";
    if (stage === "lag") return "warning";
    if (stage === "decline") return "error";
    return "outline";
}

function getDataStatusLabel(dataStatus: string | null | undefined) {
    if (!dataStatus) return "Awaiting supported rule evaluations";
    if (dataStatus === "ok") return "Health data available";
    if (dataStatus === "insufficient_data") return "Awaiting timeline data";
    if (dataStatus === "unsupported_metric") return "Progress metric is unsupported for this view";
    return dataStatus.replace(/_/g, " ");
}

function getTeamMemberInitials(name?: string | null, email?: string | null) {
    const label = name?.trim() || email?.trim() || "Unknown";
    const words = label
        .split(/[\s@._-]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (words.length === 0) return "U";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function getProjectSignalBarClass(summary: {
    actualPct: number | null;
    dataStatus: string;
    metricSupported: boolean;
    stage: string | null;
} | null) {
    if (!summary || summary.metricSupported === false || summary.dataStatus === "unsupported_metric") {
        return "bg-slate-400";
    }

    if (summary.dataStatus === "insufficient_data") {
        return "bg-amber-400";
    }

    switch (summary.stage) {
        case "maturity":
            return "bg-emerald-500";
        case "log":
            return "bg-sky-500";
        case "lag":
            return "bg-amber-500";
        case "decline":
            return "bg-rose-500";
        default:
            return "bg-slate-400";
    }
}

function getProjectSignalLabel(summary: {
    actualPct: number | null;
    dataStatus: string;
    metricSupported: boolean;
    stage: string | null;
} | null) {
    if (!summary) return "Signal pending";
    if (summary.metricSupported === false || summary.dataStatus === "unsupported_metric") {
        return "Unsupported for this metric";
    }
    if (summary.dataStatus === "insufficient_data") {
        return "Needs more timeline data";
    }
    return "Live";
}

export function ProjectsPage() {
    const navigate = useNavigate();
    const { data: projects, isLoading, refetch, isRefetching, error } = useProjectsQuery();
    const clearAllRemoteChanges = useRealtimeStore((state) => state.clearAllRemoteChanges);
    const remoteChangesByProjectId = useRealtimeStore((state) => state.remoteChangesByProjectId);
    const presenceByProjectId = useRealtimeStore((state) => state.presenceByProjectId);
    const { data: portfolioSummary } = usePortfolioSCurveSummary("progress");
    const [editing, setEditing] = useState<Project | null>(null);
    const [projectQuery, setProjectQuery] = useState("");
    const isLaptopDensity = useMedia("(min-width: 1024px) and (max-width: 1439px)", false);
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
    const latestRemoteChangeAt = useMemo(() => {
        const changes = Object.values(remoteChangesByProjectId);
        if (changes.length === 0) return null;
        return changes
            .slice()
            .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0]
            ?.occurredAt ?? null;
    }, [remoteChangesByProjectId]);
    const presenceUsers = useMemo(() => {
        const flattenedPresenceUsers = Object.values(presenceByProjectId).flat();
        const byUserId = new Map<string, (typeof flattenedPresenceUsers)[number]>();
        flattenedPresenceUsers.forEach((user) => {
            const current = byUserId.get(user.user_id);
            if (!current) {
                byUserId.set(user.user_id, user);
                return;
            }

            if (user.status === "online" && current.status !== "online") {
                byUserId.set(user.user_id, user);
                return;
            }

            if (new Date(user.last_seen_at).getTime() > new Date(current.last_seen_at).getTime()) {
                byUserId.set(user.user_id, user);
            }
        });
        return Array.from(byUserId.values());
    }, [presenceByProjectId]);
    const onlinePresenceCount = useMemo(
        () => presenceUsers.filter((user) => user.status === "online").length,
        [presenceUsers],
    );
    const recentlyActivePresenceCount = useMemo(
        () => presenceUsers.filter((user) => isPresenceRecentlyActive(user)).length,
        [presenceUsers],
    );
    const activePresenceProjectCount = useMemo(
        () => Object.values(presenceByProjectId).filter((users) => users.some((user) => user.status === "online")).length,
        [presenceByProjectId],
    );
    const topPresenceRoutes = useMemo(
        () => summarizePresenceRoutes(presenceUsers).slice(0, 2),
        [presenceUsers],
    );
    const visiblePresenceUsers = useMemo(
        () => presenceUsers.slice(0, 5),
        [presenceUsers],
    );
    const hiddenPresenceUserCount = Math.max(presenceUsers.length - visiblePresenceUsers.length, 0);
    const projectSignalSummary = useMemo(() => {
        const counts = {
            stable: 0,
            attention: 0,
            waiting: 0,
            unsupported: 0,
        };

        filteredRows.forEach((project) => {
            const summary = resolvedProjectSummaryById.get(project.id);
            if (!summary) {
                counts.waiting += 1;
                return;
            }

            if (summary.metricSupported === false || summary.dataStatus === "unsupported_metric") {
                counts.unsupported += 1;
                return;
            }

            if (summary.dataStatus === "insufficient_data") {
                counts.waiting += 1;
                return;
            }

            if (summary.stage === "lag" || summary.stage === "decline") {
                counts.attention += 1;
                return;
            }

            counts.stable += 1;
        });

        const total = filteredRows.length || 1;
        const segments = [
            { key: "stable", label: "Stable signal", count: counts.stable, className: "bg-emerald-500/90" },
            { key: "attention", label: "Needs attention", count: counts.attention, className: "bg-amber-500/90" },
            { key: "waiting", label: "Awaiting data", count: counts.waiting, className: "bg-slate-400" },
            { key: "unsupported", label: "Unsupported", count: counts.unsupported, className: "bg-zinc-500" },
        ]
            .filter((segment) => segment.count > 0)
            .map((segment) => ({
                ...segment,
                width: `${(segment.count / total) * 100}%`,
            }));
        const exceptionCount = counts.attention + counts.waiting + counts.unsupported;
        const visibleSegments = isLaptopDensity && exceptionCount > 0
            ? segments.filter((segment) => segment.key !== "stable")
            : segments;

        return {
            counts,
            segments,
            visibleSegments,
            exceptionCount,
            isAllClear: exceptionCount === 0 && counts.stable > 0,
        };
    }, [filteredRows, isLaptopDensity, resolvedProjectSummaryById]);
    const visibleProjectSummaryLabel = trimmedProjectQuery
        ? `${filteredRows.length} visible of ${rows.length} projects`
        : `${rows.length} project${rows.length === 1 ? "" : "s"} in workspace`;

    return (
        <div className="space-y-4" data-testid="projects-page">
            <Card className="overflow-hidden border-border/70 shadow-sm" data-testid="projects-page-setup-card">
                <CardContent className="space-y-4 px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">Setup before dashboard</Badge>
                                <Badge variant={onlinePresenceCount > 0 ? "success" : "outline"}>
                                    {onlinePresenceCount} online
                                </Badge>
                                <Badge variant="outline">
                                    {activePresenceProjectCount} active project{activePresenceProjectCount === 1 ? "" : "s"}
                                </Badge>
                                {topPresenceRoutes.map((routeSummary) => (
                                    <Badge key={routeSummary.label} variant="outline">
                                        {routeSummary.count} in {routeSummary.label}
                                    </Badge>
                                ))}
                            </div>
                            <div className="space-y-1">
                                <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
                                <p className="max-w-3xl text-sm text-muted-foreground">
                                    Create, finish setup, then monitor.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">Settings first</Badge>
                                <Badge variant="outline">Dashboard after setup</Badge>
                            </div>
                            {latestRemoteChangeSummary ? (
                                <p className="text-xs text-muted-foreground">
                                    Latest live update: {latestRemoteChangeSummary}
                                    {latestRemoteChangeAt
                                        ? ` · ${formatDistanceToNowStrict(new Date(latestRemoteChangeAt), { addSuffix: true })}`
                                        : ""}
                                </p>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/80 px-3 py-2" data-testid="projects-team-visibility">
                                <TooltipProvider delayDuration={120}>
                                    <div className="flex -space-x-3">
                                        {visiblePresenceUsers.length > 0 ? visiblePresenceUsers.map((user) => (
                                            <Tooltip key={user.user_id}>
                                                <TooltipTrigger asChild>
                                                    <Avatar className="h-9 w-9 border-background ring-2 ring-background">
                                                        <AvatarFallback>{getTeamMemberInitials(user.name, user.user_id)}</AvatarFallback>
                                                    </Avatar>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <div className="space-y-1 text-xs">
                                                        <p className="font-medium text-foreground">{user.name}</p>
                                                        <p className="text-muted-foreground">
                                                            {user.status === "online" ? "Online now" : "Recently active"}
                                                        </p>
                                                        {user.route ? (
                                                            <p className="text-muted-foreground">Route: {user.route}</p>
                                                        ) : null}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        )) : (
                                            <Avatar className="h-9 w-9 border-dashed border-border/60 bg-muted/40 text-muted-foreground">
                                                <AvatarFallback>0</AvatarFallback>
                                            </Avatar>
                                        )}
                                    </div>
                                </TooltipProvider>
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium text-foreground">
                                        {presenceUsers.length} teammate{presenceUsers.length === 1 ? "" : "s"} in view
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {onlinePresenceCount} online
                                        {recentlyActivePresenceCount > 0 ? ` · ${recentlyActivePresenceCount} recently active` : ""}
                                        {hiddenPresenceUserCount > 0 ? ` · +${hiddenPresenceUserCount} more` : ""}
                                    </p>
                                </div>
                            </div>
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
                            description="Name it now. Finish setup next."
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
                                    className="space-y-4"
                                >
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <Badge variant="outline">Settings next</Badge>
                                        <Badge variant="outline">Dashboard after setup</Badge>
                                    </div>
                                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                                        <FormField
                                            control={createForm.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Name</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            autoComplete="off"
                                                            data-testid="projects-create-name-input"
                                                            className={
                                                                createForm.formState.errors.name
                                                                    ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0"
                                                                    : ""
                                                            }
                                                            ref={(e) => {
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
                                                            autoComplete="off"
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
                                    </div>
                                    <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                                        <p className="text-xs text-muted-foreground">Project settings comes next.</p>
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
                            description="Keep the identity tight and current."
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
                                    className="space-y-4"
                                >
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <Badge variant="outline">Identity</Badge>
                                        <Badge variant="outline">Safe update</Badge>
                                    </div>
                                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                                        <FormField
                                            control={editForm.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Name</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            autoComplete="off"
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
                                                            autoComplete="off"
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
                                    </div>
                                    <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                                        <p className="text-xs text-muted-foreground">Only this project changes.</p>
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
                                    </div>
                                </form>
                            </Form>
                            <DialogFooter />
                        </AppDialogContent>
                    </Dialog>
                        </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                        <div className="space-y-2.5 rounded-2xl border border-border/70 bg-background/80 p-4">
                            <p className="text-sm font-medium text-foreground">Search workspace</p>
                            <div className="max-w-xl">
                                <label htmlFor="projects-search-input" className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Search projects
                                </label>
                                <Input
                                    id="projects-search-input"
                                    name="projectSearch"
                                    value={projectQuery}
                                    onChange={(event) => setProjectQuery(event.target.value)}
                                    placeholder="Search by name, description, stage, or data status…"
                                    autoComplete="off"
                                    className="sm:max-w-xl"
                                    data-testid="projects-search-input"
                                    aria-label="Search projects"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="projects-filter-summary">
                                <Badge variant="outline">{visibleProjectSummaryLabel}</Badge>
                                {trimmedProjectQuery ? (
                                    <>
                                        <Badge variant="outline">Search: {trimmedProjectQuery}</Badge>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => setProjectQuery("")}
                                        >
                                            Clear
                                        </Button>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        <div className="space-y-2.5 rounded-2xl border border-border/70 bg-muted/25 p-4" data-testid="projects-signal-summary">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">Portfolio signal</p>
                                <p className="text-sm text-muted-foreground">Exceptions first.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="overflow-hidden rounded-full bg-muted flex-1">
                                    <div className="flex h-2 w-full">
                                        {projectSignalSummary.segments.length > 0 ? projectSignalSummary.segments.map((segment) => (
                                            <div
                                                key={segment.key}
                                                className={segment.className}
                                                style={{ width: segment.width }}
                                            />
                                        )) : (
                                            <div className="h-2 w-full bg-slate-300" />
                                        )}
                                    </div>
                                </div>
                                {projectSignalSummary.segments.length > 0 ? (
                                    <TooltipProvider delayDuration={120}>
                                        <div className="hidden shrink-0 items-center gap-1 sm:flex" data-testid="projects-signal-summary-legend">
                                            {projectSignalSummary.segments.map((segment) => (
                                                <Tooltip key={segment.key}>
                                                    <TooltipTrigger asChild>
                                                        <span
                                                            className={cn("h-2 w-2 rounded-full", segment.className)}
                                                            aria-label={`${segment.label}: ${segment.count}`}
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {segment.label}: {segment.count}
                                                    </TooltipContent>
                                                </Tooltip>
                                            ))}
                                        </div>
                                    </TooltipProvider>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {projectSignalSummary.isAllClear ? (
                                    <Badge
                                        variant="outline"
                                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    >
                                        All clear
                                    </Badge>
                                ) : (
                                    projectSignalSummary.visibleSegments.map((segment) => (
                                        <Badge key={segment.key} variant="outline">
                                            {segment.label}: {segment.count}
                                        </Badge>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm transition-shadow hover:shadow-md" data-testid="projects-page-table-card">
                <CardHeader>
                    <CardTitle>Workspace projects</CardTitle>
                    <CardDescription>Identity, signal, actions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{visibleProjectSummaryLabel}</Badge>
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
        if (!summary) return "Not ready";
        if (!summary.metricSupported || summary.dataStatus === "unsupported_metric") return "Unsupported";
        if (summary.dataStatus === "insufficient_data") return "Awaiting data";
        if (typeof summary.actualPct === "number") return `${summary.actualPct.toFixed(1)}%`;
        return "Not ready";
    }, [projectSummaryById]);

    const getProjectSummary = useCallback((projectId: string) => {
        return projectSummaryById.get(projectId) ?? null;
    }, [projectSummaryById]);

    const columns = useMemo<ColumnDef<Project, unknown>[]>(() => ([
        projectColumnHelper.display({
            id: "project",
            header: () => <div className="min-w-[320px]">Project</div>,
            cell: (info) => {
                const summary = getProjectSummary(info.row.original.id);
                return (
                    <div className="min-w-0 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{info.row.original.name}</span>
                            {(!summary || summary.dataStatus === "insufficient_data") ? (
                                <Badge variant="outline" className="text-[10px]">Setup</Badge>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="max-w-[440px] truncate" title={info.row.original.description?.trim() || "No project description yet."}>
                                {info.row.original.description?.trim() || "No description yet"}
                            </span>
                        </div>
                    </div>
                );
            },
            meta: {
                headerClassName: "px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-4 py-2 align-middle",
            },
        }),
        projectColumnHelper.display({
            id: "signal",
            header: () => <div className="min-w-[240px]">Signal</div>,
            cell: (info) => {
                const project = info.row.original;
                const summary = getProjectSummary(project.id);
                const numericActual = typeof summary?.actualPct === "number" && Number.isFinite(summary.actualPct)
                    ? Math.max(0, Math.min(100, summary.actualPct))
                    : null;
                return (
                    <div className="min-w-[240px] py-1.5">
                        <div className="flex items-center justify-between gap-3">
                            <Badge variant={getStageVariant(summary?.stage)}>
                                {getStageLabel(summary?.stage)}
                            </Badge>
                            <span className="text-sm font-semibold text-foreground">
                                {formatActualProgress(project.id)}
                            </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                                className={cn("h-full rounded-full transition-all", getProjectSignalBarClass(summary))}
                                style={{
                                    width: numericActual !== null
                                        ? `${numericActual}%`
                                        : summary?.dataStatus === "insufficient_data"
                                            ? "32%"
                                        : "16%",
                                }}
                            />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{getProjectSignalLabel(summary)}</span>
                            <span aria-hidden="true">•</span>
                            <span>{getDataStatusLabel(summary?.dataStatus)}</span>
                        </div>
                    </div>
                );
            },
            meta: {
                headerClassName: "px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-4 py-2 align-middle",
            },
        }),
        projectColumnHelper.display({
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: (info) => {
                const project = info.row.original;
                return (
                    <div className="flex justify-end py-1">
                        <ProjectRowActions
                            project={project}
                            setEditing={setEditing}
                            editForm={editForm}
                            setProjectToDelete={setProjectToDelete}
                            setConfirmOpen={setConfirmOpen}
                        />
                    </div>
                );
            },
            meta: {
                headerClassName: "w-[84px] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "w-[84px] px-4 py-2 align-middle",
            },
        }),
    ]), [editForm, formatActualProgress, getProjectSummary, setConfirmOpen, setEditing, setProjectToDelete]);

    return (
        <div
            className="overflow-x-auto"
        >
            <AppDataTable
                data={projects}
                columns={columns}
                getRowId={(row) => row.id}
                className="min-w-[760px] table-fixed"
                headerClassName="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
                bodyClassName="[&_tr:nth-child(even)]:bg-muted/15"
                rowClassName="align-top transition-colors hover:bg-muted/35"
            />
        </div>
    );
}

function ProjectRowActions({
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
            <DropdownMenuContent align="end" className="w-56 p-1">
                <DropdownMenuItem asChild>
                    <Link to={`/projects/${project.id}/settings`} data-testid="projects-row-settings-link">
                        Project Settings
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link to={`/projects/${project.id}/dashboard`} data-testid="projects-row-dashboard-link">
                        Dashboard
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="projects-row-compact-edit-button"
                    onClick={() => {
                        setEditing(project);
                        editForm.reset({ name: project.name, description: project.description ?? "" });
                    }}
                >
                    Edit project
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="focus:bg-destructive/15 focus:text-destructive text-destructive"
                    data-testid="projects-row-compact-delete-button"
                    onClick={() => {
                        setProjectToDelete(project);
                        setConfirmOpen(true);
                    }}
                >
                    Delete project
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}



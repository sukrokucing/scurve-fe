import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEventHandler } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { addDays, format, isSameDay } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";

import {
    useMyProjectScopesQuery,
    useProjectAssigneesQuery,
    useProjectMembersQuery,
    useProjectResourceRoleRatesQuery,
    useProjectsQuery,
    useResourceRolesQuery,
} from "@/api/queries/projects";
import {
    useBatchDeleteTasks,
    useTasksByProject,
    useTasksByProjectList,
    useTaskMutation,
    useDeleteTask,
    useUpdateTask,
    useBatchUpdateTasks,
    useDependencies,
    useDependencyMutation,
    useDeleteDependency,
    useTaskWorkLogs,
    useTaskProgressComponents,
    useCreateTaskWorkLog,
    useUpdateTaskWorkLog,
    useDeleteTaskWorkLog,
    useReplaceTaskProgressComponents,
    useReplaceTaskProgressComponentsForTask,
} from "@/api/queries/tasks";
import { useUsersLookupQuery } from "@/api/queries/users";
import type { ApiTaskProgressComponent, ApiTaskProgressComponentInput, ApiWorkLog } from "@/api/openapiClient";
import { taskSchema, type TaskFormValues } from "@/schemas/task";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import type { Task, TaskHealthStatus, TaskProgressMethod, TaskScheduleStatus, TaskStatus } from "@/types/domain";
import type { components } from "@/types/api";
import { toast } from "sonner";

type Progress = components["schemas"]["Progress"];
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useNetworkStore } from "@/store/networkStore";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import { AppDataTable } from "@/components/ui/app-data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Combobox } from "@/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { GanttView } from "@/components/gantt/GanttView";
import type { GanttTask } from "@/components/gantt/types";
import { KanbanProvider, KanbanBoard, KanbanHeader, KanbanCards, KanbanCard } from "@/components/kanban/board";
import { Badge } from "@/components/ui/badge";
import { Search, List, Kanban, CalendarRange, ListTodo, SlidersHorizontal, MoreHorizontal, PencilLine, Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMedia } from "@/hooks/vendor/reactUse";
import { useAuthStore } from "@/store/authStore";
import { useRealtimeStore } from "@/store/realtimeStore";
import {
    getPresenceStatusLabel,
    getRealtimeRouteLabel,
    isPresenceRecentlyActive,
} from "@/lib/realtimePresentation";
import { cn } from "@/lib/utils";
import { API_SEARCH_QUERY_MAX_LENGTH, normalizeApiSearchQuery } from "@/lib/apiSearch";
import {
    formatTaskPercent,
    formatTaskVariance,
    getTaskHealthLabel,
    getTaskHealthVariant,
    getTaskScurveSnapshot,
    getTaskStatusLabel,
} from "@/lib/taskScurve";
import {
    abandonTimeToTaskSession,
    clearTimeToTaskRecords,
    completeTimeToTaskSession,
    formatDurationMs,
    getTimeToTaskSummary,
    markTimeToTaskIntent,
    startTimeToTaskSession,
} from "@/lib/timeToTask";


const KANBAN_COLUMNS = [
    { id: "todo", title: "To Do" },
    { id: "in_progress", title: "In Progress" },
    { id: "blocked", title: "Blocked" },
    { id: "done", title: "Done" },
];

const BASE_DURATION_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90] as const;
const EMPTY_TASKS: Task[] = [];
const EMPTY_PROGRESS: Progress[] = [];
const EMPTY_REALTIME_PRESENCE: components["schemas"]["RealtimePresenceUser"][] = [];
const taskListColumnHelper = createColumnHelper<Task>();
const workLogColumnHelper = createColumnHelper<ApiWorkLog>();
const DEFAULT_TASK_FORM_VALUES: TaskFormValues = {
    title: "",
    description: "",
    assigneeId: "",
    plan: 1,
    progress: 0,
    status: "todo",
};

type TaskProgressComponentDraft = {
    id?: string;
    name: string;
    weight: string;
    completionPct: string;
    componentType: string;
    plannedAt: string;
    completedAt: string;
};

type TaskSelectionCheckboxProps = {
    checked: boolean;
    label: string;
    testId: string;
    onToggle: (nextChecked: boolean) => void;
    onClick?: MouseEventHandler<HTMLElement>;
};

type TaskActionMenuProps = {
    task: Task;
    triggerTestId: string;
    editTestId: string;
    deleteTestId: string;
    onEdit: (task: Task) => void;
    onDelete: (task: Task) => void;
};

function TaskSelectionCheckbox({ checked, label, testId, onToggle, onClick }: TaskSelectionCheckboxProps) {
    return (
        <Checkbox
            aria-label={label}
            checked={checked}
            data-testid={testId}
            onCheckedChange={(nextChecked) => {
                onToggle(nextChecked === true);
            }}
            onClick={onClick}
            className={cn(
                "h-11 w-11 rounded-lg border border-border/70 bg-background/60 text-primary shadow-none hover:border-primary/40 hover:bg-accent/35 md:h-9 md:w-9 md:rounded-md",
                checked ? "border-primary/55 bg-accent/55" : "",
            )}
        />
    );
}

function TaskActionMenu({
    task,
    triggerTestId,
    editTestId,
    deleteTestId,
    onEdit,
    onDelete,
}: TaskActionMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 rounded-full text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground"
                    data-testid={triggerTestId}
                    aria-label={`Task actions for ${task.name}`}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                    onClick={() => onEdit(task)}
                    data-testid={editTestId}
                >
                    Edit task
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => onDelete(task)}
                    className="text-destructive focus:text-destructive"
                    data-testid={deleteTestId}
                >
                    Delete task
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function buildDurationOptions(currentPlan?: number | null) {
    const values = new Set<number>(BASE_DURATION_DAYS);

    if (typeof currentPlan === "number" && Number.isFinite(currentPlan) && currentPlan > 0) {
        values.add(Math.round(currentPlan));
    }

    return Array.from(values)
        .sort((a, b) => a - b)
        .map((days) => ({
            value: String(days),
            label: days === 1 ? "1 day" : `${days} days`,
        }));
}

function getDurationDays(start: Date, end: Date) {
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

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

function formatDateForWorkLogInput(value?: string | null): string {
    if (!value) return format(new Date(), "yyyy-MM-dd");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return format(new Date(), "yyyy-MM-dd");
    return format(parsed, "yyyy-MM-dd");
}

function formatCurrencyAmount(amount: number, currency = "USD"): string {
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

function getCompactTaskStatusLabel(status: Task["executionStatus"] | Task["status"] | null | undefined) {
    switch (status) {
        case "todo":
        case "not_started":
            return "Todo";
        case "in_progress":
            return "Doing";
        case "blocked":
            return "Blocked";
        case "done":
        case "completed":
            return "Done";
        default:
            return getTaskStatusLabel(status ?? "todo");
    }
}

function getTaskListWidthClass(columnId: string, isLaptopDensity = false) {
    switch (columnId) {
        case "selection":
            return "w-[72px]";
        case "name":
            return isLaptopDensity ? "w-[46%] min-w-[300px]" : "w-[43%] min-w-[340px]";
        case "progress":
            return isLaptopDensity ? "w-[22%] min-w-[168px]" : "w-[27%] min-w-[220px]";
        case "timeline":
            return isLaptopDensity ? "w-[16%] min-w-[132px]" : "w-[18%] min-w-[150px]";
        case "actions":
            return "w-[64px]";
        default:
            return "";
    }
}

function normalizeDateTimeLocalToIso(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function formatWorkLogDateLabel(value?: string | null): string {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return format(parsed, "MMM d, yyyy");
}

function formatFilterDateSummaryLabel(value?: string | null): string {
    if (!value) return "Any";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return format(parsed, "MMM d");
}

function isWeightedProgressTask(task?: Pick<Task, "progressMethod"> | null) {
    return task?.progressMethod === "weighted_components";
}

function getProgressMethodLabel(progressMethod?: TaskProgressMethod | null) {
    return progressMethod === "weighted_components" ? "Weighted" : "Manual";
}

function mapProgressComponentToDraft(component: ApiTaskProgressComponent): TaskProgressComponentDraft {
    return {
        id: component.id,
        name: component.name,
        weight: String(component.weight),
        completionPct: String(component.completion_pct),
        componentType: component.component_type || "milestone",
        plannedAt: formatDateForInput(component.planned_at),
        completedAt: formatDateForInput(component.completed_at),
    };
}

function createEmptyProgressComponentDraft(sortOrder = 1): TaskProgressComponentDraft {
    return {
        name: "",
        weight: sortOrder === 1 ? "100" : "0",
        completionPct: "0",
        componentType: "milestone",
        plannedAt: "",
        completedAt: "",
    };
}

function buildWeightedStarterComponents(options: {
    startDate?: string | null;
    endDate?: string | null;
}): ApiTaskProgressComponentInput[] {
    const start = options.startDate ? new Date(options.startDate) : null;
    const end = options.endDate ? new Date(options.endDate) : null;
    const hasStart = start && !Number.isNaN(start.getTime());
    const hasEnd = end && !Number.isNaN(end.getTime());
    const midpoint = hasStart && hasEnd
        ? new Date(start.getTime() + ((end.getTime() - start.getTime()) / 2))
        : null;

    return [
        {
            name: "Planning ready",
            component_type: "milestone",
            weight: 20,
            completion_pct: 0,
            planned_at: hasStart ? start.toISOString() : null,
            sort_order: 1,
        },
        {
            name: "Execution complete",
            component_type: "deliverable",
            weight: 60,
            completion_pct: 0,
            planned_at: midpoint ? midpoint.toISOString() : (hasEnd ? end.toISOString() : null),
            sort_order: 2,
        },
        {
            name: "Review and sign-off",
            component_type: "milestone",
            weight: 20,
            completion_pct: 0,
            planned_at: hasEnd ? end.toISOString() : null,
            sort_order: 3,
        },
    ];
}

function getTaskStatusTintClass(status: string) {
    switch (status) {
        case "todo":
        case "pending":
        case "not_started":
            return "border-border/70 bg-muted/60 text-muted-foreground";
        case "in_progress":
            return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";
        case "blocked":
            return "border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300";
        case "done":
        case "completed":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
        default:
            return "border-border/70 bg-muted/60 text-muted-foreground";
    }
}

function getTaskScurveTitle(task: Task) {
    const snapshot = getTaskScurveSnapshot(task);

    if (snapshot.expected === null) {
        return "Needs a planned start and end date or duration before expected progress can be calculated.";
    }

    return `Expected ${formatTaskPercent(snapshot.expected)} · Actual ${formatTaskPercent(snapshot.actual)} · Variance ${formatTaskVariance(snapshot.variance)}`;
}

function getScheduleStatusToneClass(status?: TaskScheduleStatus) {
    switch (status) {
        case "finished_early":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
        case "overdue":
            return "border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300";
        case "on_time":
            return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";
        case "not_specified":
        default:
            return "border-border/70 bg-muted/60 text-muted-foreground";
    }
}

function getScheduleStatusLabel(status?: TaskScheduleStatus): string {
    switch (status) {
        case "finished_early":
            return "Finished early";
        case "overdue":
            return "Overdue";
        case "on_time":
            return "On time";
        case "not_specified":
            return "Not specified";
        default:
            return "Unknown";
    }
}

function getTaskHealthBarClass(health: TaskHealthStatus) {
    switch (health) {
        case "ahead":
            return "bg-emerald-500";
        case "on_track":
            return "bg-sky-500";
        case "at_risk":
            return "bg-orange-500";
        case "critical":
            return "bg-red-500";
        case "needs_plan":
        default:
            return "bg-slate-400";
    }
}

function getTaskHealthTintClass(health: TaskHealthStatus) {
    switch (health) {
        case "ahead":
            return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15 dark:text-emerald-300";
        case "on_track":
            return "bg-sky-500/10 text-sky-700 ring-sky-500/15 dark:text-sky-300";
        case "at_risk":
            return "bg-orange-500/12 text-orange-700 ring-orange-500/20 dark:text-orange-300";
        case "critical":
            return "bg-red-500/12 text-red-700 ring-red-500/20 dark:text-red-300";
        case "needs_plan":
        default:
            return "bg-slate-500/10 text-slate-700 ring-slate-500/15 dark:text-slate-300";
    }
}

function getTaskHealthBorderClass(health: TaskHealthStatus) {
    switch (health) {
        case "ahead":
            return "border-l-emerald-500";
        case "on_track":
            return "border-l-sky-500";
        case "at_risk":
            return "border-l-orange-500";
        case "critical":
            return "border-l-red-500";
        case "needs_plan":
        default:
            return "border-l-slate-400";
    }
}

function matchesScheduleStatusFilter(status: TaskScheduleStatus | undefined, filterValue: string) {
    if (filterValue === "all") return true;
    const normalizedFilterValues = filterValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    if (normalizedFilterValues.length === 0) return true;
    if (!status) return false;
    return normalizedFilterValues.includes(status);
}

function clampProgress(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
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

function isWithinDateRange(value: string | null | undefined, from?: string, to?: string): boolean {
    if (!value) return true;
    const candidateDate = new Date(value);
    if (Number.isNaN(candidateDate.getTime())) return true;

    if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        if (candidateDate < fromDate) return false;
    }

    if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        if (candidateDate > toDate) return false;
    }

    return true;
}

function mapTaskStatusToApi(status: TaskStatus): "pending" | "in_progress" | "blocked" | "done" {
    switch (status) {
        case "todo":
            return "pending";
        case "in_progress":
            return "in_progress";
        case "blocked":
            return "blocked";
        case "done":
            return "done";
        default:
            return "pending";
    }
}
// Types
type TaskFormMode = 'today' | 'plan' | 'range';
type KanbanTaskItem = (Task & { column: TaskStatus }) & Record<string, unknown>;
type ResourceRoleOption = {
    value: string;
    label: string;
    ratePerHour: number;
    currency: string;
};
type TaskListSortDirection = "asc" | "desc";
type TaskListSortField =
    | "updated_at"
    | "expected_progress_pct"
    | "actual_progress_pct"
    | "variance_pct"
    | "health_status";
type TaskListSortOptionValue = `${TaskListSortField}:${TaskListSortDirection}`;

const TASK_SORT_OPTIONS: { value: TaskListSortOptionValue; label: string }[] = [
    { value: "updated_at:desc", label: "Recently updated" },
    { value: "updated_at:asc", label: "Least recently updated" },
    { value: "expected_progress_pct:desc", label: "Expected progress: high to low" },
    { value: "expected_progress_pct:asc", label: "Expected progress: low to high" },
    { value: "actual_progress_pct:desc", label: "Actual progress: high to low" },
    { value: "actual_progress_pct:asc", label: "Actual progress: low to high" },
    { value: "variance_pct:desc", label: "Variance: highest first" },
    { value: "variance_pct:asc", label: "Variance: lowest first" },
    { value: "health_status:asc", label: "Health status: A to Z" },
    { value: "health_status:desc", label: "Health status: Z to A" },
];
const TASK_HEALTH_SUMMARY_ORDER: TaskHealthStatus[] = ["ahead", "on_track", "at_risk", "critical", "needs_plan"];
const TASK_HEALTH_EXCEPTION_SET = new Set<TaskHealthStatus>(["critical", "at_risk", "needs_plan"]);

function parseTaskSortOption(value: string): { sortBy: TaskListSortField; sortDir: TaskListSortDirection } {
    const [rawSortBy, rawSortDir] = value.split(":");
    const sortByValues: TaskListSortField[] = [
        "updated_at",
        "expected_progress_pct",
        "actual_progress_pct",
        "variance_pct",
        "health_status",
    ];
    const sortDirValues: TaskListSortDirection[] = ["asc", "desc"];
    const sortBy = sortByValues.includes(rawSortBy as TaskListSortField)
        ? (rawSortBy as TaskListSortField)
        : "updated_at";
    const sortDir = sortDirValues.includes(rawSortDir as TaskListSortDirection)
        ? (rawSortDir as TaskListSortDirection)
        : "desc";
    return { sortBy, sortDir };
}

export function TasksPage() {
    const currentUserId = useAuthStore((state) => state.user?.id);
    const { data: projects } = useProjectsQuery();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedProject, setSelectedProject] = useState<string>("");
    const [createMode, setCreateMode] = useState<'plan' | 'range' | 'today'>('plan');
    const [editMode, setEditMode] = useState<'plan' | 'range' | 'today'>('plan');
    const requestedProjectId = searchParams.get("project") ?? "";

    useEffect(() => {
        if (!projects || projects.length === 0) return;
        const requestedProjectExists = requestedProjectId
            ? projects.some((project) => project.id === requestedProjectId)
            : false;

        if (requestedProjectExists) {
            setSelectedProject((current) => (current === requestedProjectId ? current : requestedProjectId));
            return;
        }

        setSelectedProject((current) => (current ? current : projects[0]?.id ?? ""));
    }, [projects, requestedProjectId]);
    useEffect(() => {
        if (!selectedProject) return;
        if (searchParams.get("project") === selectedProject) return;

        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.set("project", selectedProject);
        setSearchParams(nextSearchParams, { replace: true });
    }, [searchParams, selectedProject, setSearchParams]);
    const [view, setView] = useState<"list" | "gantt" | "kanban">("list");
    const isTabletOrMobile = useMedia("(max-width: 1023px)", false);
    const isLaptopDensity = useMedia("(min-width: 1024px) and (max-width: 1439px)", false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [scheduleStatusFilter, setScheduleStatusFilter] = useState<string>("all");
    const [healthStatusFilter, setHealthStatusFilter] = useState<string>("all");
    const [sortOption, setSortOption] = useState<TaskListSortOptionValue>("updated_at:desc");
    const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
    const [startFromFilter, setStartFromFilter] = useState("");
    const [startToFilter, setStartToFilter] = useState("");
    const [dueFromFilter, setDueFromFilter] = useState("");
    const [dueToFilter, setDueToFilter] = useState("");
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 180);
    const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
    const normalizedSearchQuery = normalizeApiSearchQuery(deferredSearchQuery) ?? "";
    const normalizedSearchQueryLower = normalizedSearchQuery.toLowerCase();
    const apiStatusFilter = useMemo(
        () => (statusFilter === "all" ? undefined : mapTaskStatusToApi(statusFilter as TaskStatus)),
        [statusFilter],
    );
    const apiAssigneeFilter = assigneeFilter === "all" ? undefined : assigneeFilter;
    const { sortBy, sortDir } = useMemo(
        () => parseTaskSortOption(sortOption),
        [sortOption],
    );
    const activeSortLabel = useMemo(
        () => TASK_SORT_OPTIONS.find((option) => option.value === sortOption)?.label ?? "Recently updated",
        [sortOption],
    );

    const listQueryParams = useMemo(
        () => ({
            q: normalizedSearchQuery || undefined,
            status: apiStatusFilter,
            schedule_status: scheduleStatusFilter === "all" ? undefined : scheduleStatusFilter,
            health_status: healthStatusFilter === "all" ? undefined : healthStatusFilter,
            assignee_id: apiAssigneeFilter,
            start_from: startFromFilter || undefined,
            start_to: startToFilter || undefined,
            due_from: dueFromFilter || undefined,
            due_to: dueToFilter || undefined,
            page,
            per_page: pageSize,
            sort_by: sortBy,
            sort_dir: sortDir,
        }),
        [
            apiAssigneeFilter,
            apiStatusFilter,
            dueFromFilter,
            dueToFilter,
            normalizedSearchQuery,
            page,
            pageSize,
            healthStatusFilter,
            scheduleStatusFilter,
            sortBy,
            sortDir,
            startFromFilter,
            startToFilter,
        ],
    );

    // Fetch full task graph for Kanban/Gantt (list view uses server-side pagination query below).
    const {
        data: allTasksData,
        isLoading: isLoadingAllTasks,
        refetch: refetchAllTasks,
        isRefetching: isRefetchingAllTasks,
    } = useTasksByProject(
        selectedProject ?? "",
        false,
        { enabled: view !== "list" },
    );

    // Fetch list view with backend-side filtering/pagination/sorting.
    const {
        data: listTasksData,
        isLoading: isLoadingListTasks,
        refetch: refetchListTasks,
        isRefetching: isRefetchingListTasks,
    } = useTasksByProjectList(
        selectedProject ?? "",
        listQueryParams,
        { enabled: view === "list" },
    );

    // Fetch progress entries only when the Gantt view is active.
    const { data: progressData, isLoading: isLoadingProgress } = useTasksByProject(
        selectedProject ?? "",
        true,
        { enabled: view === "gantt" }
    );

    const { data: dependenciesData } = useDependencies(selectedProject ?? "");

    const allTasksRaw = allTasksData as Task[] | undefined;
    const allTasks = Array.isArray(allTasksRaw) ? allTasksRaw : EMPTY_TASKS;
    const listTasksRaw = listTasksData?.tasks;
    const listTasks = Array.isArray(listTasksRaw) ? listTasksRaw : EMPTY_TASKS;
    const listTotalCount = listTasksData?.total ?? listTasks.length;
    const tasks = view === "list" ? listTasks : allTasks;
    const taskLookup = useMemo(() => {
        const next = new Map<string, Task>();
        allTasks.forEach((task) => next.set(task.id, task));
        listTasks.forEach((task) => next.set(task.id, task));
        return next;
    }, [allTasks, listTasks]);
    const progressRaw = progressData as Progress[] | undefined;
    const progress = Array.isArray(progressRaw) ? progressRaw : EMPTY_PROGRESS;
    const dependencies = Array.isArray(dependenciesData) ? dependenciesData : [];
    const isLoading = (view === "list" ? isLoadingListTasks : isLoadingAllTasks) || (view === "gantt" && isLoadingProgress);
    const { data: projectAssignees = [] } = useProjectAssigneesQuery(selectedProject ?? "", {
        enabled: Boolean(selectedProject),
    });
    const { data: projectMembers = [] } = useProjectMembersQuery(selectedProject ?? "", {
        enabled: Boolean(selectedProject),
    });
    const { data: usersLookup } = useUsersLookupQuery();
    const { data: projectResourceRoleRates = [] } = useProjectResourceRoleRatesQuery(selectedProject ?? "", {
        enabled: Boolean(selectedProject),
    });
    const { data: myProjectScopes = [] } = useMyProjectScopesQuery({
        enabled: Boolean(selectedProject),
    });
    const { data: globalResourceRoles = [] } = useResourceRolesQuery({
        enabled: Boolean(selectedProject) && projectResourceRoleRates.length === 0,
    });
    const selectedProjectPresence = useRealtimeStore((state) => (
        selectedProject
            ? state.presenceByProjectId[selectedProject] ?? EMPTY_REALTIME_PRESENCE
            : EMPTY_REALTIME_PRESENCE
    ));

    const projectAssigneeList = useMemo(
        () => projectAssignees,
        [projectAssignees],
    );
    const projectMemberList = useMemo(
        () => projectMembers.map((member) => ({
            id: member.user_id,
            name: member.user_name,
            email: member.user_email,
        })),
        [projectMembers],
    );

    const assignableUsers = useMemo(() => {
        const entries = new Map<string, { id: string; name?: string | null; email: string }>();
        projectMemberList.forEach((user) => {
            entries.set(user.id, user);
        });
        projectAssigneeList.forEach((user) => {
            entries.set(user.id, user);
        });
        return Array.from(entries.values()).sort((left, right) => {
            const leftLabel = (left.name?.trim() || left.email).toLowerCase();
            const rightLabel = (right.name?.trim() || right.email).toLowerCase();
            return leftLabel.localeCompare(rightLabel);
        });
    }, [projectAssigneeList, projectMemberList]);
    const teamMembersForSummary = useMemo(() => {
        const presenceByUserId = new Map(
            selectedProjectPresence.map((user) => [user.user_id, user] as const),
        );
        const source = projectMemberList.length > 0 ? projectMemberList : assignableUsers;
        return source
            .map((member) => ({
                id: member.id,
                name: member.name?.trim() || null,
                email: member.email,
                label: member.name?.trim() || member.email,
                initials: getTeamMemberInitials(member.name, member.email),
                presence: presenceByUserId.get(member.id) ?? null,
            }))
            .sort((left, right) => {
                const leftOnline = left.presence?.status === "online" ? 1 : 0;
                const rightOnline = right.presence?.status === "online" ? 1 : 0;
                if (leftOnline !== rightOnline) return rightOnline - leftOnline;

                const leftRecent = isPresenceRecentlyActive(left.presence) ? 1 : 0;
                const rightRecent = isPresenceRecentlyActive(right.presence) ? 1 : 0;
                if (leftRecent !== rightRecent) return rightRecent - leftRecent;

                return left.label.localeCompare(right.label);
            });
    }, [assignableUsers, projectMemberList, selectedProjectPresence]);
    const visibleTeamMembers = useMemo(
        () => teamMembersForSummary.slice(0, 4),
        [teamMembersForSummary],
    );
    const hiddenTeamMemberCount = Math.max(teamMembersForSummary.length - visibleTeamMembers.length, 0);
    const onlineTeamMemberCount = useMemo(
        () => teamMembersForSummary.filter((member) => member.presence?.status === "online").length,
        [teamMembersForSummary],
    );

    const assigneeDirectory = useMemo(() => {
        const entries = new Map<string, { id: string; name?: string | null; email: string }>();
        (usersLookup?.users ?? []).forEach((user) => {
            entries.set(user.id, user);
        });
        projectMemberList.forEach((user) => {
            entries.set(user.id, user);
        });
        projectAssigneeList.forEach((user) => {
            entries.set(user.id, user);
        });
        return entries;
    }, [projectAssigneeList, projectMemberList, usersLookup?.users]);

    const assigneeById = useMemo(
        () => assigneeDirectory,
        [assigneeDirectory],
    );

    const getAssigneeLabel = useCallback((assigneeId?: string) => {
        if (!assigneeId) return "—";
        const user = assigneeById.get(assigneeId);
        if (user?.name?.trim()) return user.name;
        if (user?.email?.trim()) return user.email;
        return `Unknown (${assigneeId.slice(0, 8)})`;
    }, [assigneeById]);

    const getAssigneeInitial = useCallback((assigneeId?: string) => {
        if (!assigneeId) return "U";
        const user = assigneeById.get(assigneeId);
        const display = user?.name?.trim() || user?.email?.trim();
        return display ? display.charAt(0).toUpperCase() : "U";
    }, [assigneeById]);

    // List view is already server-filtered + paginated; other views keep client-side filtering for full graph.
    const filteredTasks = useMemo(() => {
        if (view === "list") return listTasks;
        return allTasks.filter((task) => {
            const matchesSearch = task.name.toLowerCase().includes(normalizedSearchQueryLower);
            const matchesStatus = statusFilter === "all" || task.status === statusFilter;
            const matchesScheduleStatus = matchesScheduleStatusFilter(task.scheduleStatus, scheduleStatusFilter);
            const matchesHealthStatus = healthStatusFilter === "all" || task.healthStatus === healthStatusFilter;
            const matchesAssignee = assigneeFilter === "all" || task.assigneeId === assigneeFilter;
            const matchesStartDate = isWithinDateRange(task.startDate, startFromFilter || undefined, startToFilter || undefined);
            const matchesDueDate = isWithinDateRange(task.dueDate, dueFromFilter || undefined, dueToFilter || undefined);
            return matchesSearch && matchesStatus && matchesScheduleStatus && matchesHealthStatus && matchesAssignee && matchesStartDate && matchesDueDate;
        });
    }, [
        allTasks,
        assigneeFilter,
        dueFromFilter,
        dueToFilter,
        healthStatusFilter,
        listTasks,
        normalizedSearchQueryLower,
        scheduleStatusFilter,
        startFromFilter,
        startToFilter,
        statusFilter,
        view,
    ]);

    const pagedTasks = useMemo(() => {
        if (view === "list") return filteredTasks;
        const start = (page - 1) * pageSize;
        return filteredTasks.slice(start, start + pageSize);
    }, [filteredTasks, page, pageSize, view]);

    const totalFilteredCount = view === "list" ? listTotalCount : filteredTasks.length;
    const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
    const hasAdvancedFilters = assigneeFilter !== "all"
        || healthStatusFilter !== "all"
        || scheduleStatusFilter !== "all"
        || startFromFilter !== ""
        || startToFilter !== ""
        || dueFromFilter !== ""
        || dueToFilter !== "";
    const activeAdvancedFilterCount = useMemo(() => {
        let count = 0;
        if (assigneeFilter !== "all") count += 1;
        if (healthStatusFilter !== "all") count += 1;
        if (scheduleStatusFilter !== "all") count += 1;
        if (startFromFilter) count += 1;
        if (startToFilter) count += 1;
        if (dueFromFilter) count += 1;
        if (dueToFilter) count += 1;
        return count;
    }, [assigneeFilter, dueFromFilter, dueToFilter, healthStatusFilter, scheduleStatusFilter, startFromFilter, startToFilter]);
    const currentViewLabel = useMemo(() => {
        if (view === "kanban") return "Board";
        if (view === "gantt") return "Gantt";
        return "List";
    }, [view]);
    const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
    const resetSecondaryTaskControls = useCallback((options?: { closeAdvanced?: boolean }) => {
        setSortOption("updated_at:desc");
        setAssigneeFilter("all");
        setHealthStatusFilter("all");
        setScheduleStatusFilter("all");
        setStartFromFilter("");
        setStartToFilter("");
        setDueFromFilter("");
        setDueToFilter("");
        if (options?.closeAdvanced) {
            setIsAdvancedFiltersOpen(false);
        }
    }, []);
    const hasSecondaryTaskControls = sortOption !== "updated_at:desc" || hasAdvancedFilters;
    const [isSelectionActionsOpen, setIsSelectionActionsOpen] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
    const [bulkStatus, setBulkStatus] = useState<string>("");
    const [bulkAssignee, setBulkAssignee] = useState<string>("");
    const [bulkProgress, setBulkProgress] = useState<number>(0);
    const [bulkProgressTouched, setBulkProgressTouched] = useState(false);
    const [isBulkApplying, setIsBulkApplying] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const isBulkBusy = isBulkApplying || isBulkDeleting;

    const selectedOnPageCount = useMemo(
        () => pagedTasks.reduce((count, task) => (selectedTaskIdSet.has(task.id) ? count + 1 : count), 0),
        [pagedTasks, selectedTaskIdSet]
    );
    const selectedFilteredCount = useMemo(
        () => (view === "list"
            ? selectedOnPageCount
            : filteredTasks.reduce((count, task) => (selectedTaskIdSet.has(task.id) ? count + 1 : count), 0)),
        [filteredTasks, selectedOnPageCount, selectedTaskIdSet, view]
    );
    const selectedTasks = useMemo(
        () => selectedTaskIds.map((taskId) => taskLookup.get(taskId)).filter((task): task is Task => Boolean(task)),
        [selectedTaskIds, taskLookup],
    );
    const selectedWeightedTaskCount = useMemo(
        () => selectedTasks.filter((task) => isWeightedProgressTask(task)).length,
        [selectedTasks],
    );
    const canBulkEditProgress = selectedTasks.length > 0 && selectedWeightedTaskCount < selectedTasks.length;
    const healthSummaryTasks = useMemo(
        () => (view === "list" ? pagedTasks : filteredTasks),
        [filteredTasks, pagedTasks, view],
    );
    const healthSummaryScopeLabel = useMemo(() => {
        if (view === "list") {
            if (pagedTasks.length === 0) return "Current page";
            if (totalFilteredCount > pagedTasks.length) {
                return `Current page (${pagedTasks.length} of ${totalFilteredCount})`;
            }
            return `Current page (${pagedTasks.length})`;
        }
        return `Filtered set (${filteredTasks.length})`;
    }, [filteredTasks.length, pagedTasks.length, totalFilteredCount, view]);
    const healthSummaryItems = useMemo(() => {
        const counts = new Map<TaskHealthStatus, number>(
            TASK_HEALTH_SUMMARY_ORDER.map((healthStatus) => [healthStatus, 0]),
        );
        healthSummaryTasks.forEach((task) => {
            const resolvedHealth = task.healthStatus ?? getTaskScurveSnapshot(task).health;
            counts.set(resolvedHealth, (counts.get(resolvedHealth) ?? 0) + 1);
        });
        return TASK_HEALTH_SUMMARY_ORDER.map((healthStatus) => ({
            healthStatus,
            label: getTaskHealthLabel(healthStatus),
            count: counts.get(healthStatus) ?? 0,
            active: healthStatusFilter === healthStatus,
        }));
    }, [healthStatusFilter, healthSummaryTasks]);
    const healthSummaryLegendItems = useMemo(
        () => healthSummaryItems.filter((item) => item.count > 0),
        [healthSummaryItems],
    );
    const visibleHealthSummaryItems = useMemo(() => {
        const availableItems = healthSummaryItems.filter((item) => item.count > 0 || item.active);

        if (!isLaptopDensity) {
            return availableItems;
        }

        const exceptionItems = availableItems.filter((item) => TASK_HEALTH_EXCEPTION_SET.has(item.healthStatus));
        const activeStableItems = availableItems.filter((item) => item.active && !TASK_HEALTH_EXCEPTION_SET.has(item.healthStatus));

        if (exceptionItems.length > 0) {
            const includedStates = new Set(exceptionItems.map((item) => item.healthStatus));
            return [
                ...exceptionItems,
                ...activeStableItems.filter((item) => !includedStates.has(item.healthStatus)),
            ];
        }

        return availableItems.slice(0, 2);
    }, [healthSummaryItems, isLaptopDensity]);
    const healthSummaryTotalCount = useMemo(
        () => healthSummaryItems.reduce((total, item) => total + item.count, 0),
        [healthSummaryItems],
    );
    const healthSummaryExceptionCount = useMemo(
        () => healthSummaryItems
            .filter((item) => TASK_HEALTH_EXCEPTION_SET.has(item.healthStatus))
            .reduce((total, item) => total + item.count, 0),
        [healthSummaryItems],
    );
    const isHealthSummaryAllClear = healthSummaryExceptionCount === 0
        && healthStatusFilter === "all"
        && healthSummaryTotalCount > 0;
    const selectionScopeLabel = useMemo(() => {
        if (view === "list") {
            return selectedOnPageCount > 0 ? ` (${selectedOnPageCount} on this page)` : "";
        }
        const parts: string[] = [];
        if (selectedOnPageCount > 0) parts.push(`${selectedOnPageCount} on this page`);
        if (selectedFilteredCount > 0) parts.push(`${selectedFilteredCount} in filtered set`);
        return parts.length > 0 ? ` (${parts.join(", ")})` : "";
    }, [selectedFilteredCount, selectedOnPageCount, view]);
    const allPageSelected = pagedTasks.length > 0 && selectedOnPageCount === pagedTasks.length;
    const allFilteredSelected = view === "list"
        ? allPageSelected
        : (filteredTasks.length > 0 && selectedFilteredCount === filteredTasks.length);
    const hasBulkDraftChanges = Boolean(bulkStatus) || Boolean(bulkAssignee) || bulkProgressTouched;
    const resetBulkDraft = useCallback(() => {
        setBulkStatus("");
        setBulkAssignee("");
        setBulkProgress(0);
        setBulkProgressTouched(false);
    }, []);
    const assigneeOptions = useMemo(
        () => [
            { value: "__unassigned__", label: "Unassigned" },
            ...assignableUsers.map((user) => ({
                value: user.id,
                label: user.name?.trim()
                    ? `${user.name} (${user.email})`
                    : user.email,
            })),
        ],
        [assignableUsers]
    );
    const assigneeFilterOptions = useMemo(
        () => [
            { value: "all", label: "All Assignees" },
            ...assignableUsers.map((user) => ({
                value: user.id,
                label: user.name?.trim()
                    ? `${user.name} (${user.email})`
                    : user.email,
            })),
        ],
        [assignableUsers]
    );
    const scheduleStatusFilterOptions = useMemo(
        () => [
            { value: "all", label: "All Schedule Status" },
            { value: "finished_early", label: "Finished Early" },
            { value: "overdue", label: "Overdue" },
            { value: "on_time", label: "On Time" },
            { value: "not_specified", label: "Not Specified" },
        ],
        [],
    );
    const healthStatusFilterOptions = useMemo(
        () => [
            { value: "all", label: "All Health States" },
            { value: "ahead", label: "Ahead" },
            { value: "on_track", label: "On Track" },
            { value: "at_risk", label: "At Risk" },
            { value: "critical", label: "Critical" },
            { value: "needs_plan", label: "Needs Plan" },
        ],
        [],
    );
    const activeHealthFilterLabel = useMemo(
        () => healthStatusFilterOptions.find((option) => option.value === healthStatusFilter)?.label ?? "All health",
        [healthStatusFilter, healthStatusFilterOptions],
    );
    const activeScheduleFilterLabel = useMemo(
        () => scheduleStatusFilterOptions.find((option) => option.value === scheduleStatusFilter)?.label ?? "All schedule",
        [scheduleStatusFilter, scheduleStatusFilterOptions],
    );
    const activeAssigneeFilterLabel = useMemo(
        () => assigneeFilterOptions.find((option) => option.value === assigneeFilter)?.label ?? "All assignees",
        [assigneeFilter, assigneeFilterOptions],
    );
    const hiddenAdvancedFilterSummary = useMemo(() => {
        const summaryParts: string[] = [];

        if (assigneeFilter !== "all") {
            summaryParts.push(`Assignee: ${activeAssigneeFilterLabel.replace(/\s+\([^)]*\)\s*$/, "")}`);
        }
        if (startFromFilter || startToFilter) {
            summaryParts.push(`Start: ${formatFilterDateSummaryLabel(startFromFilter)} to ${formatFilterDateSummaryLabel(startToFilter)}`);
        }
        if (dueFromFilter || dueToFilter) {
            summaryParts.push(`Due: ${formatFilterDateSummaryLabel(dueFromFilter)} to ${formatFilterDateSummaryLabel(dueToFilter)}`);
        }

        return summaryParts;
    }, [
        activeAssigneeFilterLabel,
        assigneeFilter,
        dueFromFilter,
        dueToFilter,
        startFromFilter,
        startToFilter,
    ]);
    const visibleTaskScopeSummary = useMemo(() => {
        const summaryParts: string[] = [];
        summaryParts.push(`View: ${currentViewLabel}`);
        if (view === "list") {
            summaryParts.push(`Sort: ${activeSortLabel}`);
        }
        if (statusFilter !== "all") {
            summaryParts.push(`Status: ${getTaskStatusLabel(statusFilter as TaskStatus)}`);
        }
        if (scheduleStatusFilter !== "all") {
            summaryParts.push(`Schedule: ${activeScheduleFilterLabel}`);
        }
        if (healthStatusFilter !== "all") {
            summaryParts.push(`Health: ${activeHealthFilterLabel}`);
        }
        return summaryParts;
    }, [
        activeHealthFilterLabel,
        activeScheduleFilterLabel,
        activeSortLabel,
        currentViewLabel,
        healthStatusFilter,
        scheduleStatusFilter,
        statusFilter,
        view,
    ]);
    const allowedResourceRoleIds = useMemo(() => {
        const scopes = Array.isArray(myProjectScopes) ? myProjectScopes : [];
        const selectedScope = scopes.find((scope) => scope.project_id === selectedProject);
        const resourceRoles = selectedScope?.resource_roles ?? [];
        return new Set(resourceRoles.map((role) => role.id));
    }, [myProjectScopes, selectedProject]);
    const resourceRoleOptions = useMemo<ResourceRoleOption[]>(() => {
        const normalize = (options: ResourceRoleOption[]) => {
            if (allowedResourceRoleIds.size === 0) return options;
            return options.filter((option) => allowedResourceRoleIds.has(option.value));
        };

        if (Array.isArray(projectResourceRoleRates) && projectResourceRoleRates.length > 0) {
            return normalize(projectResourceRoleRates.map((role) => ({
                value: role.resource_role_id,
                label: `${role.resource_role_name} (${formatCurrencyAmount(role.hourly_rate, role.currency)}/hr)`,
                ratePerHour: role.hourly_rate,
                currency: role.currency,
            })));
        }

        if (Array.isArray(globalResourceRoles) && globalResourceRoles.length > 0) {
            return normalize(globalResourceRoles.map((role) => ({
                value: role.id,
                label: `${role.name} (${formatCurrencyAmount(role.default_hourly_rate, role.currency)}/hr)`,
                ratePerHour: role.default_hourly_rate,
                currency: role.currency,
            })));
        }

        return [];
    }, [allowedResourceRoleIds, globalResourceRoles, projectResourceRoleRates]);

    const kanbanTasks = useMemo<KanbanTaskItem[]>(
        () => filteredTasks.map((task) => ({ ...task, column: task.status })),
        [filteredTasks],
    );

    const kanbanCountByStatus = useMemo(() => {
        const counts = new Map<string, number>();
        filteredTasks.forEach((task) => {
            counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
        });
        return counts;
    }, [filteredTasks]);

    // List view table scroll container (desktop).

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    useEffect(() => {
        setPage(1);
    }, [
        assigneeFilter,
        dueFromFilter,
        dueToFilter,
        healthStatusFilter,
        normalizedSearchQuery,
        selectedProject,
        scheduleStatusFilter,
        sortOption,
        startFromFilter,
        startToFilter,
        statusFilter,
    ]);

    useEffect(() => {
        setSelectedTaskIds((current) => current.filter((taskId) => filteredTasks.some((task) => task.id === taskId)));
    }, [filteredTasks]);

    useEffect(() => {
        if (selectedTaskIds.length === 0) {
            setIsSelectionActionsOpen(false);
        }
    }, [selectedTaskIds.length]);

    useEffect(() => {
        setSelectedTaskIds([]);
        resetBulkDraft();
        setIsSelectionActionsOpen(false);
    }, [resetBulkDraft, selectedProject, view]);

    const toggleTaskSelection = useCallback((taskId: string, checked: boolean) => {
        setSelectedTaskIds((current) => {
            if (checked) {
                if (current.includes(taskId)) return current;
                return [...current, taskId];
            }
            return current.filter((id) => id !== taskId);
        });
    }, []);

    const toggleSelectAllOnPage = useCallback((checked: boolean) => {
        const pageTaskIds = pagedTasks.map((task) => task.id);
        setSelectedTaskIds((current) => {
            if (checked) {
                return Array.from(new Set([...current, ...pageTaskIds]));
            }
            const pageTaskSet = new Set(pageTaskIds);
            return current.filter((id) => !pageTaskSet.has(id));
        });
    }, [pagedTasks]);

    const toggleSelectAllFiltered = useCallback((checked: boolean) => {
        if (view === "list") {
            toggleSelectAllOnPage(checked);
            return;
        }
        const filteredTaskIds = filteredTasks.map((task) => task.id);
        setSelectedTaskIds((current) => {
            if (checked) {
                return Array.from(new Set([...current, ...filteredTaskIds]));
            }
            const filteredTaskSet = new Set(filteredTaskIds);
            return current.filter((id) => !filteredTaskSet.has(id));
        });
    }, [filteredTasks, toggleSelectAllOnPage, view]);

    const isRefetching = view === "list" ? isRefetchingListTasks : isRefetchingAllTasks;
    const clearProjectRemoteChange = useRealtimeStore((state) => state.clearProjectRemoteChange);
    const selectedProjectRemoteChange = useRealtimeStore((state) => (
        selectedProject ? state.remoteChangesByProjectId[selectedProject] ?? null : null
    ));
    const refreshTasks = useCallback(async () => {
        if (view === "list") {
            await refetchListTasks();
            if (selectedProject) {
                clearProjectRemoteChange(selectedProject);
            }
            return;
        }
        await refetchAllTasks();
        if (selectedProject) {
            clearProjectRemoteChange(selectedProject);
        }
    }, [clearProjectRemoteChange, refetchAllTasks, refetchListTasks, selectedProject, view]);

    const createForm = useForm<TaskFormValues>({
        defaultValues: DEFAULT_TASK_FORM_VALUES,
    });
    const [createOpen, setCreateOpen] = useState(false);
    const [createProgressMethod, setCreateProgressMethod] = useState<TaskProgressMethod>("manual_percent_legacy");
    const [createWeightedStarterTemplateEnabled, setCreateWeightedStarterTemplateEnabled] = useState(true);
    const createRef = useRef<HTMLInputElement | null>(null);
    const timeToTaskSessionIdRef = useRef<string | null>(null);
    const [timeToTaskSummary, setTimeToTaskSummary] = useState(() =>
        getTimeToTaskSummary(currentUserId),
    );
    const [showTimeToTaskInsights, setShowTimeToTaskInsights] = useState(false);
    const [editing, setEditing] = useState<Task | null>(null);
    const editForm = useForm<TaskFormValues>({
        defaultValues: DEFAULT_TASK_FORM_VALUES,
    });
    const [workLogHours, setWorkLogHours] = useState<string>("1");
    const [workLogDate, setWorkLogDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
    const [workLogResourceRoleId, setWorkLogResourceRoleId] = useState<string>("");
    const [workLogNote, setWorkLogNote] = useState<string>("");
    const [editingWorkLogId, setEditingWorkLogId] = useState<string | null>(null);
    const [progressComponentDrafts, setProgressComponentDrafts] = useState<TaskProgressComponentDraft[]>([]);

    const createMutation = useTaskMutation(selectedProject);
    const deleteMutation = useDeleteTask(selectedProject);
    const inlineUpdateMutation = useUpdateTask();
    const editUpdateMutation = useUpdateTask();
    const ganttUpdateMutation = useUpdateTask();
    const ganttBatchUpdateMutation = useBatchUpdateTasks(selectedProject);
    const bulkUpdateTasksMutation = useBatchUpdateTasks(selectedProject, {
        notify: false,
        optimistic: false,
    });
    const bulkDeleteTasksMutation = useBatchDeleteTasks(selectedProject, { notify: false });
    const dependencyMutation = useDependencyMutation(selectedProject);
    const deleteDependencyMutation = useDeleteDependency(selectedProject);
    const taskWorkLogsQuery = useTaskWorkLogs(selectedProject, editing?.id, {
        enabled: Boolean(selectedProject && editing?.id),
    });
    const taskProgressComponentsQuery = useTaskProgressComponents(selectedProject, editing?.id, {
        enabled: Boolean(selectedProject && editing?.id && isWeightedProgressTask(editing)),
    });
    const createTaskWorkLogMutation = useCreateTaskWorkLog(selectedProject, editing?.id);
    const updateTaskWorkLogMutation = useUpdateTaskWorkLog(selectedProject, editing?.id);
    const deleteTaskWorkLogMutation = useDeleteTaskWorkLog(selectedProject, editing?.id);
    const replaceTaskProgressComponentsMutation = useReplaceTaskProgressComponents(selectedProject, editing?.id);
    const replaceTaskProgressComponentsForCreateMutation = useReplaceTaskProgressComponentsForTask(selectedProject);
    const taskWorkLogs = useMemo(() => {
        const rows = Array.isArray(taskWorkLogsQuery.data) ? taskWorkLogsQuery.data : [];
        return [...rows].sort((a, b) => {
            const aTime = new Date(a.work_date || a.updated_at || a.created_at).getTime();
            const bTime = new Date(b.work_date || b.updated_at || b.created_at).getTime();
            return bTime - aTime;
        });
    }, [taskWorkLogsQuery.data]);
    const taskProgressComponents = useMemo(() => {
        const rows = Array.isArray(taskProgressComponentsQuery.data) ? taskProgressComponentsQuery.data : [];
        return [...rows].sort((a, b) => a.sort_order - b.sort_order);
    }, [taskProgressComponentsQuery.data]);
    const isEditingWeightedTask = isWeightedProgressTask(editing);
    const editingTaskScurve = useMemo(
        () => (editing ? getTaskScurveSnapshot(editing) : null),
        [editing],
    );
    const selectedWorkLogRole = useMemo(
        () => resourceRoleOptions.find((role) => role.value === workLogResourceRoleId) ?? null,
        [resourceRoleOptions, workLogResourceRoleId],
    );
    const draftWorkLogEstimatedCost = useMemo(() => {
        const parsedHours = Number.parseFloat(workLogHours);
        if (!selectedWorkLogRole || !Number.isFinite(parsedHours) || parsedHours <= 0) return null;
        return parsedHours * selectedWorkLogRole.ratePerHour;
    }, [selectedWorkLogRole, workLogHours]);
    const isWorkLogSaving = createTaskWorkLogMutation.status === "pending"
        || updateTaskWorkLogMutation.status === "pending"
        || deleteTaskWorkLogMutation.status === "pending";
    const isProgressComponentsSaving = replaceTaskProgressComponentsMutation.status === "pending";

    const resetCreateTaskForm = useCallback(() => {
        createForm.reset(DEFAULT_TASK_FORM_VALUES);
        setCreateMode("plan");
        setCreateProgressMethod("manual_percent_legacy");
        setCreateWeightedStarterTemplateEnabled(true);
    }, [createForm]);

    const handleCreateDialogOpenChange = useCallback((open: boolean) => {
        setCreateOpen(open);
        if (!open) {
            resetCreateTaskForm();
        }
    }, [resetCreateTaskForm]);

    useEffect(() => {
        if (!editing) return;
        if (resourceRoleOptions.length === 0) {
            if (workLogResourceRoleId) setWorkLogResourceRoleId("");
            return;
        }
        if (!workLogResourceRoleId || !resourceRoleOptions.some((role) => role.value === workLogResourceRoleId)) {
            setWorkLogResourceRoleId(resourceRoleOptions[0].value);
        }
    }, [editing, resourceRoleOptions, workLogResourceRoleId]);

    useEffect(() => {
        if (!editing || !isWeightedProgressTask(editing)) {
            setProgressComponentDrafts([]);
            return;
        }

        if (taskProgressComponentsQuery.isLoading) {
            return;
        }

        if (taskProgressComponents.length === 0) {
            setProgressComponentDrafts([createEmptyProgressComponentDraft()]);
            return;
        }

        setProgressComponentDrafts(taskProgressComponents.map(mapProgressComponentToDraft));
    }, [editing, taskProgressComponents, taskProgressComponentsQuery.isLoading]);

    const refreshTimeToTaskSummary = useCallback(() => {
        setTimeToTaskSummary(getTimeToTaskSummary(currentUserId));
    }, [currentUserId]);

    const beginTimeToTaskSession = useCallback(() => {
        const nextSessionId = startTimeToTaskSession({
            route: "/tasks",
            userId: currentUserId,
            projectId: selectedProject || undefined,
            view,
        });
        timeToTaskSessionIdRef.current = nextSessionId;
        return nextSessionId;
    }, [currentUserId, selectedProject, view]);

    useEffect(() => {
        refreshTimeToTaskSummary();
        const sessionId = startTimeToTaskSession({
            route: "/tasks",
            userId: currentUserId,
        });
        timeToTaskSessionIdRef.current = sessionId;

        return () => {
            if (timeToTaskSessionIdRef.current) {
                abandonTimeToTaskSession(timeToTaskSessionIdRef.current, { reason: "leave-tasks-page" });
                timeToTaskSessionIdRef.current = null;
            }
        };
    }, [currentUserId, refreshTimeToTaskSummary]);

    useEffect(() => {
        if (!createOpen) return;
        const sessionId = timeToTaskSessionIdRef.current ?? beginTimeToTaskSession();
        markTimeToTaskIntent(sessionId, {
            projectId: selectedProject || undefined,
            view,
        });
    }, [beginTimeToTaskSession, createOpen, selectedProject, view]);

    const [ganttLocalOverrides, setGanttLocalOverrides] = useState<Record<string, Partial<Task>>>({});
    const ganttQueuedUpdatesRef = useRef<Map<string, GanttTask>>(new Map());
    const ganttFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ganttFlushInFlightRef = useRef(false);
    const [ganttPendingCount, setGanttPendingCount] = useState(0);
    const [ganttIsSyncing, setGanttIsSyncing] = useState(false);
    const [ganttSyncError, setGanttSyncError] = useState<string | null>(null);
    const [ganttLastSyncedAt, setGanttLastSyncedAt] = useState<number | null>(null);

    const mergedGanttTasks = useMemo(
        () => tasks.map((task) => ({ ...task, ...(ganttLocalOverrides[task.id] ?? {}) })),
        [tasks, ganttLocalOverrides],
    );

    const clearGanttFlushTimer = useCallback(() => {
        if (ganttFlushTimerRef.current) {
            clearTimeout(ganttFlushTimerRef.current);
            ganttFlushTimerRef.current = null;
        }
    }, []);

    const clearGanttOverridesFor = useCallback((taskIds: string[]) => {
        if (taskIds.length === 0) return;
        setGanttLocalOverrides((prev) => {
            let changed = false;
            const next = { ...prev };
            taskIds.forEach((taskId) => {
                // Keep optimistic state if a newer edit for this task is already queued.
                if (ganttQueuedUpdatesRef.current.has(taskId)) {
                    return;
                }
                if (next[taskId]) {
                    delete next[taskId];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, []);

    const flushQueuedGanttUpdates = useCallback(async () => {
        if (!selectedProject || ganttFlushInFlightRef.current || ganttQueuedUpdatesRef.current.size === 0) {
            return;
        }

        ganttFlushInFlightRef.current = true;
        setGanttIsSyncing(true);

        try {
            while (ganttQueuedUpdatesRef.current.size > 0) {
                const updates = Array.from(ganttQueuedUpdatesRef.current.values());
                ganttQueuedUpdatesRef.current.clear();
                setGanttPendingCount(ganttQueuedUpdatesRef.current.size);
                const updatedTaskIds = updates.map((task) => task.originalId);

                try {
                    if (updates.length === 1) {
                        const task = updates[0];
                        const sourceTask = taskLookup.get(task.originalId);
                        await ganttUpdateMutation.mutateAsync({
                            id: task.originalId,
                            projectId: selectedProject,
                            payload: {
                                name: task.name,
                                startDate: task.start.toISOString(),
                                endDate: task.end.toISOString(),
                                dueDate: task.end.toISOString(),
                                durationDays: getDurationDays(task.start, task.end),
                                ...(!isWeightedProgressTask(sourceTask) ? { progress: task.progress } : {}),
                            },
                        });
                    } else {
                        await ganttBatchUpdateMutation.mutateAsync({
                            tasks: updates.map((task) => {
                                const sourceTask = taskLookup.get(task.originalId);
                                return {
                                    id: task.originalId,
                                    title: task.name,
                                    start_date: task.start.toISOString(),
                                    end_date: task.end.toISOString(),
                                    due_date: task.end.toISOString(),
                                    ...(!isWeightedProgressTask(sourceTask) ? { progress: task.progress } : {}),
                                };
                            }),
                        });
                    }
                    clearGanttOverridesFor(updatedTaskIds);
                    setGanttSyncError(null);
                    setGanttLastSyncedAt(Date.now());
                } catch {
                    // Keep failed updates queued and visible for retry.
                    updates.forEach((task) => {
                        ganttQueuedUpdatesRef.current.set(task.originalId, task);
                    });
                    setGanttPendingCount(ganttQueuedUpdatesRef.current.size);
                    setGanttSyncError("Some task updates failed to sync.");
                    break;
                }
            }
        } finally {
            ganttFlushInFlightRef.current = false;
            setGanttIsSyncing(false);
            setGanttPendingCount(ganttQueuedUpdatesRef.current.size);
        }
    }, [clearGanttOverridesFor, ganttBatchUpdateMutation, ganttUpdateMutation, selectedProject, taskLookup]);

    const scheduleGanttFlush = useCallback(() => {
        clearGanttFlushTimer();
        ganttFlushTimerRef.current = setTimeout(() => {
            void flushQueuedGanttUpdates();
        }, 180);
    }, [clearGanttFlushTimer, flushQueuedGanttUpdates]);

    const queueGanttUpdates = useCallback((updatedTasks: GanttTask[]) => {
        if (!selectedProject || updatedTasks.length === 0) return;

        updatedTasks.forEach((task) => {
            ganttQueuedUpdatesRef.current.set(task.originalId, task);
        });

        setGanttPendingCount(ganttQueuedUpdatesRef.current.size);
        setGanttSyncError(null);

        setGanttLocalOverrides((prev) => {
            const next = { ...prev };
            let skippedWeightedProgressEdit = false;
            updatedTasks.forEach((task) => {
                const sourceTask = taskLookup.get(task.originalId);
                const sourceProgress = sourceTask?.actualProgressPct ?? sourceTask?.progress ?? task.progress;
                const canPersistProgress = !isWeightedProgressTask(sourceTask);
                if (!canPersistProgress && Math.round(task.progress) !== Math.round(sourceProgress)) {
                    skippedWeightedProgressEdit = true;
                }
                next[task.originalId] = {
                    ...(next[task.originalId] ?? {}),
                    name: task.name,
                    startDate: task.start.toISOString(),
                    endDate: task.end.toISOString(),
                    dueDate: task.end.toISOString(),
                    progress: canPersistProgress ? task.progress : sourceProgress,
                    durationDays: getDurationDays(task.start, task.end),
                };
            });
            if (skippedWeightedProgressEdit) {
                toast.info("Weighted tasks manage progress through components. Use Edit task to update component progress.");
            }
            return next;
        });

        scheduleGanttFlush();
    }, [scheduleGanttFlush, selectedProject, taskLookup]);

    const retryGanttSync = useCallback(() => {
        if (ganttQueuedUpdatesRef.current.size === 0 || ganttFlushInFlightRef.current) {
            return;
        }
        setGanttSyncError(null);
        void flushQueuedGanttUpdates();
    }, [flushQueuedGanttUpdates]);

    useEffect(() => {
        clearGanttFlushTimer();
        ganttQueuedUpdatesRef.current.clear();
        setGanttLocalOverrides({});
        setGanttPendingCount(0);
        setGanttIsSyncing(false);
        setGanttSyncError(null);
        setGanttLastSyncedAt(null);
    }, [clearGanttFlushTimer, selectedProject]);

    useEffect(() => {
        return () => {
            clearGanttFlushTimer();
        };
    }, [clearGanttFlushTimer]);

    const currentProject = projects?.find((project) => project.id === selectedProject);
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
    const [bulkDeleteTaskIds, setBulkDeleteTaskIds] = useState<string[]>([]);
    const resetWorkLogDraft = useCallback((preferredRoleId?: string) => {
        setWorkLogHours("1");
        setWorkLogDate(format(new Date(), "yyyy-MM-dd"));
        setWorkLogResourceRoleId(preferredRoleId ?? resourceRoleOptions[0]?.value ?? "");
        setWorkLogNote("");
        setEditingWorkLogId(null);
    }, [resourceRoleOptions]);

    const openTaskEditor = useCallback((task: Task) => {
        setEditing(task);
        const start = new Date(task.startDate || "");
        const end = new Date(task.endDate || "");
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        let mode: "plan" | "range" | "today" = "range";

        if (isSameDay(start, end)) {
            mode = "today";
        } else if (task.durationDays && diffDays === task.durationDays) {
            mode = "plan";
        }

        setEditMode(mode);
        editForm.reset({
            title: task.name,
            description: task.description ?? "",
            assigneeId: task.assigneeId ?? "",
            plan: task.durationDays ?? 1,
            start_date: formatDateForInput(task.startDate),
            end_date: formatDateForInput(task.endDate),
            progress: typeof task.actualProgressPct === "number"
                ? task.actualProgressPct
                : (typeof task.progress === "number" ? task.progress : 0),
            status: task.status,
            projectId: task.projectId,
        });
        resetWorkLogDraft(resourceRoleOptions[0]?.value);
    }, [editForm, resetWorkLogDraft, resourceRoleOptions]);

    const handleStartEditWorkLog = useCallback((workLog: ApiWorkLog) => {
        setEditingWorkLogId(workLog.id);
        setWorkLogHours(String(workLog.hours));
        setWorkLogDate(formatDateForWorkLogInput(workLog.work_date));
        setWorkLogResourceRoleId(workLog.resource_role_id);
        setWorkLogNote(workLog.note ?? "");
    }, []);

    const handleCancelWorkLogEdit = useCallback(() => {
        resetWorkLogDraft(workLogResourceRoleId || resourceRoleOptions[0]?.value);
    }, [resetWorkLogDraft, resourceRoleOptions, workLogResourceRoleId]);

    const handleSaveWorkLog = useCallback(async () => {
        if (!editing?.id || !selectedProject) {
            toast.error("Select a task before editing work logs.");
            return;
        }

        const parsedHours = Number.parseFloat(workLogHours);
        if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
            toast.error("Work-log hours must be greater than 0.");
            return;
        }

        if (!workLogResourceRoleId) {
            toast.error("Choose a resource role.");
            return;
        }

        const trimmedNote = workLogNote.trim();
        const payload = {
            hours: parsedHours,
            resource_role_id: workLogResourceRoleId,
            work_date: workLogDate || undefined,
            note: trimmedNote || null,
        };

        try {
            if (editingWorkLogId) {
                await updateTaskWorkLogMutation.mutateAsync({
                    id: editingWorkLogId,
                    payload,
                });
            } else {
                await createTaskWorkLogMutation.mutateAsync(payload);
            }

            resetWorkLogDraft(workLogResourceRoleId || resourceRoleOptions[0]?.value);
        } catch {
            // Mutation hooks already surface toast errors.
        }
    }, [
        createTaskWorkLogMutation,
        editing?.id,
        editingWorkLogId,
        resetWorkLogDraft,
        resourceRoleOptions,
        selectedProject,
        updateTaskWorkLogMutation,
        workLogDate,
        workLogHours,
        workLogNote,
        workLogResourceRoleId,
    ]);

    const handleDeleteWorkLog = useCallback(async (workLogId: string) => {
        try {
            await deleteTaskWorkLogMutation.mutateAsync(workLogId);
            if (editingWorkLogId === workLogId) {
                resetWorkLogDraft(resourceRoleOptions[0]?.value);
            }
        } catch {
            // Mutation hooks already surface toast errors.
        }
    }, [deleteTaskWorkLogMutation, editingWorkLogId, resetWorkLogDraft, resourceRoleOptions]);

    const updateProgressComponentDraft = useCallback((
        index: number,
        key: keyof TaskProgressComponentDraft,
        value: string,
    ) => {
        setProgressComponentDrafts((current) => current.map((draft, draftIndex) => (
            draftIndex === index ? { ...draft, [key]: value } : draft
        )));
    }, []);

    const addProgressComponentDraft = useCallback(() => {
        setProgressComponentDrafts((current) => [...current, createEmptyProgressComponentDraft(current.length + 1)]);
    }, []);

    const removeProgressComponentDraft = useCallback((index: number) => {
        setProgressComponentDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
    }, []);

    const totalProgressComponentWeight = useMemo(
        () => progressComponentDrafts.reduce((sum, draft) => {
            const weight = Number.parseFloat(draft.weight);
            return sum + (Number.isFinite(weight) ? weight : 0);
        }, 0),
        [progressComponentDrafts],
    );

    const handleSaveProgressComponents = useCallback(async () => {
        if (!selectedProject || !editing?.id || !isWeightedProgressTask(editing)) return;

        const componentsPayload = progressComponentDrafts.map((draft, index) => {
            const weight = Number.parseFloat(draft.weight);
            const completionPct = Number.parseFloat(draft.completionPct);

            return {
                ...(draft.id ? { id: draft.id } : {}),
                name: draft.name.trim(),
                weight: Number.isFinite(weight) ? weight : NaN,
                completion_pct: Number.isFinite(completionPct) ? clampProgress(completionPct) : NaN,
                component_type: draft.componentType.trim() || "milestone",
                planned_at: normalizeDateTimeLocalToIso(draft.plannedAt),
                completed_at: normalizeDateTimeLocalToIso(draft.completedAt),
                sort_order: index + 1,
            };
        });

        if (componentsPayload.length === 0) {
            toast.info("Add at least one progress component before saving.");
            return;
        }

        const invalidComponent = componentsPayload.find((component) => !component.name || !Number.isFinite(component.weight) || !Number.isFinite(component.completion_pct));
        if (invalidComponent) {
            toast.error("Each progress component needs a name, weight, and completion percentage.");
            return;
        }

        try {
            await replaceTaskProgressComponentsMutation.mutateAsync({
                components: componentsPayload,
            });
        } catch {
            // Mutation hook already surfaces a toast.
        }
    }, [editing, progressComponentDrafts, replaceTaskProgressComponentsMutation, selectedProject]);

    const handleBulkApplyChanges = useCallback(async () => {
        if (!selectedProject || selectedTaskIds.length === 0) return;

        const hasStatusChange = Boolean(bulkStatus);
        const hasAssigneeChange = Boolean(bulkAssignee);
        const hasProgressChange = bulkProgressTouched;
        const tasksForBulkOperation = selectedTaskIds
            .map((taskId) => taskLookup.get(taskId))
            .filter((task): task is Task => Boolean(task));
        const weightedTaskCount = tasksForBulkOperation.filter((task) => isWeightedProgressTask(task)).length;

        if (!hasStatusChange && !hasAssigneeChange && !hasProgressChange) {
            toast.info("Choose at least one bulk field before applying changes.");
            return;
        }

        if (hasProgressChange && weightedTaskCount === selectedTaskIds.length) {
            toast.info("Selected tasks use weighted components. Update their component progress inside the task editor.");
            return;
        }

        setIsBulkApplying(true);

        try {
            const updates = selectedTaskIds.map((taskId) => {
                const task = taskLookup.get(taskId);
                const includeProgress = hasProgressChange && !isWeightedProgressTask(task);

                return {
                    id: taskId,
                    ...(hasStatusChange ? { status: mapTaskStatusToApi(bulkStatus as TaskStatus) } : {}),
                    ...(hasAssigneeChange
                        ? { assignee: bulkAssignee === "__unassigned__" ? null : bulkAssignee }
                        : {}),
                    ...(includeProgress ? { progress: clampProgress(bulkProgress) } : {}),
                };
            });

            await bulkUpdateTasksMutation.mutateAsync({ tasks: updates });

            const appliedFields = [
                hasStatusChange ? "status" : null,
                hasAssigneeChange ? "assignee" : null,
                hasProgressChange && weightedTaskCount < selectedTaskIds.length ? "progress" : null,
            ].filter(Boolean).join(", ");

            toast.success(
                `Applied ${appliedFields} update${selectedTaskIds.length === 1 ? "" : "s"} to ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"}.`,
            );
            if (hasProgressChange && weightedTaskCount > 0) {
                toast.info(`Skipped direct progress updates for ${weightedTaskCount} weighted task${weightedTaskCount === 1 ? "" : "s"}.`);
            }
            setSelectedTaskIds([]);
            resetBulkDraft();
            setIsSelectionActionsOpen(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to apply bulk updates: ${message}`);
        } finally {
            setIsBulkApplying(false);
        }
    }, [
        bulkAssignee,
        bulkProgress,
        bulkProgressTouched,
        bulkStatus,
        bulkUpdateTasksMutation,
        resetBulkDraft,
        selectedProject,
        selectedTaskIds,
        taskLookup,
    ]);

    const handleBulkDelete = useCallback(async (taskIds: string[]) => {
        if (!selectedProject || taskIds.length === 0) return;
        setIsBulkDeleting(true);

        try {
            const result = await bulkDeleteTasksMutation.mutateAsync(taskIds);
            const deletedCount = Number.isFinite(result?.deleted) ? result.deleted : taskIds.length;
            toast.success(`Deleted ${deletedCount} task${deletedCount === 1 ? "" : "s"}.`);
            setSelectedTaskIds([]);
            resetBulkDraft();
            setBulkDeleteTaskIds([]);
            setBulkDeleteConfirmOpen(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to delete selected tasks: ${message}`);
        } finally {
            setIsBulkDeleting(false);
        }
    }, [bulkDeleteTasksMutation, resetBulkDraft, selectedProject]);

    const requestBulkDelete = useCallback(() => {
        if (!selectedProject || selectedTaskIds.length === 0) return;
        setBulkDeleteTaskIds(selectedTaskIds);
        setBulkDeleteConfirmOpen(true);
    }, [selectedProject, selectedTaskIds]);

    const workLogColumns = useMemo<ColumnDef<ApiWorkLog, unknown>[]>(() => ([
        workLogColumnHelper.accessor("work_date", {
            header: () => <div className="w-24">Date</div>,
            cell: (info) => (
                <span className="block w-24 text-sm tabular-nums">
                    {formatWorkLogDateLabel(info.getValue())}
                </span>
            ),
            meta: {
                headerClassName: "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-3 py-2 align-middle",
            },
        }),
        workLogColumnHelper.accessor("hours", {
            header: () => <div className="w-20 text-right">Hours</div>,
            cell: (info) => <div className="w-20 text-right text-sm tabular-nums">{info.getValue().toFixed(2)}</div>,
            meta: {
                headerClassName: "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-3 py-2 align-middle",
            },
        }),
        workLogColumnHelper.accessor("resource_role_name", {
            header: () => <div className="w-40">Role</div>,
            cell: (info) => (
                <span className="block w-40 truncate text-sm" title={info.getValue()}>
                    {info.getValue()}
                </span>
            ),
            meta: {
                headerClassName: "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-3 py-2 align-middle",
            },
        }),
        workLogColumnHelper.display({
            id: "cost",
            header: () => <div className="w-28 text-right">Cost</div>,
            cell: (info) => (
                <div className="w-28 text-right text-sm tabular-nums">
                    {formatCurrencyAmount(info.row.original.cost_amount, info.row.original.currency_snapshot)}
                </div>
            ),
            meta: {
                headerClassName: "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-3 py-2 align-middle",
            },
        }),
        workLogColumnHelper.accessor("note", {
            header: () => <div>Note</div>,
            cell: (info) => (
                <span className="block max-w-[260px] truncate text-sm text-muted-foreground" title={info.getValue() ?? ""}>
                    {info.getValue()?.trim() ? info.getValue() : "—"}
                </span>
            ),
            meta: {
                headerClassName: "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-3 py-2 align-middle",
            },
        }),
        workLogColumnHelper.display({
            id: "actions",
            header: () => <div className="w-[72px] text-right">Actions</div>,
            cell: (info) => (
                <div className="flex w-[72px] justify-end gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Edit work log from ${formatWorkLogDateLabel(info.row.original.work_date)}`}
                        onClick={() => handleStartEditWorkLog(info.row.original)}
                        disabled={isWorkLogSaving}
                        data-testid="tasks-work-log-edit-button"
                    >
                        <PencilLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Delete work log from ${formatWorkLogDateLabel(info.row.original.work_date)}`}
                        onClick={() => {
                            void handleDeleteWorkLog(info.row.original.id);
                        }}
                        disabled={isWorkLogSaving}
                        data-testid="tasks-work-log-delete-button"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ),
            meta: {
                headerClassName: "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                cellClassName: "px-3 py-2 align-middle",
            },
        }),
    ]), [handleDeleteWorkLog, handleStartEditWorkLog, isWorkLogSaving]);

    const listColumns = useMemo<ColumnDef<Task, unknown>[]>(() => {
        const baseColumns: ColumnDef<Task, unknown>[] = [
            taskListColumnHelper.display({
                id: "selection",
                header: () => (
                    <div className="flex items-center gap-2">
                        <TaskSelectionCheckbox
                            checked={allPageSelected}
                            onToggle={toggleSelectAllOnPage}
                            label="Select all tasks on current page"
                            testId="tasks-select-all-page-checkbox"
                        />
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">#</span>
                    </div>
                ),
                cell: (info) => {
                    const task = info.row.original;
                    return (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <TaskSelectionCheckbox
                                checked={selectedTaskIdSet.has(task.id)}
                                onToggle={(nextChecked) => toggleTaskSelection(task.id, nextChecked)}
                                onClick={(event) => event.stopPropagation()}
                                label={`Select task ${task.name}`}
                                testId="tasks-row-select-checkbox"
                            />
                            <span className="text-xs">{((page - 1) * pageSize) + info.row.index + 1}</span>
                        </div>
                    );
                },
            }),
            taskListColumnHelper.accessor("name", {
                header: "Task",
                cell: (info) => {
                    const task = info.row.original;
                    const assigneeLabel = getAssigneeLabel(task.assigneeId);
                    return (
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
                                        getTaskStatusTintClass(task.executionStatus ?? task.status),
                                    )}
                                    title={getTaskStatusLabel(task.executionStatus ?? task.status)}
                                >
                                    {getCompactTaskStatusLabel(task.executionStatus ?? task.status)}
                                </Badge>
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={info.getValue()}>
                                    {info.getValue()}
                                </span>
                                <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground xl:inline" title={assigneeLabel}>
                                    {assigneeLabel}
                                </span>
                                <span className="hidden rounded-full bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground 2xl:inline-flex">
                                    {task.id.slice(0, 8)}
                                </span>
                            </div>
                        </div>
                    );
                },
            }),
            taskListColumnHelper.display({
                id: "progress",
                header: "Progress",
                cell: (info) => {
                    const task = info.row.original;
                    const snapshot = getTaskScurveSnapshot(task);
                    const actualValue = Math.max(0, Math.min(snapshot.actual, 100));
                    const expectedValue = snapshot.expected === null
                        ? null
                        : Math.max(0, Math.min(snapshot.expected, 100));

                    return (
                        <div
                            className={cn("flex items-center gap-2.5", isLaptopDensity ? "min-w-[160px]" : "min-w-[180px]")}
                            title={getTaskScurveTitle(task)}
                        >
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/70">
                                <div
                                    className={cn("h-full rounded-full transition-[width]", getTaskHealthBarClass(snapshot.health))}
                                    style={{ width: `${actualValue}%` }}
                                />
                                {expectedValue !== null ? (
                                    <span
                                        className="absolute inset-y-[-2px] w-px rounded-full bg-background shadow-[0_0_0_1px_rgba(15,23,42,0.12)]"
                                        style={{ left: `calc(${expectedValue}% - 1px)` }}
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <span className="w-10 text-right text-sm font-semibold text-foreground tabular-nums">
                                    {formatTaskPercent(snapshot.actual)}
                                </span>
                                {!isLaptopDensity && snapshot.variance !== null ? (
                                    <span
                                        className={cn(
                                            "text-[11px] font-medium tabular-nums",
                                            snapshot.variance >= 0
                                                ? "text-emerald-700 dark:text-emerald-300"
                                                : "text-red-700 dark:text-red-300",
                                        )}
                                    >
                                        {formatTaskVariance(snapshot.variance)}
                                    </span>
                                ) : null}
                            </div>
                            <span className="sr-only">
                                Expected {formatTaskPercent(snapshot.expected)}. Actual {formatTaskPercent(snapshot.actual)}. Variance {formatTaskVariance(snapshot.variance)}. {getTaskHealthLabel(snapshot.health)}.
                            </span>
                        </div>
                    );
                },
            }),
            taskListColumnHelper.display({
                id: "timeline",
                header: "Timeline",
                cell: (info) => {
                    const task = info.row.original;
                    const dueLabel = task.dueDate
                        ? `Due ${format(new Date(task.dueDate), "MMM d")}`
                        : null;
                    const planLabel = task.durationDays
                        ? `${task.durationDays}d`
                        : null;
                    const scheduleLabel = task.scheduleStatus && task.scheduleStatus !== "not_specified"
                        ? getScheduleStatusLabel(task.scheduleStatus)
                        : null;

                    return (
                        <div className="flex min-w-0 items-center gap-2 text-sm">
                            {dueLabel ? (
                                <span className="shrink-0 font-medium text-foreground">{dueLabel}</span>
                            ) : null}
                            {planLabel ? <span className="shrink-0 text-muted-foreground">{planLabel}</span> : null}
                            {scheduleLabel ? (
                                <span
                                    className={cn(
                                        "truncate rounded-full border border-border/70 px-1.5 py-0.5 text-[10px]",
                                        task.scheduleStatus ? getScheduleStatusToneClass(task.scheduleStatus) : undefined,
                                    )}
                                >
                                    {scheduleLabel}
                                </span>
                            ) : null}
                            {!dueLabel && !planLabel && !scheduleLabel ? (
                                <span className="text-muted-foreground/40">—</span>
                            ) : null}
                            <span className="sr-only">
                                {dueLabel ?? "No due date"}. {planLabel ?? "No plan"}. {scheduleLabel ?? "Not specified"}.
                            </span>
                        </div>
                    );
                },
            }),
        ];
        baseColumns.push(
            taskListColumnHelper.display({
                id: "actions",
                header: () => <div className="sr-only text-right">Actions</div>,
                cell: (info) => {
                    const task = info.row.original;
                    return (
                        <div className="flex justify-end">
                            <div className="opacity-70 transition-opacity lg:opacity-20 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                                <TaskActionMenu
                                    task={task}
                                    triggerTestId="tasks-row-actions-trigger"
                                    editTestId="tasks-row-edit-button"
                                    deleteTestId="tasks-row-delete-button"
                                    onEdit={openTaskEditor}
                                    onDelete={(nextTask) => {
                                        setTaskToDelete(nextTask);
                                        setConfirmOpen(true);
                                    }}
                                />
                            </div>
                        </div>
                    );
                },
            }),
        );

        return baseColumns;
    }, [
        allPageSelected,
        getAssigneeLabel,
        isLaptopDensity,
        openTaskEditor,
        page,
        pageSize,
        selectedTaskIdSet,
        toggleSelectAllOnPage,
        toggleTaskSelection,
    ]);

    const listTable = useReactTable({
        data: pagedTasks,
        columns: listColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.id,
    });
    const listRows = listTable.getRowModel().rows;
    const listColumnCount = listTable.getVisibleLeafColumns().length || 1;
    const hasMobileQuickControlOverrides = hasSecondaryTaskControls;
    const mobileListQuickControls = view === "list" && isTabletOrMobile ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-3" data-testid="tasks-mobile-quick-controls">
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Quick controls</p>
                    <div className="flex flex-wrap justify-end gap-2">
                        <Badge variant="outline" className="shrink-0">
                            {activeSortLabel}
                        </Badge>
                        {scheduleStatusFilter !== "all" ? (
                            <Badge variant="outline" className="shrink-0">
                                {activeScheduleFilterLabel}
                            </Badge>
                        ) : null}
                        {healthStatusFilter !== "all" ? (
                            <Badge variant="outline" className="shrink-0">
                                {activeHealthFilterLabel}
                            </Badge>
                        ) : null}
                    </div>
                </div>
                {hiddenAdvancedFilterSummary.length > 0 ? (
                    <div
                        className="rounded-md border border-dashed border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground"
                        data-testid="tasks-mobile-hidden-filters-summary"
                    >
                        <span className="font-medium text-foreground">Hidden advanced filters:</span>{" "}
                        {hiddenAdvancedFilterSummary.join(" • ")}
                    </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Sort tasks</Label>
                        <Combobox
                            value={sortOption}
                            onChange={(value) => {
                                if (!value) return;
                                setSortOption(value as TaskListSortOptionValue);
                            }}
                            options={TASK_SORT_OPTIONS}
                            placeholder="Sort tasks"
                            searchPlaceholder="Search sort order..."
                            className="w-full"
                            triggerTestId="tasks-mobile-sort-combobox"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Health</Label>
                        <Combobox
                            value={healthStatusFilter}
                            onChange={setHealthStatusFilter}
                            options={healthStatusFilterOptions}
                            placeholder="Health"
                            searchPlaceholder="Search health..."
                            className="w-full"
                            triggerTestId="tasks-mobile-health-filter-combobox"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Schedule status</Label>
                        <Combobox
                            value={scheduleStatusFilter}
                            onChange={setScheduleStatusFilter}
                            options={scheduleStatusFilterOptions}
                            placeholder="Schedule status"
                            searchPlaceholder="Search schedule status..."
                            className="w-full"
                            triggerTestId="tasks-mobile-schedule-filter-combobox"
                        />
                    </div>
                </div>
                <div className="flex justify-end border-t border-border/70 pt-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-full sm:w-auto"
                        disabled={!hasMobileQuickControlOverrides}
                        onClick={() => resetSecondaryTaskControls()}
                        data-testid="tasks-mobile-quick-controls-reset-button"
                    >
                        Reset quick controls
                    </Button>
                </div>
            </div>
        </div>
    ) : null;
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
                <div className="mb-4 rounded-full bg-muted p-4">
                    <ListTodo className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No tasks found</h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    Get started by creating a new task using the controls above.
                </p>
            </div>
        );

        if (view === "kanban") {
            return (
                <div className="h-[calc(100vh-280px)]">
                    <KanbanProvider<KanbanTaskItem>
                        columns={KANBAN_COLUMNS}
                        data={kanbanTasks}
                        onColumnChange={(taskId, newColumnId) => {
                            inlineUpdateMutation.mutate({
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
                                        {kanbanCountByStatus.get(column.id) ?? 0}
                                    </Badge>
                                </KanbanHeader>
                                <KanbanCards<KanbanTaskItem> id={column.id}>
                                    {(task) => {
                                        const kanbanTask = task;
                                        return (
                                            <KanbanCard<KanbanTaskItem>
                                                key={kanbanTask.id}
                                                item={kanbanTask}
                                                onDoubleClick={(item) => {
                                                    openTaskEditor(item);
                                                }}
                                            >

                                                <div className="font-medium text-sm leading-tight">{kanbanTask.name}</div>
                                                {kanbanTask.description && (
                                                    <div className="text-xs text-muted-foreground line-clamp-2" title={kanbanTask.description}>{kanbanTask.description}</div>
                                                )}

                                                <div className="flex items-center justify-between pt-2">
                                                    {kanbanTask.assigneeId && (
                                                        <div
                                                            className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold"
                                                            title={getAssigneeLabel(kanbanTask.assigneeId)}
                                                        >
                                                            {getAssigneeInitial(kanbanTask.assigneeId)}
                                                        </div>
                                                    )}

                                                    {kanbanTask.dueDate && (
                                                        <div className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                            {format(new Date(kanbanTask.dueDate), "MMM d")}
                                                        </div>
                                                    )}


                                                </div>
                                            </KanbanCard>
                                        );
                                    }}
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
                    // Keep Gantt on full project task graph so drag/dependency operations
                    // are consistent even when list search/status filters are active.
                    tasks={mergedGanttTasks}
                    progress={progress}
                    dependencies={dependencies}
                    pendingChangesCount={ganttPendingCount}
                    isSyncingChanges={ganttIsSyncing}
                    syncError={ganttSyncError}
                    lastSyncedAt={ganttLastSyncedAt}
                    onRetrySyncChanges={retryGanttSync}
                    onUpdateTasks={(updatedTasks: GanttTask[]) => {
                        queueGanttUpdates(updatedTasks);
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
                        const taskToEdit = mergedGanttTasks.find(t => t.id === ganttTask.originalId);
                        if (taskToEdit) {
                            openTaskEditor(taskToEdit);
                        }
                    }}
                />
            );
        }

        // tasks present
        return (
            <div className="space-y-3">
                <div className="space-y-3 lg:hidden">
                    {pagedTasks.map((task, index) => {
                        const taskSnapshot = getTaskScurveSnapshot(task);
                        const actualValue = Math.max(0, Math.min(taskSnapshot.actual, 100));
                        const expectedValue = taskSnapshot.expected === null
                            ? null
                            : Math.max(0, Math.min(taskSnapshot.expected, 100));
                        return (
                            <Card
                                key={task.id}
                                className={cn(
                                    "border-border/70 border-l-4 shadow-none transition-colors hover:bg-muted/20",
                                    getTaskHealthBorderClass(taskSnapshot.health),
                                )}
                                data-testid="tasks-mobile-card"
                            >
                                <CardContent className="space-y-3 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <TaskSelectionCheckbox
                                                checked={selectedTaskIdSet.has(task.id)}
                                                onToggle={(nextChecked) => toggleTaskSelection(task.id, nextChecked)}
                                                label={`Select task ${task.name}`}
                                                testId="tasks-row-select-checkbox"
                                            />
                                            <div className="min-w-0 space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-sm font-semibold leading-tight line-clamp-1" title={task.name}>
                                                        {task.name}
                                                    </p>
                                                    <Badge
                                                        variant="outline"
                                                        className={getTaskStatusTintClass(task.executionStatus ?? task.status)}
                                                    >
                                                        {getTaskStatusLabel(task.executionStatus ?? task.status)}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{getAssigneeLabel(task.assigneeId)}</span>
                                                    <span aria-hidden="true">•</span>
                                                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]">
                                                        {task.id.slice(0, 8)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <TaskActionMenu
                                            task={task}
                                            triggerTestId="tasks-mobile-actions-trigger"
                                            editTestId="tasks-mobile-edit-button"
                                            deleteTestId="tasks-mobile-delete-button"
                                            onEdit={openTaskEditor}
                                            onDelete={(nextTask) => {
                                                setTaskToDelete(nextTask);
                                                setConfirmOpen(true);
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-2" title={getTaskScurveTitle(task)}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                {task.dueDate ? <span>{`Due ${format(new Date(task.dueDate), "MMM d")}`}</span> : null}
                                                {task.dueDate && task.durationDays ? <span aria-hidden="true">•</span> : null}
                                                {task.durationDays ? <span>{`${task.durationDays}d`}</span> : null}
                                                {!task.dueDate && !task.durationDays ? (
                                                    <span className="text-muted-foreground/45">—</span>
                                                ) : null}
                                            </div>
                                            <span className="text-sm font-semibold text-foreground">
                                                {formatTaskPercent(taskSnapshot.actual)}
                                            </span>
                                        </div>
                                        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className={cn("h-full rounded-full transition-[width]", getTaskHealthBarClass(taskSnapshot.health))}
                                                style={{ width: `${actualValue}%` }}
                                            />
                                            {expectedValue !== null ? (
                                                <span
                                                    className="absolute inset-y-[-2px] w-px rounded-full bg-background shadow-[0_0_0_1px_rgba(15,23,42,0.12)]"
                                                    style={{ left: `calc(${expectedValue}% - 1px)` }}
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                                                    getTaskHealthTintClass(taskSnapshot.health),
                                                )}
                                            >
                                                {getTaskHealthLabel(taskSnapshot.health)}
                                            </span>
                                            {task.scheduleStatus && task.scheduleStatus !== "not_specified" ? (
                                                <Badge variant="outline" className={getScheduleStatusToneClass(task.scheduleStatus)}>
                                                    {getScheduleStatusLabel(task.scheduleStatus)}
                                                </Badge>
                                            ) : null}
                                            <span className="text-xs text-muted-foreground">
                                                {taskSnapshot.variance === null
                                                    ? "Awaiting plan"
                                                    : `Variance ${formatTaskVariance(taskSnapshot.variance)}`}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        {task.completedAtIsBackfilled ? (
                                            <Badge variant="outline" title="Completion timestamp reconstructed by backend for legacy data">
                                                Backfilled
                                            </Badge>
                                        ) : null}
                                        <span>#{((page - 1) * pageSize) + index + 1}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                <div className="hidden lg:block overflow-x-auto">
                    <Table className="table-fixed">
                        <TableHeader className="[&_tr]:border-0">
                            {listTable.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id} className="border-0 bg-transparent hover:bg-transparent">
                                    {headerGroup.headers.map((header) => (
                                        <TableHead
                                            key={header.id}
                                            className={cn(
                                                "border-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                                                getTaskListWidthClass(header.column.id, isLaptopDensity),
                                            )}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {listRows.length === 0 && (
                                <TableRow key="no-tasks" className="border-0 hover:bg-transparent">
                                    <TableCell colSpan={listColumnCount} className="h-24 text-center">
                                        No tasks found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {listRows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    onDoubleClick={() => openTaskEditor(row.original)}
                                    className="group border-0 bg-transparent transition-colors odd:bg-muted/[0.12] hover:bg-muted/24"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}
                                            className={cn(
                                                "border-0 px-3 py-2 align-middle",
                                                getTaskListWidthClass(cell.column.id, isLaptopDensity),
                                            )}
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <DataTablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    setPage={setPage}
                    setPageSize={setPageSize}
                    totalItems={totalFilteredCount}
                />
            </div>
        );
    })();

    const isRateLimited = useNetworkStore((state) => state.isRateLimited);

    return (
        <div className="space-y-3" data-testid="tasks-page">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
                {selectedProject ? (
                    <Badge variant="outline">
                        {totalFilteredCount} item{totalFilteredCount === 1 ? "" : "s"} in view
                    </Badge>
                ) : null}
            </div>

            <Card className="overflow-hidden border-border/70 shadow-sm">
                <CardContent className="space-y-2.5 p-3 sm:p-4">
                    <section className="space-y-3" data-testid="tasks-page-context-card">
                        <div
                            className="flex flex-col gap-3 xl:flex-row xl:items-center"
                            data-testid="tasks-primary-toolbar"
                        >
                            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto xl:shrink-0">
                                <Combobox
                                    options={projects?.map((p) => ({ label: p.name, value: p.id })) ?? []}
                                    value={selectedProject}
                                    onChange={setSelectedProject}
                                    className="w-full sm:w-64"
                                    placeholder="Select project"
                                    searchPlaceholder="Search projects..."
                                    triggerTestId="tasks-project-combobox"
                                />
                            </div>

                            <div className="hidden h-8 w-px shrink-0 bg-border/70 xl:block" aria-hidden="true" />

                            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="relative min-w-0 flex-1">
                                    <Label htmlFor="tasks-search-input" className="sr-only">Search tasks</Label>
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="tasks-search-input"
                                        placeholder="Search tasks"
                                        className="h-10 pl-9"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        maxLength={API_SEARCH_QUERY_MAX_LENGTH}
                                        data-testid="tasks-search-input"
                                    />
                                </div>
                                <div className="w-full sm:w-[190px]">
                                    <Label className="sr-only">Status</Label>
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
                                        className="w-full"
                                        triggerTestId="tasks-filter-status-combobox"
                                    />
                                </div>
                            </div>

                            <div className="hidden h-8 w-px shrink-0 bg-border/70 xl:block" aria-hidden="true" />

                            <div className="flex flex-wrap items-center justify-between gap-2 xl:ml-auto xl:justify-end" data-testid="tasks-team-summary">
                                {selectedProject ? (
                                    <>
                                        <TooltipProvider delayDuration={120}>
                                            <Link
                                                to={`/projects/${selectedProject}/settings?tab=members`}
                                                className="flex items-center"
                                                aria-label={`Open members for ${currentProject?.name ?? "this project"}`}
                                                title={`${teamMembersForSummary.length} member${teamMembersForSummary.length === 1 ? "" : "s"}`}
                                            >
                                                {visibleTeamMembers.length > 0 ? (
                                                    visibleTeamMembers.map((member, index) => (
                                                        <Tooltip key={member.id}>
                                                            <TooltipTrigger asChild>
                                                                <div
                                                                    className={cn("relative", index > 0 ? "-ml-2" : "")}
                                                                    aria-label={member.label}
                                                                    data-testid="tasks-team-avatar"
                                                                >
                                                                    <Avatar
                                                                        className={cn(
                                                                            "transition-transform hover:-translate-y-0.5",
                                                                            member.presence?.status === "online"
                                                                                ? "ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-background"
                                                                                : undefined,
                                                                        )}
                                                                    >
                                                                        <AvatarFallback>{member.initials}</AvatarFallback>
                                                                    </Avatar>
                                                                    <span
                                                                        className={cn(
                                                                            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-background",
                                                                            member.presence?.status === "online"
                                                                                ? "bg-emerald-500"
                                                                                : "bg-muted-foreground/40",
                                                                        )}
                                                                        aria-hidden="true"
                                                                    />
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <div className="space-y-1">
                                                                    <p className="font-medium">{member.label}</p>
                                                                    <p className="text-[11px] text-muted-foreground">{member.email}</p>
                                                                    <p className="text-[11px] text-muted-foreground">
                                                                        {getPresenceStatusLabel(member.presence)}
                                                                    </p>
                                                                    {member.presence?.route && getRealtimeRouteLabel(member.presence.route) ? (
                                                                        <p className="text-[11px] text-muted-foreground">
                                                                            Working in {getRealtimeRouteLabel(member.presence.route)}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    ))
                                                ) : (
                                                    <Avatar
                                                        className="border-dashed bg-muted/40 text-muted-foreground"
                                                        data-testid="tasks-team-avatar-empty"
                                                    >
                                                        <AvatarFallback className="bg-muted/40 text-muted-foreground">0</AvatarFallback>
                                                    </Avatar>
                                                )}
                                                {hiddenTeamMemberCount > 0 ? (
                                                    <div
                                                        className="-ml-2 flex h-9 min-w-9 items-center justify-center rounded-full border border-border/70 bg-background px-2 text-xs font-semibold text-foreground ring-2 ring-background"
                                                        data-testid="tasks-team-avatar-overflow"
                                                        title={`${hiddenTeamMemberCount} more team member${hiddenTeamMemberCount === 1 ? "" : "s"}`}
                                                    >
                                                        +{hiddenTeamMemberCount}
                                                    </div>
                                                ) : null}
                                            </Link>
                                        </TooltipProvider>
                                        <Badge variant={onlineTeamMemberCount > 0 ? "success" : "outline"}>
                                            {onlineTeamMemberCount} online
                                        </Badge>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Select a project to load the team.</span>
                                )}

                                <Button
                                    type="button"
                                    variant={selectedProjectRemoteChange ? "default" : "secondary"}
                                    className={cn(
                                        "relative h-10 px-3",
                                        selectedProjectRemoteChange
                                            ? "ring-2 ring-amber-400/70 ring-offset-2 ring-offset-background"
                                            : undefined,
                                    )}
                                    onClick={() => {
                                        void refreshTasks();
                                    }}
                                    disabled={!selectedProject || isRefetching || isRateLimited}
                                    title={selectedProjectRemoteChange ? selectedProjectRemoteChange.summary : undefined}
                                    data-testid="tasks-refresh-button"
                                >
                                    {selectedProjectRemoteChange ? (
                                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                                    ) : null}
                                    {isRateLimited
                                        ? "Cooling down..."
                                        : (isRefetching ? "Refreshing…" : (selectedProjectRemoteChange ? "Refresh updates" : "Refresh"))}
                                </Button>

                                <Dialog open={createOpen} onOpenChange={handleCreateDialogOpenChange}>
                                    <Button
                                        type="button"
                                        className="h-10 gap-2"
                                        data-testid="tasks-new-button"
                                        onClick={() => handleCreateDialogOpenChange(true)}
                                    >
                                        <Plus className="h-4 w-4" />
                                        <span>New task</span>
                                    </Button>
                        <AppDialogContent
                            className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
                            title="Create task"
                            description="Create a new task for your project with manual or weighted progress tracking."
                        >
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
                                        const normalizedDescription = parsed.data.description?.trim();

                                        createMutation.mutateAsync({
                                            name: parsed.data.title,
                                            description: normalizedDescription || undefined,
                                            assigneeId: parsed.data.assigneeId || "",
                                            dueDate: dueDate,
                                            startDate: startDate,
                                            endDate: finalEndDate,
                                            status: (parsed.data.status ?? "todo") as TaskStatus,
                                            progress: createProgressMethod === "manual_percent_legacy"
                                                ? (parsed.data.progress || 0)
                                                : undefined,
                                            progressMethod: createProgressMethod,
                                        })
                                            .then(async (createdTask) => {
                                                if (createProgressMethod === "weighted_components" && createWeightedStarterTemplateEnabled) {
                                                    try {
                                                        await replaceTaskProgressComponentsForCreateMutation.mutateAsync({
                                                            taskId: createdTask.id,
                                                            payload: {
                                                                components: buildWeightedStarterComponents({
                                                                    startDate,
                                                                    endDate: finalEndDate,
                                                                }),
                                                            },
                                                        });
                                                    } catch {
                                                        toast.warning("Task created, but starter weighted components could not be added. You can add them from Edit task.");
                                                    }
                                                }
                                                const activeSessionId = timeToTaskSessionIdRef.current;
                                                if (activeSessionId) {
                                                    completeTimeToTaskSession(activeSessionId, {
                                                        projectId: targetProjectId,
                                                        view,
                                                    });
                                                }
                                                beginTimeToTaskSession();
                                                refreshTimeToTaskSummary();
                                                handleCreateDialogOpenChange(false);
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
                                                        data-testid="tasks-create-title-input"
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

                                    <FormField
                                        control={createForm.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Description</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        {...field}
                                                        value={field.value ?? ""}
                                                        rows={4}
                                                        placeholder="Add context, acceptance criteria, or notes (optional)"
                                                        data-testid="tasks-create-description-input"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={createForm.control}
                                        name="assigneeId"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel>Assignee</FormLabel>
                                                <Combobox
                                                    options={assigneeOptions}
                                                    value={field.value ?? ""}
                                                    onChange={field.onChange}
                                                    placeholder="Select assignee"
                                                    searchPlaceholder="Search team member..."
                                                    className="w-full"
                                                    triggerTestId="tasks-create-assignee-combobox"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    {assignableUsers.length > 0
                                                        ? "Choose a current project member or leave the task unassigned."
                                                        : "No project members are available yet. Add members from Project Settings first."}
                                                </p>
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
                                                    options={buildDurationOptions(createForm.watch("plan"))}
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

                                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4" data-testid="tasks-create-progress-method-section">
                                        <div className="space-y-1">
                                            <Label>Progress tracking</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Manual works best for quick tasks. Weighted is better when completion depends on multiple deliverables.
                                            </p>
                                        </div>
                                        <ToggleGroup
                                            type="single"
                                            value={createProgressMethod}
                                            onValueChange={(value) => {
                                                if (value !== "manual_percent_legacy" && value !== "weighted_components") {
                                                    return;
                                                }
                                                setCreateProgressMethod(value);
                                                if (value === "weighted_components") {
                                                    createForm.setValue("progress", 0);
                                                }
                                            }}
                                            className="flex flex-wrap justify-start gap-2"
                                            data-testid="tasks-create-progress-method-toggle"
                                        >
                                            <ToggleGroupItem
                                                value="manual_percent_legacy"
                                                data-testid="tasks-create-progress-method-manual"
                                            >
                                                Manual percent
                                            </ToggleGroupItem>
                                            <ToggleGroupItem
                                                value="weighted_components"
                                                data-testid="tasks-create-progress-method-weighted"
                                            >
                                                Weighted components
                                            </ToggleGroupItem>
                                        </ToggleGroup>

                                        {createProgressMethod === "manual_percent_legacy" ? (
                                            <FormField
                                                control={createForm.control}
                                                name="progress"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="flex items-center justify-between text-muted-foreground">
                                                            <span>Starting progress</span>
                                                            <span className="rounded bg-primary/10 px-2 py-0.5 text-sm font-mono">
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
                                                                data-testid="tasks-create-progress-slider"
                                                            />
                                                        </FormControl>
                                                        <p className="text-xs text-muted-foreground">
                                                            Use this for simple legacy/manual tasks where one percentage is enough.
                                                        </p>
                                                    </FormItem>
                                                )}
                                            />
                                        ) : (
                                            <div className="space-y-3 rounded-md border border-dashed border-border/70 bg-background/80 p-3 text-sm text-muted-foreground">
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        checked={createWeightedStarterTemplateEnabled}
                                                        onCheckedChange={(checked) => setCreateWeightedStarterTemplateEnabled(checked === true)}
                                                        className="mt-0.5"
                                                        data-testid="tasks-create-weighted-template-checkbox"
                                                        aria-label="Create starter weighted components"
                                                    />
                                                    <div className="space-y-1">
                                                        <p className="font-medium text-foreground">Create starter weighted components</p>
                                                        <p>
                                                            Seed a simple three-step template so the task is usable immediately after creation.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div
                                                    className="rounded-md border border-border/60 bg-muted/30 p-3"
                                                    data-testid="tasks-create-weighted-template-preview"
                                                >
                                                    <div className="grid gap-2 sm:grid-cols-3">
                                                        <div className="rounded border border-border/50 bg-background/80 p-2">
                                                            <p className="text-xs font-semibold text-foreground">Planning ready</p>
                                                            <p className="text-[11px]">20% weight</p>
                                                        </div>
                                                        <div className="rounded border border-border/50 bg-background/80 p-2">
                                                            <p className="text-xs font-semibold text-foreground">Execution complete</p>
                                                            <p className="text-[11px]">60% weight</p>
                                                        </div>
                                                        <div className="rounded border border-border/50 bg-background/80 p-2">
                                                            <p className="text-xs font-semibold text-foreground">Review and sign-off</p>
                                                            <p className="text-[11px]">20% weight</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p data-testid="tasks-create-weighted-hint">
                                                    {createWeightedStarterTemplateEnabled
                                                        ? "You can fine-tune weights, milestones, and dates from Edit task after creation."
                                                        : "This task will start without components. Open Edit task after creation to define its weighted progress structure."}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end">
                                        <Button type="button" variant="ghost" onClick={() => handleCreateDialogOpenChange(false)}>Cancel</Button>
                                        <Button
                                            type="submit"
                                            disabled={createForm.formState.isSubmitting}
                                            data-testid="tasks-create-submit-button"
                                        >
                                            {createForm.formState.isSubmitting ? "Creating…" : "Create"}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                            <DialogFooter />
                        </AppDialogContent>
                    </Dialog>
                            </div>
                        </div>
                    </section>
                    <section className="border-t border-border/70 pt-2" data-testid="tasks-page-primary-actions-card">
                        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="tasks-toolbar-summary-badges">
                                {visibleTaskScopeSummary.map((item) => (
                                    <Badge key={item} variant="outline">{item}</Badge>
                                ))}
                                {activeAdvancedFilterCount > 0 ? (
                                    <Badge variant="outline">Advanced: {activeAdvancedFilterCount}</Badge>
                                ) : null}
                                {hiddenAdvancedFilterSummary.length > 0 ? (
                                    <div
                                        className="min-w-0 truncate rounded-full border border-dashed border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground"
                                        data-testid="tasks-toolbar-hidden-filters-summary"
                                        title={hiddenAdvancedFilterSummary.join(" • ")}
                                    >
                                        {hiddenAdvancedFilterSummary.join(" • ")}
                                    </div>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {view === "list" ? (
                                    <div className="hidden lg:block">
                                        <Combobox
                                            value={sortOption}
                                            onChange={(value) => {
                                                if (!value) return;
                                                setSortOption(value as TaskListSortOptionValue);
                                            }}
                                            options={TASK_SORT_OPTIONS}
                                            placeholder="Sort tasks"
                                            searchPlaceholder="Search sort order..."
                                            className="w-full lg:w-[220px]"
                                            triggerTestId="tasks-sort-combobox"
                                        />
                                    </div>
                                ) : null}
                                <Popover open={isAdvancedFiltersOpen} onOpenChange={setIsAdvancedFiltersOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant={hasAdvancedFilters || view !== "list" ? "secondary" : "outline"}
                                            className="h-9 w-full justify-between gap-2 sm:w-auto"
                                            data-testid="tasks-advanced-filters-toggle"
                                        >
                                            <span className="flex items-center gap-2">
                                                <SlidersHorizontal className="h-4 w-4" />
                                                Advanced
                                            </span>
                                            {activeAdvancedFilterCount > 0 ? (
                                                <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
                                                    {activeAdvancedFilterCount}
                                                </Badge>
                                            ) : null}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        align="end"
                                        className="w-[min(94vw,760px)] space-y-5 p-4"
                                        data-testid="tasks-advanced-filters-panel"
                                    >
                                        <div className="space-y-3">
                                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                View mode
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    variant={view === "list" ? "default" : "outline"}
                                                    onClick={() => {
                                                        setView("list");
                                                        setIsAdvancedFiltersOpen(false);
                                                    }}
                                                    className="h-9"
                                                    data-testid="tasks-view-list-button"
                                                >
                                                    <List className="mr-2 h-4 w-4" />
                                                    List
                                                </Button>
                                                <Button
                                                    variant={view === "kanban" ? "default" : "outline"}
                                                    onClick={() => {
                                                        setView("kanban");
                                                        setIsAdvancedFiltersOpen(false);
                                                    }}
                                                    className="h-9"
                                                    data-testid="tasks-view-board-button"
                                                >
                                                    <Kanban className="mr-2 h-4 w-4" />
                                                    Board
                                                </Button>
                                                <Button
                                                    variant={view === "gantt" ? "default" : "outline"}
                                                    onClick={() => {
                                                        setView("gantt");
                                                        setIsAdvancedFiltersOpen(false);
                                                    }}
                                                    className="h-9"
                                                    data-testid="tasks-view-gantt-button"
                                                >
                                                    <CalendarRange className="mr-2 h-4 w-4" />
                                                    Gantt
                                                </Button>
                                            </div>
                                            {view === "list" ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-9"
                                                    onClick={() => toggleSelectAllFiltered(!allFilteredSelected)}
                                                    disabled={pagedTasks.length === 0}
                                                    data-testid="tasks-select-all-filtered-button"
                                                >
                                                    {allFilteredSelected ? "Unselect page" : `Select page (${pagedTasks.length})`}
                                                </Button>
                                            ) : null}
                                        </div>
                                        <div className="h-px bg-border" />
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Assignee</Label>
                                                    <Combobox
                                                        value={assigneeFilter}
                                                        onChange={setAssigneeFilter}
                                                        options={assigneeFilterOptions}
                                                        placeholder="Assignee"
                                                        searchPlaceholder="Search assignee..."
                                                        className="w-full"
                                                        triggerTestId="tasks-filter-assignee-combobox"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Schedule status</Label>
                                                    <Combobox
                                                        value={scheduleStatusFilter}
                                                        onChange={setScheduleStatusFilter}
                                                        options={scheduleStatusFilterOptions}
                                                        placeholder="Schedule status"
                                                        searchPlaceholder="Search schedule status..."
                                                        className="w-full"
                                                        triggerTestId="tasks-filter-schedule-status-combobox"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Health</Label>
                                                    <Combobox
                                                        value={healthStatusFilter}
                                                        onChange={setHealthStatusFilter}
                                                        options={healthStatusFilterOptions}
                                                        placeholder="Health"
                                                        searchPlaceholder="Search health..."
                                                        className="w-full"
                                                        triggerTestId="tasks-filter-health-status-combobox"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Start from</Label>
                                                    <Input
                                                        type="date"
                                                        value={startFromFilter}
                                                        onChange={(event) => setStartFromFilter(event.target.value)}
                                                        className="h-10"
                                                        data-testid="tasks-filter-start-from-input"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Start to</Label>
                                                    <Input
                                                        type="date"
                                                        value={startToFilter}
                                                        onChange={(event) => setStartToFilter(event.target.value)}
                                                        className="h-10"
                                                        data-testid="tasks-filter-start-to-input"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Due from</Label>
                                                    <Input
                                                        type="date"
                                                        value={dueFromFilter}
                                                        onChange={(event) => setDueFromFilter(event.target.value)}
                                                        className="h-10"
                                                        data-testid="tasks-filter-due-from-input"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">Due to</Label>
                                                    <Input
                                                        type="date"
                                                        value={dueToFilter}
                                                        onChange={(event) => setDueToFilter(event.target.value)}
                                                        className="h-10"
                                                        data-testid="tasks-filter-due-to-input"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="h-9"
                                                    onClick={() => resetSecondaryTaskControls({ closeAdvanced: true })}
                                                    disabled={!hasSecondaryTaskControls}
                                                    data-testid="tasks-clear-advanced-filters-button"
                                                >
                                                    Reset filters & sort
                                                </Button>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-1.5 border-t border-border/70 pt-1.5" data-testid="tasks-secondary-insights-card">
                        <div className="flex flex-col gap-1.5 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0 flex-1 space-y-1.5" data-testid="tasks-health-summary-strip">
                                <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <Badge
                                            variant={healthSummaryExceptionCount > 0 ? "warning" : "outline"}
                                            className={cn(
                                                "shrink-0 rounded-full",
                                                isHealthSummaryAllClear
                                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                    : undefined,
                                            )}
                                        >
                                            {isHealthSummaryAllClear ? "All clear" : `${healthSummaryExceptionCount} attention`}
                                        </Badge>
                                        <div className="flex h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
                                            {healthSummaryLegendItems.map((item) => (
                                                    <div
                                                        key={item.healthStatus}
                                                        className={cn(getTaskHealthBarClass(item.healthStatus))}
                                                        style={{
                                                            width: `${healthSummaryTotalCount === 0 ? 0 : (item.count / healthSummaryTotalCount) * 100}%`,
                                                        }}
                                                        title={`${item.label}: ${item.count}`}
                                                    />
                                                ))}
                                        </div>
                                        {healthSummaryLegendItems.length > 0 ? (
                                            <TooltipProvider delayDuration={120}>
                                                <div className="hidden shrink-0 items-center gap-1 sm:flex" data-testid="tasks-health-summary-legend">
                                                    {healthSummaryLegendItems.map((item) => (
                                                        <Tooltip key={item.healthStatus}>
                                                            <TooltipTrigger asChild>
                                                                <span
                                                                    className={cn("h-2 w-2 rounded-full", getTaskHealthBarClass(item.healthStatus))}
                                                                    aria-label={`${item.label}: ${item.count}`}
                                                                />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                {item.label}: {item.count}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    ))}
                                                </div>
                                            </TooltipProvider>
                                        ) : null}
                                        <span className="hidden text-[11px] text-muted-foreground xl:inline" data-testid="tasks-health-summary-scope">
                                            {healthSummaryScopeLabel}
                                        </span>
                                    </div>
                                    {isHealthSummaryAllClear ? null : (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {visibleHealthSummaryItems.map((item) => (
                                                <Button
                                                    key={item.healthStatus}
                                                    type="button"
                                                    variant={item.active ? "secondary" : "outline"}
                                                    size="sm"
                                                    className="h-6 gap-1.5 rounded-full px-2 text-[11px]"
                                                    onClick={() => {
                                                        setHealthStatusFilter((current) => (
                                                            current === item.healthStatus ? "all" : item.healthStatus
                                                        ));
                                                    }}
                                                    data-testid="tasks-health-summary-chip"
                                                >
                                                    <span>{item.label}</span>
                                                    <span>{item.count}</span>
                                                </Button>
                                            ))}
                                            {healthStatusFilter !== "all" ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 rounded-full px-2 text-[11px]"
                                                    onClick={() => setHealthStatusFilter("all")}
                                                    data-testid="tasks-health-summary-clear-button"
                                                >
                                                    Clear
                                                </Button>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-end" data-testid="tasks-time-to-task-summary">
                                <Popover open={showTimeToTaskInsights} onOpenChange={setShowTimeToTaskInsights}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant={showTimeToTaskInsights ? "secondary" : "ghost"}
                                            size="sm"
                                            className="h-8 gap-2 px-3"
                                            data-testid="tasks-time-to-task-toggle-button"
                                        >
                                            <span className="font-medium text-foreground">Telemetry</span>
                                            <span className="text-muted-foreground">P50 {formatDurationMs(timeToTaskSummary.p50Ms)}</span>
                                            <span className="hidden text-muted-foreground sm:inline">Last {formatDurationMs(timeToTaskSummary.lastMs)}</span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-[min(92vw,320px)] space-y-3 p-3">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-foreground">Time to task</p>
                                            <p className="text-xs text-muted-foreground">
                                                Open when you want telemetry detail, then get back to the task list.
                                            </p>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <Badge variant="outline" className="justify-start">P50 {formatDurationMs(timeToTaskSummary.p50Ms)}</Badge>
                                            <Badge variant="outline" className="justify-start">Last {formatDurationMs(timeToTaskSummary.lastMs)}</Badge>
                                            <Badge variant="outline" className="justify-start">
                                                Intent completion {Math.round(timeToTaskSummary.intentCompletionRate * 100)}%
                                            </Badge>
                                            <Badge variant="outline" className="justify-start">Samples {timeToTaskSummary.intentSampleCount}</Badge>
                                            <Badge variant="outline" className="justify-start">Passive exits {timeToTaskSummary.passiveExitCount}</Badge>
                                        </div>
                                        <div className="flex justify-end">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2"
                                                onClick={() => {
                                                    clearTimeToTaskRecords(currentUserId);
                                                    if (timeToTaskSessionIdRef.current) {
                                                        abandonTimeToTaskSession(timeToTaskSessionIdRef.current, { reason: "metrics-reset" });
                                                    }
                                                    beginTimeToTaskSession();
                                                    refreshTimeToTaskSummary();
                                                }}
                                                data-testid="tasks-time-to-task-reset-button"
                                                disabled={timeToTaskSummary.trackedSessionCount === 0}
                                            >
                                                Reset
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <span className="sr-only">
                                    Intent completion {Math.round(timeToTaskSummary.intentCompletionRate * 100)}%. Passive exits {timeToTaskSummary.passiveExitCount}.
                                </span>
                            </div>
                        </div>
                        <div className="lg:hidden">
                            {mobileListQuickControls}
                        </div>
                    </section>
                </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>{currentProject?.name ?? "Execution grid"}</CardTitle>
                        <Badge variant="outline">{currentViewLabel} view</Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                    {view === "list" && selectedTaskIds.length > 0 ? (
                        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm text-foreground">
                                {selectedTaskIds.length} task{selectedTaskIds.length === 1 ? "" : "s"} selected
                                {selectionScopeLabel}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Popover open={isSelectionActionsOpen} onOpenChange={setIsSelectionActionsOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10"
                                            data-testid="tasks-selection-actions-toggle"
                                        >
                                            <ListTodo className="mr-2 h-4 w-4" />
                                            Selection actions
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        align="end"
                                        className="w-[min(95vw,860px)] space-y-4 p-4"
                                        data-testid="tasks-selection-actions-panel"
                                    >
                                        <p className="text-xs text-muted-foreground">
                                            Apply bulk updates to selected tasks in one place.
                                        </p>
                                        <div className="grid gap-4 xl:grid-cols-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Status</Label>
                                                <Combobox
                                                    value={bulkStatus}
                                                    onChange={setBulkStatus}
                                                    options={[
                                                        { value: "todo", label: "To Do" },
                                                        { value: "in_progress", label: "In Progress" },
                                                        { value: "blocked", label: "Blocked" },
                                                        { value: "done", label: "Done" },
                                                    ]}
                                                    placeholder="Bulk status"
                                                    searchPlaceholder="Search status..."
                                                    className="w-full"
                                                    triggerTestId="tasks-bulk-status-combobox"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Assignee</Label>
                                                <Combobox
                                                    value={bulkAssignee}
                                                    onChange={setBulkAssignee}
                                                    options={assigneeOptions}
                                                    placeholder="Bulk assignee"
                                                    searchPlaceholder="Search assignee..."
                                                    className="w-full"
                                                    triggerTestId="tasks-bulk-assignee-combobox"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Progress</Label>
                                                {selectedWeightedTaskCount > 0 ? (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Weighted tasks use component-based progress. Direct progress changes will skip {selectedWeightedTaskCount} selected task{selectedWeightedTaskCount === 1 ? "" : "s"}.
                                                    </p>
                                                ) : null}
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step={5}
                                                        value={bulkProgress}
                                                        onChange={(event) => {
                                                            const parsed = Number(event.target.value);
                                                            setBulkProgress(Number.isFinite(parsed) ? clampProgress(parsed) : 0);
                                                            setBulkProgressTouched(true);
                                                        }}
                                                        className="h-10 w-24"
                                                        data-testid="tasks-bulk-progress-input"
                                                        aria-label="Bulk progress value"
                                                        disabled={isBulkBusy || !canBulkEditProgress}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="h-10 px-3"
                                                        onClick={() => {
                                                            setBulkProgress((current) => clampProgress(current - 10));
                                                            setBulkProgressTouched(true);
                                                        }}
                                                        disabled={isBulkBusy || !bulkProgressTouched || !canBulkEditProgress}
                                                    >
                                                        -10
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="h-10 px-3"
                                                        onClick={() => {
                                                            setBulkProgress((current) => clampProgress(current + 10));
                                                            setBulkProgressTouched(true);
                                                        }}
                                                        disabled={isBulkBusy || !canBulkEditProgress}
                                                    >
                                                        +10
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-xs text-muted-foreground">
                                                Select one or more fields, then apply once for all selected tasks.
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={resetBulkDraft}
                                                    disabled={!hasBulkDraftChanges || isBulkBusy}
                                                    data-testid="tasks-bulk-reset-fields-button"
                                                >
                                                    Reset fields
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => {
                                                        void handleBulkApplyChanges();
                                                    }}
                                                    disabled={!hasBulkDraftChanges || isBulkBusy}
                                                    data-testid="tasks-bulk-apply-button"
                                                >
                                                    {isBulkApplying ? "Applying..." : "Apply changes"}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <Button
                                                type="button"
                                                variant="destructive-outline"
                                                onClick={() => {
                                                    requestBulkDelete();
                                                }}
                                                disabled={isBulkBusy}
                                                data-testid="tasks-bulk-delete-button"
                                            >
                                                {isBulkDeleting ? "Deleting..." : "Delete selected"}
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setSelectedTaskIds([]);
                                        resetBulkDraft();
                                        setIsSelectionActionsOpen(false);
                                    }}
                                    data-testid="tasks-bulk-clear-selection-button"
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>
                    ) : null}
                    {content}
                </CardContent>
            </Card>
            {/* Edit dialog */}
            <Dialog
                open={Boolean(editing)}
                onOpenChange={(open) => {
                    if (!open && editUpdateMutation.status === "pending") return;
                    if (!open) {
                        setEditing(null);
                        resetWorkLogDraft(resourceRoleOptions[0]?.value);
                    }
                }}
            >
                <AppDialogContent
                    className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
                    title="Edit task"
                    description="Update the task details and save your changes."
                >
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
                                const normalizedDescription = parsed.data.description?.trim();
                                if (!normalizedDescription) {
                                    editForm.setError("description", {
                                        type: "manual",
                                        message: "Description is required when updating a task.",
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

                                editUpdateMutation.mutateAsync({
                                    id: editing.id,
                                    projectId: selectedProject,
                                    payload: {
                                        name: parsed.data.title,
                                        description: normalizedDescription,
                                        assigneeId: parsed.data.assigneeId || "",
                                        startDate,
                                        endDate: finalEndDate,
                                        ...(isWeightedProgressTask(editing) ? {} : { progress: parsed.data.progress }),
                                        durationDays: parsed.data.plan
                                    }
                                })

                                    .then(() => {
                                        setEditing(null);
                                        resetWorkLogDraft(resourceRoleOptions[0]?.value);
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
                                            data-testid="tasks-edit-title-input"
                                            className={editForm.formState.errors.title ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0" : ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={editForm.control} name="description" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            value={field.value ?? ""}
                                            rows={4}
                                            placeholder="Describe the task objective, constraints, and expected result"
                                            data-testid="tasks-edit-description-input"
                                            className={editForm.formState.errors.description ? "border-2 border-destructive bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-0" : ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField
                                control={editForm.control}
                                name="assigneeId"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Assignee</FormLabel>
                                        <Combobox
                                            options={assigneeOptions}
                                            value={field.value ?? ""}
                                            onChange={field.onChange}
                                            placeholder="Select assignee"
                                            searchPlaceholder="Search team member..."
                                            className="w-full"
                                            triggerTestId="tasks-edit-assignee-combobox"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {assignableUsers.length > 0
                                                ? "Choose a current project member or leave the task unassigned."
                                                : "No project members are available yet. Add members from Project Settings first."}
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Schedule Mode Toggle - Horizontal Layout */}
                            <div className="space-y-2">
                                <Label>Duration</Label>
                                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
                                            className="w-full sm:w-32"
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
                                            options={buildDurationOptions(editForm.watch("plan"))}
                                            placeholder="Duration"
                                            searchPlaceholder="Search days..."
                                            className="w-full sm:w-36"
                                        />
                                    )}
                                </div>

                                {/* Date Range Inputs - Show below when range mode */}
                                {editMode === 'range' && (
                                    <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
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

                            {isEditingWeightedTask ? (
                                <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/20 p-3" data-testid="tasks-weighted-progress-section">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold">Weighted components</p>
                                            <Badge variant="outline">{getProgressMethodLabel(editing?.progressMethod)}</Badge>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                            <Badge variant="outline">Actual {formatTaskPercent(editingTaskScurve?.actual ?? null)}</Badge>
                                            <Badge variant="outline">Plan {formatTaskPercent(editingTaskScurve?.expected ?? null)}</Badge>
                                            <Badge variant="outline">Delta {formatTaskVariance(editingTaskScurve?.variance ?? null)}</Badge>
                                            <Badge variant={getTaskHealthVariant(editingTaskScurve?.health ?? "needs_plan")}>
                                                {getTaskHealthLabel(editingTaskScurve?.health ?? "needs_plan")}
                                            </Badge>
                                        </div>
                                    </div>

                                    {taskProgressComponentsQuery.isLoading ? (
                                        <div className="space-y-2">
                                            <Skeleton className="h-16 w-full" />
                                            <Skeleton className="h-16 w-full" />
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {progressComponentDrafts.map((draft, index) => (
                                                <div
                                                    key={draft.id ?? `component-${index}`}
                                                    className="rounded-lg border border-border/70 bg-background/80 p-2.5"
                                                    data-testid="tasks-progress-component-row"
                                                >
                                                    <div className="mb-2 flex items-center justify-between gap-3">
                                                        <p className="text-xs font-medium text-muted-foreground">
                                                            Component {index + 1}
                                                        </p>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            aria-label={`Remove component ${index + 1}`}
                                                            onClick={() => removeProgressComponentDraft(index)}
                                                            disabled={isProgressComponentsSaving}
                                                            data-testid="tasks-progress-component-remove-button"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>

                                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,0.9fr)_96px_108px_minmax(0,1.05fr)_minmax(0,1.05fr)]">
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Name</Label>
                                                            <Input
                                                                value={draft.name}
                                                                onChange={(event) => updateProgressComponentDraft(index, "name", event.target.value)}
                                                                placeholder="Requirements signed off"
                                                                data-testid="tasks-progress-component-name-input"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Type</Label>
                                                            <Input
                                                                value={draft.componentType}
                                                                onChange={(event) => updateProgressComponentDraft(index, "componentType", event.target.value)}
                                                                placeholder="milestone"
                                                                data-testid="tasks-progress-component-type-input"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Weight</Label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="0.1"
                                                                value={draft.weight}
                                                                onChange={(event) => updateProgressComponentDraft(index, "weight", event.target.value)}
                                                                data-testid="tasks-progress-component-weight-input"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Done</Label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                step="1"
                                                                value={draft.completionPct}
                                                                onChange={(event) => updateProgressComponentDraft(index, "completionPct", event.target.value)}
                                                                data-testid="tasks-progress-component-completion-input"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Planned</Label>
                                                            <Input
                                                                type="datetime-local"
                                                                value={draft.plannedAt}
                                                                onChange={(event) => updateProgressComponentDraft(index, "plannedAt", event.target.value)}
                                                                data-testid="tasks-progress-component-planned-at-input"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[11px] text-muted-foreground">Completed</Label>
                                                            <Input
                                                                type="datetime-local"
                                                                value={draft.completedAt}
                                                                onChange={(event) => updateProgressComponentDraft(index, "completedAt", event.target.value)}
                                                                data-testid="tasks-progress-component-completed-at-input"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            <div className="flex flex-col gap-2 border-t border-border/70 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
                                                <Badge
                                                    variant={Math.abs(totalProgressComponentWeight - 100) < 0.01 ? "success" : "warning"}
                                                    className="w-fit"
                                                >
                                                    Total weight {totalProgressComponentWeight.toFixed(1)}%
                                                </Badge>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={addProgressComponentDraft}
                                                        disabled={isProgressComponentsSaving}
                                                        data-testid="tasks-progress-component-add-button"
                                                    >
                                                        Add component
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        onClick={() => {
                                                            void handleSaveProgressComponents();
                                                        }}
                                                        disabled={isProgressComponentsSaving}
                                                        data-testid="tasks-progress-components-save-button"
                                                    >
                                                        {isProgressComponentsSaving ? "Saving..." : "Save components"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <FormField control={editForm.control} name="progress" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center justify-between text-muted-foreground">
                                            <span>Progress (Legacy manual)</span>
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
                            )}

                            <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/20 p-3" data-testid="tasks-work-log-section">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <p className="text-sm font-semibold">Work logs</p>
                                    <Badge variant="outline">
                                        {draftWorkLogEstimatedCost !== null && selectedWorkLogRole
                                            ? `Est. ${formatCurrencyAmount(draftWorkLogEstimatedCost, selectedWorkLogRole.currency)}`
                                            : "Cost pending"}
                                    </Badge>
                                </div>

                                <div className="grid gap-2.5 lg:grid-cols-[126px_88px_minmax(0,1fr)_minmax(0,1.35fr)_auto] lg:items-end">
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-muted-foreground">Date</Label>
                                        <Input
                                            type="date"
                                            value={workLogDate}
                                            onChange={(event) => setWorkLogDate(event.target.value)}
                                            data-testid="tasks-work-log-date-input"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-muted-foreground">Hours</Label>
                                        <Input
                                            type="number"
                                            min={0.25}
                                            step={0.25}
                                            value={workLogHours}
                                            onChange={(event) => setWorkLogHours(event.target.value)}
                                            data-testid="tasks-work-log-hours-input"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-muted-foreground">Role</Label>
                                        <Combobox
                                            value={workLogResourceRoleId}
                                            onChange={setWorkLogResourceRoleId}
                                            options={resourceRoleOptions}
                                            placeholder="Select role"
                                            searchPlaceholder="Search role..."
                                            className="w-full"
                                            triggerTestId="tasks-work-log-role-combobox"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] text-muted-foreground">Note</Label>
                                        <Input
                                            value={workLogNote}
                                            onChange={(event) => setWorkLogNote(event.target.value)}
                                            placeholder="Daily update or context"
                                            data-testid="tasks-work-log-note-input"
                                        />
                                    </div>
                                    <div className="flex items-center justify-end gap-2">
                                        {editingWorkLogId ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="h-9 px-2"
                                                onClick={handleCancelWorkLogEdit}
                                                disabled={isWorkLogSaving}
                                                data-testid="tasks-work-log-cancel-edit-button"
                                            >
                                                Cancel
                                            </Button>
                                        ) : null}
                                        <Button
                                            type="button"
                                            className="h-9"
                                            onClick={() => {
                                                void handleSaveWorkLog();
                                            }}
                                            disabled={isWorkLogSaving || resourceRoleOptions.length === 0}
                                            data-testid="tasks-work-log-save-button"
                                        >
                                            {editingWorkLogId
                                                ? (updateTaskWorkLogMutation.status === "pending" ? "Updating..." : "Update")
                                                : (createTaskWorkLogMutation.status === "pending" ? "Adding..." : "Add")}
                                        </Button>
                                    </div>
                                </div>
                                {resourceRoleOptions.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        No project resource role is available for this task yet.
                                    </p>
                                ) : null}

                                <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
                                    <AppDataTable
                                        data={taskWorkLogs}
                                        columns={workLogColumns}
                                        getRowId={(row) => row.id}
                                        className="min-w-[760px] table-fixed"
                                        headerClassName="[&_tr]:border-0 bg-background"
                                        bodyClassName="[&_tr:nth-child(even)]:bg-muted/[0.08]"
                                        rowClassName="border-0 align-middle hover:bg-muted/20"
                                        isLoading={taskWorkLogsQuery.isLoading}
                                        loadingRow={(
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                                    Loading work logs...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        emptyRow={(
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                                    No work logs yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        getRowProps={(row) => ({ "data-testid": row.original.id ? "tasks-work-log-row" : undefined })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setEditing(null);
                                        resetWorkLogDraft(resourceRoleOptions[0]?.value);
                                    }}
                                    disabled={editUpdateMutation.status === "pending"}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={editUpdateMutation.status === "pending"}
                                    data-testid="tasks-edit-save-button"
                                >
                                    {editUpdateMutation.status === "pending" ? "Saving…" : "Save"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                    <DialogFooter />
                </AppDialogContent>
            </Dialog>
            {/* Confirm delete dialog */}
            <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!open) setTaskToDelete(null); setConfirmOpen(open); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete task</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to permanently delete this task? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button type="button" variant="ghost">Cancel</Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => {
                                    if (!taskToDelete) return;
                                    deleteMutation.mutate(taskToDelete.id);
                                    setConfirmOpen(false);
                                }}
                                data-testid="tasks-delete-confirm-button"
                            >
                                Delete
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog
                open={bulkDeleteConfirmOpen}
                onOpenChange={(open) => {
                    if (!open) setBulkDeleteTaskIds([]);
                    setBulkDeleteConfirmOpen(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete selected tasks</AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Delete ${bulkDeleteTaskIds.length} selected task${bulkDeleteTaskIds.length === 1 ? "" : "s"}? This action cannot be undone.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setBulkDeleteConfirmOpen(false);
                                    setBulkDeleteTaskIds([]);
                                }}
                            >
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => {
                                    void handleBulkDelete(bulkDeleteTaskIds);
                                }}
                                disabled={isBulkDeleting || bulkDeleteTaskIds.length === 0}
                                data-testid="tasks-bulk-delete-confirm-button"
                            >
                                {isBulkDeleting ? "Deleting..." : "Delete"}
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

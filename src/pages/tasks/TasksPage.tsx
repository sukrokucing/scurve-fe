import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { addDays, format, isSameDay } from "date-fns";

import { useProjectsQuery } from "@/api/queries/projects";
import {
    useTasksByProject,
    useTasksByProjectList,
    useTaskMutation,
    useDeleteTask,
    useUpdateTask,
    useBatchUpdateTasks,
    useDependencies,
    useDependencyMutation,
    useDeleteDependency,
} from "@/api/queries/tasks";
import { usersApi } from "@/api/users";
import { openapi } from "@/api/openapiClient";
import { taskSchema, type TaskFormValues } from "@/schemas/task";
import { extractFieldErrorsFromAxios } from "@/lib/api";
import type { Task, TaskStatus } from "@/types/domain";
import type { components } from "@/types/api";
import { toast } from "sonner";

type Progress = components["schemas"]["Progress"];
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useNetworkStore } from "@/store/networkStore";
import { Dialog, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Search, List, Kanban, CalendarRange, ListTodo, SlidersHorizontal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuthStore } from "@/store/authStore";
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

function getStatusLabel(status: TaskStatus): string {
    switch (status) {
        case "todo":
            return "To Do";
        case "in_progress":
            return "In Progress";
        case "blocked":
            return "Blocked";
        case "done":
            return "Done";
        default:
            return status;
    }
}

function clampProgress(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
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

export function TasksPage() {
    const queryClient = useQueryClient();
    const currentUserId = useAuthStore((state) => state.user?.id);
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
    const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
    const [startFromFilter, setStartFromFilter] = useState("");
    const [startToFilter, setStartToFilter] = useState("");
    const [dueFromFilter, setDueFromFilter] = useState("");
    const [dueToFilter, setDueToFilter] = useState("");
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 180);
    const deferredSearchQuery = useDeferredValue(debouncedSearchQuery);
    const normalizedSearchQuery = deferredSearchQuery.trim();
    const normalizedSearchQueryLower = normalizedSearchQuery.toLowerCase();
    const apiStatusFilter = useMemo(
        () => (statusFilter === "all" ? undefined : mapTaskStatusToApi(statusFilter as TaskStatus)),
        [statusFilter],
    );
    const apiAssigneeFilter = assigneeFilter === "all" ? undefined : assigneeFilter;

    const listQueryParams = useMemo(
        () => ({
            q: normalizedSearchQuery || undefined,
            status: apiStatusFilter,
            assignee_id: apiAssigneeFilter,
            start_from: startFromFilter || undefined,
            start_to: startToFilter || undefined,
            due_from: dueFromFilter || undefined,
            due_to: dueToFilter || undefined,
            page,
            per_page: pageSize,
            sort_by: "updated_at",
            sort_dir: "desc" as const,
        }),
        [
            apiAssigneeFilter,
            apiStatusFilter,
            dueFromFilter,
            dueToFilter,
            normalizedSearchQuery,
            page,
            pageSize,
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

    const allTasks = (allTasksData as Task[] | undefined) ?? EMPTY_TASKS;
    const listTasks = listTasksData?.tasks ?? EMPTY_TASKS;
    const listTotalCount = listTasksData?.total ?? listTasks.length;
    const tasks = view === "list" ? listTasks : allTasks;
    const progress = (progressData as Progress[] | undefined) ?? EMPTY_PROGRESS;
    const isLoading = (view === "list" ? isLoadingListTasks : isLoadingAllTasks) || (view === "gantt" && isLoadingProgress);
    const { data: usersLookup } = useQuery({
        queryKey: ["users", "lookup"],
        queryFn: () => usersApi.listUsers({ page: 1, per_page: 500 }),
        staleTime: 5 * 60 * 1000,
    });
    const assigneeById = useMemo(
        () => new Map((usersLookup?.users ?? []).map((user) => [user.id, user])),
        [usersLookup?.users]
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
            const matchesAssignee = assigneeFilter === "all" || task.assigneeId === assigneeFilter;
            const matchesStartDate = isWithinDateRange(task.startDate, startFromFilter || undefined, startToFilter || undefined);
            const matchesDueDate = isWithinDateRange(task.dueDate, dueFromFilter || undefined, dueToFilter || undefined);
            return matchesSearch && matchesStatus && matchesAssignee && matchesStartDate && matchesDueDate;
        });
    }, [
        allTasks,
        assigneeFilter,
        dueFromFilter,
        dueToFilter,
        listTasks,
        normalizedSearchQueryLower,
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
        || startFromFilter !== ""
        || startToFilter !== ""
        || dueFromFilter !== ""
        || dueToFilter !== "";
    const activeAdvancedFilterCount = useMemo(() => {
        let count = 0;
        if (assigneeFilter !== "all") count += 1;
        if (startFromFilter) count += 1;
        if (startToFilter) count += 1;
        if (dueFromFilter) count += 1;
        if (dueToFilter) count += 1;
        return count;
    }, [assigneeFilter, dueFromFilter, dueToFilter, startFromFilter, startToFilter]);
    const currentViewLabel = useMemo(() => {
        if (view === "kanban") return "Board";
        if (view === "gantt") return "Gantt";
        return "List";
    }, [view]);
    const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
    const [isSelectionActionsOpen, setIsSelectionActionsOpen] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
    const [bulkStatus, setBulkStatus] = useState<string>("");
    const [bulkAssignee, setBulkAssignee] = useState<string>("");
    const [bulkProgress, setBulkProgress] = useState<number>(0);
    const [isBulkStatusUpdating, setIsBulkStatusUpdating] = useState(false);
    const [isBulkAssigneeUpdating, setIsBulkAssigneeUpdating] = useState(false);
    const [isBulkProgressUpdating, setIsBulkProgressUpdating] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const isBulkBusy = isBulkStatusUpdating || isBulkAssigneeUpdating || isBulkProgressUpdating || isBulkDeleting;

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
    const assigneeOptions = useMemo(
        () => [
            { value: "__unassigned__", label: "Unassigned" },
            ...(usersLookup?.users ?? []).map((user) => ({
                value: user.id,
                label: user.name?.trim()
                    ? `${user.name} (${user.email})`
                    : user.email,
            })),
        ],
        [usersLookup?.users]
    );
    const assigneeFilterOptions = useMemo(
        () => [
            { value: "all", label: "All Assignees" },
            ...(usersLookup?.users ?? []).map((user) => ({
                value: user.id,
                label: user.name?.trim()
                    ? `${user.name} (${user.email})`
                    : user.email,
            })),
        ],
        [usersLookup?.users]
    );

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

    // Virtualizer for List View
    const parentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: pagedTasks.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53, // Approximate height of a table row
        overscan: 5,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const firstVirtualRow = virtualRows[0];
    const lastVirtualRow = virtualRows[virtualRows.length - 1];

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
        normalizedSearchQuery,
        selectedProject,
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
        setBulkStatus("");
        setBulkAssignee("");
        setBulkProgress(0);
        setIsSelectionActionsOpen(false);
    }, [selectedProject, view]);

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
    const refreshTasks = useCallback(() => {
        if (view === "list") {
            void refetchListTasks();
            return;
        }
        void refetchAllTasks();
    }, [refetchAllTasks, refetchListTasks, view]);

    const createForm = useForm<TaskFormValues>({ defaultValues: { title: "", plan: 1, progress: 0, status: "todo" } });
    const [createOpen, setCreateOpen] = useState(false);
    const createRef = useRef<HTMLInputElement | null>(null);
    const timeToTaskSessionIdRef = useRef<string | null>(null);
    const [timeToTaskSummary, setTimeToTaskSummary] = useState(() =>
        getTimeToTaskSummary(currentUserId),
    );
    const [editing, setEditing] = useState<Task | null>(null);
    const editForm = useForm<TaskFormValues>({ defaultValues: { title: "", plan: 1, progress: 0, status: "todo" } });

    const createMutation = useTaskMutation(selectedProject);
    const deleteMutation = useDeleteTask(selectedProject);
    const updateMutation = useUpdateTask();
    const ganttUpdateMutation = useUpdateTask();
    const ganttBatchUpdateMutation = useBatchUpdateTasks(selectedProject);
    const dependencyMutation = useDependencyMutation(selectedProject);
    const deleteDependencyMutation = useDeleteDependency(selectedProject);

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
                        await ganttUpdateMutation.mutateAsync({
                            id: task.originalId,
                            projectId: selectedProject,
                            payload: {
                                name: task.name,
                                startDate: task.start.toISOString(),
                                endDate: task.end.toISOString(),
                                dueDate: task.end.toISOString(),
                                progress: task.progress,
                                durationDays: getDurationDays(task.start, task.end),
                            },
                        });
                    } else {
                        await ganttBatchUpdateMutation.mutateAsync({
                            tasks: updates.map((task) => ({
                                id: task.originalId,
                                title: task.name,
                                start_date: task.start.toISOString(),
                                end_date: task.end.toISOString(),
                                due_date: task.end.toISOString(),
                                progress: task.progress,
                            })),
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
    }, [clearGanttOverridesFor, ganttBatchUpdateMutation, ganttUpdateMutation, selectedProject]);

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
            updatedTasks.forEach((task) => {
                next[task.originalId] = {
                    ...(next[task.originalId] ?? {}),
                    name: task.name,
                    startDate: task.start.toISOString(),
                    endDate: task.end.toISOString(),
                    dueDate: task.end.toISOString(),
                    progress: task.progress,
                    durationDays: getDurationDays(task.start, task.end),
                };
            });
            return next;
        });

        scheduleGanttFlush();
    }, [scheduleGanttFlush, selectedProject]);

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
            plan: task.durationDays ?? 1,
            start_date: formatDateForInput(task.startDate),
            end_date: formatDateForInput(task.endDate),
            progress: typeof task.progress === "number" ? task.progress : 0,
            status: task.status,
            projectId: task.projectId,
        });
    }, [editForm]);

    const handleBulkStatusApply = useCallback(async () => {
        if (!selectedProject || !bulkStatus || selectedTaskIds.length === 0) return;
        const targetStatus = bulkStatus as TaskStatus;
        setIsBulkStatusUpdating(true);

        try {
            await openapi.batchUpdateTasks(selectedProject, {
                tasks: selectedTaskIds.map((taskId) => ({
                    id: taskId,
                    status: mapTaskStatusToApi(targetStatus),
                })),
            });
            toast.success(`Updated ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"} to ${getStatusLabel(targetStatus)}.`);
            setSelectedTaskIds([]);
            setBulkStatus("");
            setBulkAssignee("");
            setBulkProgress(0);
            await queryClient.invalidateQueries({ queryKey: ["tasks", "project", selectedProject] });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update tasks: ${message}`);
        } finally {
            setIsBulkStatusUpdating(false);
        }
    }, [bulkStatus, queryClient, selectedProject, selectedTaskIds]);

    const handleBulkAssigneeApply = useCallback(async () => {
        if (!selectedProject || !bulkAssignee || selectedTaskIds.length === 0) return;
        const targetAssignee = bulkAssignee === "__unassigned__" ? "" : bulkAssignee;
        setIsBulkAssigneeUpdating(true);

        try {
            await openapi.batchUpdateTasks(selectedProject, {
                tasks: selectedTaskIds.map((taskId) => ({
                    id: taskId,
                    assignee: targetAssignee || null,
                })),
            });
            const assigneeLabel = bulkAssignee === "__unassigned__" ? "Unassigned" : getAssigneeLabel(targetAssignee);
            toast.success(`Updated assignee for ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"} to ${assigneeLabel}.`);
            setSelectedTaskIds([]);
            setBulkStatus("");
            setBulkAssignee("");
            setBulkProgress(0);
            await queryClient.invalidateQueries({ queryKey: ["tasks", "project", selectedProject] });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update assignees: ${message}`);
        } finally {
            setIsBulkAssigneeUpdating(false);
        }
    }, [bulkAssignee, getAssigneeLabel, queryClient, selectedProject, selectedTaskIds]);

    const handleBulkProgressApply = useCallback(async () => {
        if (!selectedProject || selectedTaskIds.length === 0) return;
        const targetProgress = clampProgress(bulkProgress);
        setIsBulkProgressUpdating(true);

        try {
            await openapi.batchUpdateTasks(selectedProject, {
                tasks: selectedTaskIds.map((taskId) => ({
                    id: taskId,
                    progress: targetProgress,
                })),
            });
            toast.success(`Updated progress to ${targetProgress}% for ${selectedTaskIds.length} task${selectedTaskIds.length === 1 ? "" : "s"}.`);
            setSelectedTaskIds([]);
            setBulkStatus("");
            setBulkAssignee("");
            setBulkProgress(0);
            await queryClient.invalidateQueries({ queryKey: ["tasks", "project", selectedProject] });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update progress: ${message}`);
        } finally {
            setIsBulkProgressUpdating(false);
        }
    }, [bulkProgress, queryClient, selectedProject, selectedTaskIds]);

    const handleBulkDelete = useCallback(async (taskIds: string[]) => {
        if (!selectedProject || taskIds.length === 0) return;
        setIsBulkDeleting(true);

        try {
            const result = await openapi.batchDeleteTasks(selectedProject, taskIds);
            const deletedCount = Number.isFinite(result?.deleted) ? result.deleted : taskIds.length;
            toast.success(`Deleted ${deletedCount} task${deletedCount === 1 ? "" : "s"}.`);
            setSelectedTaskIds([]);
            setBulkStatus("");
            setBulkAssignee("");
            setBulkProgress(0);
            setBulkDeleteTaskIds([]);
            setBulkDeleteConfirmOpen(false);

            await queryClient.invalidateQueries({ queryKey: ["tasks", "project", selectedProject] });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to delete selected tasks: ${message}`);
        } finally {
            setIsBulkDeleting(false);
        }
    }, [queryClient, selectedProject]);

    const requestBulkDelete = useCallback(() => {
        if (!selectedProject || selectedTaskIds.length === 0) return;
        setBulkDeleteTaskIds(selectedTaskIds);
        setBulkDeleteConfirmOpen(true);
    }, [selectedProject, selectedTaskIds]);

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
                    <KanbanProvider<KanbanTaskItem>
                        columns={KANBAN_COLUMNS}
                        data={kanbanTasks}
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
                                                    const t = item;
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
                    dependencies={dependenciesData ?? []}
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
            <div className="space-y-3">
                <div className="md:hidden space-y-3">
                    {pagedTasks.map((task, index) => (
                        <Card key={task.id} className="border-border/70" data-testid="tasks-mobile-card">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-2 min-w-0">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                                            checked={selectedTaskIdSet.has(task.id)}
                                            onChange={(event) => toggleTaskSelection(task.id, event.target.checked)}
                                            aria-label={`Select task ${task.name}`}
                                            data-testid="tasks-row-select-checkbox"
                                        />
                                        <div className="space-y-1 min-w-0">
                                            <p className="text-xs text-muted-foreground">
                                                #{((page - 1) * pageSize) + index + 1}
                                            </p>
                                            <p className="text-sm font-semibold leading-tight line-clamp-2" title={task.name}>
                                                {task.name}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={getStatusVariant(task.status)}>
                                        {task.status}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-y-1 text-xs">
                                    <span className="text-muted-foreground">Assignee</span>
                                    <span className="text-right">{getAssigneeLabel(task.assigneeId)}</span>
                                    <span className="text-muted-foreground">Plan</span>
                                    <span className="text-right">{task.durationDays ? `${task.durationDays}d` : "—"}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-11"
                                        data-testid="tasks-mobile-edit-button"
                                        onClick={() => openTaskEditor(task)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive-outline"
                                        className="h-11"
                                        data-testid="tasks-mobile-delete-button"
                                        onClick={() => {
                                            setTaskToDelete(task);
                                            setConfirmOpen(true);
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div
                    ref={parentRef}
                    className="hidden md:block"
                    style={{
                        height: `calc(100vh - 280px)`,
                        overflow: "auto",
                    }}
                >
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <TableHead className="w-[90px]">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-border accent-primary"
                                            checked={allPageSelected}
                                            onChange={(event) => toggleSelectAllOnPage(event.target.checked)}
                                            aria-label="Select all tasks on current page"
                                            data-testid="tasks-select-all-page-checkbox"
                                        />
                                        <span>#</span>
                                    </div>
                                </TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Assignee</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {virtualRows.length === 0 && (
                                <TableRow key="no-tasks">
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        No tasks found.
                                    </TableCell>
                                </TableRow>
                            )}

                            {firstVirtualRow ? (
                                <TableRow key={`spacer-start-${firstVirtualRow.index}`} style={{ height: `${firstVirtualRow.start}px` }}>
                                    <TableCell colSpan={6} style={{ padding: 0 }} />
                                </TableRow>
                            ) : null}

                            {virtualRows.map((virtualItem) => {
                                const task = pagedTasks[virtualItem.index];
                                if (!task) return null; // Safety check
                                return (
                                    <TableRow
                                        key={task.id}
                                        data-index={virtualItem.index}
                                        ref={rowVirtualizer.measureElement}
                                        onDoubleClick={() => openTaskEditor(task)}
                                        className="cursor-pointer hover:bg-surface-hover transition-colors"
                                    >
                                        <TableCell className="text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-border accent-primary"
                                                    checked={selectedTaskIdSet.has(task.id)}
                                                    onChange={(event) => toggleTaskSelection(task.id, event.target.checked)}
                                                    onClick={(event) => event.stopPropagation()}
                                                    aria-label={`Select task ${task.name}`}
                                                    data-testid="tasks-row-select-checkbox"
                                                />
                                                <span>{((page - 1) * pageSize) + virtualItem.index + 1}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">{task.name}</TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(task.status)}>
                                                {task.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{getAssigneeLabel(task.assigneeId)}</TableCell>
                                        <TableCell>{task.durationDays ? `${task.durationDays}d` : "—"}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    data-testid="tasks-row-edit-button"
                                                    onClick={() => openTaskEditor(task)}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive-outline"
                                                    data-testid="tasks-row-delete-button"
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

                            {lastVirtualRow ? (
                                <TableRow key={`spacer-end-${lastVirtualRow.index}`} style={{ height: `${rowVirtualizer.getTotalSize() - lastVirtualRow.end}px` }}>
                                    <TableCell colSpan={6} style={{ padding: 0 }} />
                                </TableRow>
                            ) : null}
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
        <div className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
                    <p className="text-muted-foreground leading-relaxed">
                        Track execution status and unblock your teams quickly.
                    </p>
                    <div
                        className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                        data-testid="tasks-time-to-task-summary"
                    >
                        <Badge variant="outline">
                            Time to Task p50: {formatDurationMs(timeToTaskSummary.p50Ms)}
                        </Badge>
                        <Badge variant="outline">
                            Last: {formatDurationMs(timeToTaskSummary.lastMs)}
                        </Badge>
                        <Badge variant="outline">
                            Intent completion: {Math.round(timeToTaskSummary.intentCompletionRate * 100)}%
                        </Badge>
                        <Badge variant="outline">
                            Intent samples: {timeToTaskSummary.intentSampleCount}
                        </Badge>
                        <Badge variant="outline">
                            Passive exits: {timeToTaskSummary.passiveExitCount}
                        </Badge>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-10 px-3"
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
                            Reset Time to Task
                        </Button>
                    </div>
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
                        variant="secondary"
                        onClick={refreshTasks}
                        disabled={!selectedProject || isRefetching || isRateLimited}
                    >
                        {isRateLimited ? "Cooling down..." : (isRefetching ? "Refreshing…" : "Refresh")}
                    </Button>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button type="button" data-testid="tasks-new-button">New task</Button>
                        </DialogTrigger>
                        <AppDialogContent
                            title="Create task"
                            description="Create a new task for your project with optional progress tracking."
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

                                        createMutation.mutateAsync({
                                            name: parsed.data.title,
                                            dueDate: dueDate,
                                            startDate: startDate,
                                            endDate: finalEndDate,
                                            status: (parsed.data.status ?? "todo") as TaskStatus,
                                            progress: parsed.data.progress || 0,
                                        })
                                            .then(() => {
                                                const activeSessionId = timeToTaskSessionIdRef.current;
                                                if (activeSessionId) {
                                                    completeTimeToTaskSession(activeSessionId, {
                                                        projectId: targetProjectId,
                                                        view,
                                                    });
                                                }
                                                beginTimeToTaskSession();
                                                refreshTimeToTaskSummary();
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
            <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle>{currentProject?.name ?? "Select a project"}</CardTitle>
                    <CardDescription>
                        View project backlog, progress and blockers from the backend API.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="mb-6 flex flex-col gap-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center" data-testid="tasks-primary-toolbar">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search tasks..."
                                    className="h-10 pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    data-testid="tasks-search-input"
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
                                className="w-full lg:w-[180px]"
                            />
                            <Popover open={isAdvancedFiltersOpen} onOpenChange={setIsAdvancedFiltersOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant={hasAdvancedFilters || view !== "list" ? "secondary" : "outline"}
                                        className="h-10 w-full justify-between gap-2 lg:w-[220px]"
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
                                                onClick={() => setView("list")}
                                                className="h-9"
                                                data-testid="tasks-view-list-button"
                                            >
                                                <List className="mr-2 h-4 w-4" />
                                                List
                                            </Button>
                                            <Button
                                                variant={view === "kanban" ? "default" : "outline"}
                                                onClick={() => setView("kanban")}
                                                className="h-9"
                                                data-testid="tasks-view-board-button"
                                            >
                                                <Kanban className="mr-2 h-4 w-4" />
                                                Board
                                            </Button>
                                            <Button
                                                variant={view === "gantt" ? "default" : "outline"}
                                                onClick={() => setView("gantt")}
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
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Filters
                                        </div>
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
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-xs text-muted-foreground">
                                                Use this panel for non-primary controls to keep the default toolbar focused.
                                            </p>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="h-10 w-full sm:w-auto"
                                                onClick={() => {
                                                    setAssigneeFilter("all");
                                                    setStartFromFilter("");
                                                    setStartToFilter("");
                                                    setDueFromFilter("");
                                                    setDueToFilter("");
                                                    setIsAdvancedFiltersOpen(false);
                                                }}
                                                disabled={!hasAdvancedFilters}
                                                data-testid="tasks-clear-advanced-filters-button"
                                            >
                                                Clear filters
                                            </Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="tasks-toolbar-summary-badges">
                            <Badge variant="outline">View: {currentViewLabel}</Badge>
                            {activeAdvancedFilterCount > 0 ? (
                                <Badge variant="outline">Filters: {activeAdvancedFilterCount}</Badge>
                            ) : null}
                        </div>
                    </div>

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
                                                <Button
                                                    type="button"
                                                    className="w-full"
                                                    onClick={() => {
                                                        void handleBulkStatusApply();
                                                    }}
                                                    disabled={!bulkStatus || isBulkBusy}
                                                    data-testid="tasks-bulk-apply-button"
                                                >
                                                    {isBulkStatusUpdating ? "Applying..." : "Apply status"}
                                                </Button>
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
                                                <Button
                                                    type="button"
                                                    className="w-full"
                                                    onClick={() => {
                                                        void handleBulkAssigneeApply();
                                                    }}
                                                    disabled={!bulkAssignee || isBulkBusy}
                                                    data-testid="tasks-bulk-apply-assignee-button"
                                                >
                                                    {isBulkAssigneeUpdating ? "Applying..." : "Apply assignee"}
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Progress</Label>
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
                                                        }}
                                                        className="h-10 w-24"
                                                        data-testid="tasks-bulk-progress-input"
                                                        aria-label="Bulk progress value"
                                                    />
                                                    <Button
                                                        type="button"
                                                        className="flex-1"
                                                        onClick={() => {
                                                            void handleBulkProgressApply();
                                                        }}
                                                        disabled={isBulkBusy}
                                                        data-testid="tasks-bulk-apply-progress-button"
                                                    >
                                                        {isBulkProgressUpdating ? "Applying..." : "Apply progress"}
                                                    </Button>
                                                </div>
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
                                        setBulkStatus("");
                                        setBulkAssignee("");
                                        setBulkProgress(0);
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
            <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
                <AppDialogContent
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
                                            data-testid="tasks-edit-title-input"
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
                                            options={buildDurationOptions(editForm.watch("plan"))}
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
                                <Button
                                    type="submit"
                                    disabled={updateMutation.status === "pending"}
                                    data-testid="tasks-edit-save-button"
                                >
                                    {updateMutation.status === "pending" ? "Saving…" : "Save"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                    <DialogFooter />
                </AppDialogContent>
            </Dialog>
            {/* Confirm delete dialog */}
            <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setTaskToDelete(null); setConfirmOpen(open); }}>
                <AppDialogContent
                    title="Delete task"
                    description="Are you sure you want to permanently delete this task? This action cannot be undone."
                >
                    <div className="flex justify-end gap-2 mt-4">
                        <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={() => {
                            if (!taskToDelete) return;
                            deleteMutation.mutate(taskToDelete.id);
                            setConfirmOpen(false);
                        }} data-testid="tasks-delete-confirm-button">
                            Delete
                        </Button>
                    </div>
                    <DialogFooter />
                    <DialogClose />
                </AppDialogContent>
            </Dialog>
            <Dialog
                open={bulkDeleteConfirmOpen}
                onOpenChange={(open) => {
                    if (!open) setBulkDeleteTaskIds([]);
                    setBulkDeleteConfirmOpen(open);
                }}
            >
                <AppDialogContent
                    title="Delete selected tasks"
                    description={`Delete ${bulkDeleteTaskIds.length} selected task${bulkDeleteTaskIds.length === 1 ? "" : "s"}? This action cannot be undone.`}
                >
                    <div className="flex justify-end gap-2 mt-4">
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
                    </div>
                    <DialogFooter />
                    <DialogClose />
                </AppDialogContent>
            </Dialog>
        </div>
    );
}

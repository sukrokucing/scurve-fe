import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Line,
    LineChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { AlertCircle, Calendar, CheckCircle2, Loader2, Target, TrendingUp, Users2 } from "lucide-react";

import {
    useProjectDashboard,
    useProjectSCurveHealth,
} from "@/api/queries/projects";
import { useTasksByProject } from "@/api/queries/tasks";
import type { ApiSCurveMetric } from "@/api/openapiClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMedia } from "@/hooks/vendor/reactUse";
import type { Task } from "@/types/domain";
import { cn } from "@/lib/utils";

const METRIC_OPTIONS = [
    { value: "progress", label: "Progress" },
    { value: "hours", label: "Hours" },
    { value: "cost", label: "Cost" },
] as const;

type ScheduleBucketId = "finishedEarly" | "overdue" | "onTime" | "notSpecified";

type ScheduleSummaryItem = {
    id: ScheduleBucketId;
    label: string;
    description: string;
    value: number;
    toneClassName: string;
    barClassName: string;
};

function getMetricCopy(metric: ApiSCurveMetric) {
    if (metric === "hours") {
        return {
            actualDescription: "Logged so far",
            plannedDescription: "Planned by now",
            varianceDescription: "Actual vs planned",
            chartDescription: "Planned vs actual effort over time.",
        };
    }

    if (metric === "cost") {
        return {
            actualDescription: "Spent so far",
            plannedDescription: "Planned by now",
            varianceDescription: "Actual vs planned",
            chartDescription: "Planned vs actual cost over time.",
        };
    }

    return {
        actualDescription: "Current actual",
        plannedDescription: "Planned by now",
        varianceDescription: "Actual vs planned",
        chartDescription: "Planned vs actual progress over time.",
    };
}

function toMetricValue(value: number | null | undefined, fallback: number) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
    return null;
}

function formatPercentage(value: number | null) {
    if (value === null) return "N/A";
    return `${value.toFixed(1)}%`;
}

function formatMetricValue(metric: ApiSCurveMetric, value: number | null, unit?: string | null) {
    if (value === null) return "N/A";

    if (metric === "progress") {
        return formatPercentage(value);
    }

    if (metric === "hours") {
        const hourUnit = unit?.trim() || "hrs";
        return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${hourUnit}`;
    }

    const normalizedUnit = unit?.trim().toUpperCase();
    if (normalizedUnit && /^[A-Z]{3}$/.test(normalizedUnit)) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: normalizedUnit,
                maximumFractionDigits: 2,
            }).format(value);
        } catch {
            return `${normalizedUnit} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        }
    }

    if (unit?.trim()) {
        return `${unit.trim()} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }

    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMetricDelta(metric: ApiSCurveMetric, value: number | null, unit?: string | null) {
    if (value === null) return "N/A";

    if (metric === "progress") {
        return `${value > 0 ? "+" : ""}${formatPercentage(value)}`;
    }

    const absoluteValue = Math.abs(value);
    const formatted = formatMetricValue(metric, absoluteValue, unit);
    if (formatted === "N/A") return formatted;
    return `${value > 0 ? "+" : value < 0 ? "-" : ""}${formatted}`;
}

function formatMetricAxisValue(metric: ApiSCurveMetric, value: number, unit?: string | null) {
    if (!Number.isFinite(value)) return "";

    if (metric === "progress") {
        return `${Math.round(value)}%`;
    }

    if (metric === "hours") {
        return `${Math.round(value)}h`;
    }

    const normalizedUnit = unit?.trim().toUpperCase();
    if (normalizedUnit && /^[A-Z]{3}$/.test(normalizedUnit)) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: normalizedUnit,
                notation: "compact",
                maximumFractionDigits: 1,
            }).format(value);
        } catch {
            return `${normalizedUnit} ${Math.round(value)}`;
        }
    }

    return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

function formatStageLabel(stage?: string | null) {
    if (!stage) return "Unknown";
    if (stage === "lag") return "Lag phase";
    if (stage === "log") return "Log phase";
    if (stage === "maturity") return "Maturity";
    if (stage === "decline") return "Decline";
    return stage;
}

function formatRuleStatus(
    ruleStatus?: string | null,
    passed?: boolean | null,
    dataStatus?: string | null,
    metricSupported?: boolean,
) {
    if (metricSupported === false || dataStatus === "unsupported_metric" || ruleStatus === "unsupported_metric") {
        return "Unsupported metric";
    }
    if (dataStatus === "insufficient_data") return "Insufficient data";
    if (ruleStatus === "insufficient_progress_data") return "Need progress history";
    if (ruleStatus === "insufficient_metric_data") return "Need metric history";
    if (ruleStatus === "pre_window") return "Pre-window";
    if (ruleStatus === "post_window_pass") return "Pass";
    if (ruleStatus === "post_window_fail") return "Needs attention";
    if (ruleStatus === "fail") return "Needs attention";
    if (passed === true) return "Pass";
    if (passed === false) return "Needs attention";
    if (!ruleStatus) return "Unknown";
    return ruleStatus.replace(/_/g, " ");
}

export const ProjectDashboard = () => {
    const { id } = useParams<{ id: string }>();
    const isLaptopDensity = useMedia("(min-width: 1024px) and (max-width: 1439px)", false);
    const [metric, setMetric] = useState<ApiSCurveMetric>("progress");
    const { data: dashboard, isLoading, error } = useProjectDashboard(id || "", metric);
    const { data: health, isLoading: isHealthLoading } = useProjectSCurveHealth(id || "", metric);
    const { data: projectTasksData, isLoading: isTasksLoading } = useTasksByProject(id || "", false, {
        enabled: Boolean(id),
    });
    const projectTasks = useMemo(() => {
        const rawTasks = projectTasksData as Task[] | undefined;
        return Array.isArray(rawTasks) ? rawTasks : [];
    }, [projectTasksData]);

    const chartData = useMemo(() => {
        if (!dashboard) return [];

        const dateMap: Record<string, { date: string; plan?: number; actual?: number }> = {};
        const metricPlanPoints = Array.isArray(dashboard.metric_plan) ? dashboard.metric_plan : [];
        const metricActualPoints = Array.isArray(dashboard.metric_actual) ? dashboard.metric_actual : [];
        const hasMetricSeries = metricPlanPoints.length > 0 || metricActualPoints.length > 0;

        if (hasMetricSeries) {
            metricPlanPoints.forEach((point) => {
                const dateStr = format(new Date(point.date), "yyyy-MM-dd");
                if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
                dateMap[dateStr].plan = point.value;
            });

            metricActualPoints.forEach((point) => {
                const dateStr = format(new Date(point.date), "yyyy-MM-dd");
                if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
                dateMap[dateStr].actual = point.value;
            });
        } else {
            dashboard.plan.forEach((point) => {
                const dateStr = format(new Date(point.date), "yyyy-MM-dd");
                if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
                dateMap[dateStr].plan = point.planned_progress;
            });

            dashboard.actual.forEach((point) => {
                const dateStr = format(new Date(point.date), "yyyy-MM-dd");
                if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
                dateMap[dateStr].actual = point.actual;
            });
        }

        return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    }, [dashboard]);

    const overallProgress = useMemo(() => {
        const progressFromDashboard = toMetricValue(dashboard?.overall_progress_pct, Number.NaN);

        if (progressFromDashboard !== null) return progressFromDashboard;
        if (projectTasks.length === 0) return null;

        const totalProgress = projectTasks.reduce((sum, task) => {
            if (typeof task.actualProgressPct === "number" && Number.isFinite(task.actualProgressPct)) {
                return sum + task.actualProgressPct;
            }
            if (typeof task.progress === "number" && Number.isFinite(task.progress)) {
                return sum + task.progress;
            }
            return sum + ((task.executionStatus === "completed" || task.status === "done") ? 100 : 0);
        }, 0);

        return totalProgress / projectTasks.length;
    }, [dashboard?.overall_progress_pct, projectTasks]);

    const taskCompletionSummary = useMemo(() => {
        const statusCounts = dashboard?.task_status_counts;
        const totalTasks = typeof statusCounts?.total === "number" ? statusCounts.total : projectTasks.length;
        const completedTasks = projectTasks.filter((task) => task.executionStatus === "completed" || task.status === "done").length;
        const completedWithoutActualTimestamp = projectTasks.filter(
            (task) => (task.executionStatus === "completed" || task.status === "done") && !task.completedAt,
        ).length;

        const scheduleSummary: ScheduleSummaryItem[] = [
            {
                id: "finishedEarly",
                label: "Finished early",
                description: "Backend-computed early completions.",
                value: Number(statusCounts?.finished_early ?? 0),
                toneClassName: "text-emerald-600 dark:text-emerald-400",
                barClassName: "bg-emerald-500",
            },
            {
                id: "overdue",
                label: "Overdue",
                description: "Backend-computed overdue tasks.",
                value: Number(statusCounts?.overdue ?? 0),
                toneClassName: "text-destructive",
                barClassName: "bg-destructive",
            },
            {
                id: "onTime",
                label: "On time",
                description: "Backend-computed on-time tasks.",
                value: Number(statusCounts?.on_time ?? 0),
                toneClassName: "text-sky-600 dark:text-sky-400",
                barClassName: "bg-sky-500",
            },
            {
                id: "notSpecified",
                label: "Not specified",
                description: "Tasks still missing schedule details.",
                value: Number(statusCounts?.not_specified ?? 0),
                toneClassName: "text-muted-foreground",
                barClassName: "bg-muted-foreground/60",
            },
        ];

        return {
            totalTasks,
            completedTasks,
            openTasks: Math.max(totalTasks - completedTasks, 0),
            completedWithoutActualTimestamp,
            scheduleSummary,
        };
    }, [dashboard?.task_status_counts, projectTasks]);
    const scheduleSummaryLegendItems = useMemo(
        () => taskCompletionSummary.scheduleSummary.filter((item) => item.value > 0),
        [taskCompletionSummary.scheduleSummary],
    );
    const scheduleExceptionCount = useMemo(
        () => taskCompletionSummary.scheduleSummary
            .filter((item) => item.id === "overdue" || item.id === "notSpecified")
            .reduce((total, item) => total + item.value, 0),
        [taskCompletionSummary.scheduleSummary],
    );
    const isScheduleAllClear = scheduleExceptionCount === 0 && taskCompletionSummary.totalTasks > 0;
    const visibleScheduleSummary = useMemo(() => {
        if (isScheduleAllClear) {
            return taskCompletionSummary.scheduleSummary.filter((item) => item.id === "finishedEarly" || item.id === "onTime");
        }
        if (isLaptopDensity) {
            return taskCompletionSummary.scheduleSummary.filter((item) => item.id === "overdue" || item.id === "notSpecified");
        }
        return taskCompletionSummary.scheduleSummary;
    }, [isLaptopDensity, isScheduleAllClear, taskCompletionSummary.scheduleSummary]);

    const workloadDistribution = useMemo(() => {
        const summaryRows = Array.isArray(dashboard?.workload_distribution) ? dashboard.workload_distribution : [];
        const memberRows: Array<{ id: string; label: string; count: number; sublabel?: string }> = summaryRows
            .map((row) => ({
                id: row.user_id,
                label: row.user_name,
                count: row.task_count,
            }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

        const assignedTaskTotal = summaryRows.reduce((sum, row) => sum + row.task_count, 0);
        const unassignedCount = Math.max((dashboard?.task_status_counts.total ?? projectTasks.length) - assignedTaskTotal, 0);

        if (unassignedCount > 0) {
            memberRows.push({
                id: "__unassigned__",
                label: "Unassigned",
                sublabel: "Tasks without an owner",
                count: unassignedCount,
            });
        }

        const maxCount = memberRows.reduce((max, row) => Math.max(max, row.count), 0);
        const topOwner = memberRows
            .filter((row) => row.id !== "__unassigned__")
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0] ?? null;

        return {
            rows: memberRows,
            maxCount,
            assignedMemberCount: memberRows.filter((row) => row.id !== "__unassigned__" && row.count > 0).length,
            unassignedCount,
            topOwner,
        };
    }, [dashboard?.task_status_counts.total, dashboard?.workload_distribution, projectTasks.length]);

    if (isLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !dashboard) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <div>
                    <h3 className="text-lg font-semibold">Failed to load dashboard</h3>
                    <p className="text-muted-foreground">Please try again later or contact support.</p>
                </div>
            </div>
        );
    }

    const latestActualPoint = chartData
        .map((point) => ({ ...point, ts: new Date(point.date).getTime() }))
        .filter((point) => Number.isFinite(point.ts))
        .sort((a, b) => a.ts - b.ts)
        .at(-1);
    const latestPlanPoint = chartData
        .map((point) => ({ ...point, ts: new Date(point.date).getTime() }))
        .filter((point) => Number.isFinite(point.ts))
        .sort((a, b) => a.ts - b.ts)
        .at(-1);

    const dashboardActual = latestActualPoint
        ? latestActualPoint.actual ?? 0
        : 0;
    const dashboardPlan = latestPlanPoint
        ? latestPlanPoint.plan ?? 0
        : 0;
    const dashboardVariance = dashboardActual - dashboardPlan;
    const isProgressMetric = metric === "progress";

    const currentActual = isProgressMetric
        ? toMetricValue(health?.actual_pct, dashboardActual)
        : toMetricValue(dashboardActual, Number.NaN);
    const currentPlan = isProgressMetric
        ? toMetricValue(health?.planned_pct, dashboardPlan)
        : toMetricValue(dashboardPlan, Number.NaN);
    const variance = isProgressMetric
        ? toMetricValue(health?.variance_pct, dashboardVariance)
        : toMetricValue(dashboardVariance, Number.NaN);
    const stageLabel = formatStageLabel(health?.stage);
    const ruleStatusLabel = formatRuleStatus(
        health?.rule_50_70_status,
        health?.rule_50_70_pass,
        health?.data_status,
        health?.metric_supported,
    );
    const ruleIsPassing = health?.rule_50_70_pass === true;
    const ruleIsNeutral = !health
        || health.metric_supported === false
        || health.data_status === "unsupported_metric"
        || health.data_status === "insufficient_data"
        || health.rule_50_70_status === "insufficient_progress_data"
        || health.rule_50_70_status === "insufficient_metric_data"
        || health.rule_50_70_status === "pre_window"
        || typeof health.rule_50_70_pass !== "boolean";
    const chartUnit = dashboard.unit ?? (isProgressMetric ? "%" : "");
    const metricCopy = getMetricCopy(metric);
    const dueDateCoverage = Math.round(dashboard.due_date_coverage_pct);
    const assignmentCoverage = Math.round(dashboard.assignment_coverage_pct);
    const governanceBadgeLabel = ruleIsNeutral ? "Awaiting data" : ruleIsPassing ? "All clear" : "Needs attention";
    const governanceBadgeClassName = ruleIsNeutral
        ? undefined
        : ruleIsPassing
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";

    return (
        <div className="mx-auto max-w-7xl space-y-3 p-4 sm:p-6">
            <Card className="border-border/70 shadow-sm">
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Project dashboard</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-3xl font-bold tracking-tight">{dashboard.project.name}</h1>
                                <Badge variant="outline">Stage {stageLabel}</Badge>
                            </div>
                            <p className="max-w-2xl text-sm text-muted-foreground">
                                {dashboard.project.description || "Progress, workload, and S-curve signal."}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">Due coverage {dueDateCoverage}%</Badge>
                            <Badge variant="outline">Assignment {assignmentCoverage}%</Badge>
                            <Badge variant="outline">{ruleStatusLabel}</Badge>
                        </div>
                    </div>
                    <div className="w-full max-w-[220px] space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">S-curve metric</p>
                        <Combobox
                            value={metric}
                            onChange={(value) => setMetric(value as ApiSCurveMetric)}
                            options={METRIC_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                            placeholder="Select metric"
                            searchPlaceholder="Search metric..."
                            triggerTestId="project-dashboard-metric-combobox"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Execution health</h2>
                <p className="text-sm text-muted-foreground">Overall completion, schedule coverage, and team load.</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
                <Card className="overflow-hidden border-border/70 shadow-sm">
                    <CardHeader className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <CardTitle>Overall progress</CardTitle>
                                <CardDescription>Completion signal.</CardDescription>
                            </div>
                            <Target className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <div className="text-4xl font-semibold tracking-tight" data-testid="project-dashboard-overall-progress-value">
                                    {formatPercentage(overallProgress)}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {taskCompletionSummary.totalTasks > 0
                                        ? `${taskCompletionSummary.completedTasks}/${taskCompletionSummary.totalTasks} tasks completed`
                                        : "No tasks yet"}
                                </p>
                            </div>
                            <div className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                                {overallProgress !== null ? "Tracked" : "Awaiting data"}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="h-2.5 overflow-hidden rounded-full bg-muted/70">
                                <div
                                    className="h-full rounded-full bg-primary transition-[width]"
                                    style={{ width: `${Math.max(0, Math.min(100, overallProgress ?? 0))}%` }}
                                />
                            </div>
                            {overallProgress === null ? (
                                <p className="text-xs text-muted-foreground">Awaiting data.</p>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
                                <p className="mt-1 text-lg font-semibold">{taskCompletionSummary.completedTasks}</p>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
                                <p className="mt-1 text-lg font-semibold">{taskCompletionSummary.openTasks}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm">
                    <CardHeader className="space-y-3">
                        <CardTitle>Schedule status</CardTitle>
                        <CardDescription>Due coverage {dueDateCoverage}%</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Badge
                                variant={isScheduleAllClear ? "outline" : "warning"}
                                className={cn(
                                    "shrink-0 rounded-full",
                                    isScheduleAllClear
                                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : undefined,
                                )}
                            >
                                {isScheduleAllClear ? "All clear" : `${scheduleExceptionCount} attention`}
                            </Badge>
                            <div className="flex h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted/70">
                                {scheduleSummaryLegendItems.map((item) => {
                                    const share = taskCompletionSummary.totalTasks > 0
                                        ? (item.value / taskCompletionSummary.totalTasks) * 100
                                        : 0;
                                    return (
                                        <div
                                            key={item.id}
                                            className={cn("h-full rounded-full", item.barClassName)}
                                            style={{ width: `${share}%` }}
                                            title={`${item.label}: ${item.value}`}
                                        />
                                    );
                                })}
                            </div>
                            {scheduleSummaryLegendItems.length > 0 ? (
                                <TooltipProvider delayDuration={120}>
                                    <div className="hidden shrink-0 items-center gap-1 sm:flex" data-testid="project-dashboard-schedule-legend">
                                        {scheduleSummaryLegendItems.map((item) => (
                                            <Tooltip key={item.id}>
                                                <TooltipTrigger asChild>
                                                    <span
                                                        className={cn("h-2 w-2 rounded-full", item.barClassName)}
                                                        aria-label={`${item.label}: ${item.value}`}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {item.label}: {item.value}
                                                </TooltipContent>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </TooltipProvider>
                            ) : null}
                        </div>
                        {taskCompletionSummary.completedWithoutActualTimestamp > 0 ? (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                                {taskCompletionSummary.completedWithoutActualTimestamp} completed task(s) are still missing `completed_at`.
                            </div>
                        ) : null}
                        {isTasksLoading ? (
                            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                                Loading schedule...
                            </div>
                        ) : (
                            visibleScheduleSummary.map((item) => {
                                const share = taskCompletionSummary.totalTasks > 0
                                    ? (item.value / taskCompletionSummary.totalTasks) * 100
                                    : 0;

                                return (
                                    <div key={item.id} className="space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium">{item.label}</p>
                                                <p className="text-xs text-muted-foreground">{item.description}</p>
                                            </div>
                                            <div
                                                className={cn("text-2xl font-semibold", item.toneClassName)}
                                                data-testid={`project-dashboard-status-${item.id}`}
                                            >
                                                {item.value}
                                            </div>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                                            <div
                                                className={cn("h-full rounded-full transition-[width]", item.barClassName)}
                                                style={{ width: `${share}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <CardTitle>Workload distribution</CardTitle>
                                <CardDescription>Task count by owner.</CardDescription>
                            </div>
                            <Users2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Assigned teammates</p>
                                <p className="mt-1 text-lg font-semibold">{workloadDistribution.assignedMemberCount}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Unassigned tasks</p>
                                <p className="mt-1 text-lg font-semibold">{workloadDistribution.unassignedCount}</p>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Assignment coverage</p>
                                <p className="mt-1 text-lg font-semibold">{assignmentCoverage}%</p>
                                <p className="text-xs text-muted-foreground">Owned tasks</p>
                            </div>
                            <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Top load</p>
                                <p
                                    className="mt-1 truncate text-lg font-semibold"
                                    title={workloadDistribution.topOwner ? workloadDistribution.topOwner.label : "No assignee yet"}
                                >
                                    {workloadDistribution.topOwner ? workloadDistribution.topOwner.label : "No assignee yet"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {workloadDistribution.topOwner
                                        ? `${workloadDistribution.topOwner.count} task(s) assigned`
                                        : "Assign owners"}
                                </p>
                            </div>
                        </div>
                        {isTasksLoading ? (
                            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                                Loading workload...
                            </div>
                        ) : workloadDistribution.rows.length > 0 ? (
                            <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1" data-testid="project-dashboard-workload-list">
                                {workloadDistribution.rows.map((row) => {
                                    const width = workloadDistribution.maxCount > 0
                                        ? (row.count / workloadDistribution.maxCount) * 100
                                        : 0;

                                    return (
                                        <div key={row.id} className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium" title={row.label}>{row.label}</p>
                                                    {row.sublabel ? (
                                                        <p className="truncate text-xs text-muted-foreground" title={row.sublabel}>
                                                            {row.sublabel}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <p className="shrink-0 text-sm font-semibold">{row.count}</p>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-[width]",
                                                        row.id === "__unassigned__" ? "bg-amber-500" : "bg-primary/80",
                                                    )}
                                                    style={{ width: `${width}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                                No workload yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Project pulse</h2>
                <p className="text-sm text-muted-foreground">Actual, planned, variance, and governance for the selected metric.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-border/70 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Actual ({metric})</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="project-dashboard-actual-value">
                            {formatMetricValue(metric, currentActual, chartUnit)}
                        </div>
                        <p className="text-xs text-muted-foreground">{metricCopy.actualDescription}</p>
                    </CardContent>
                </Card>
                <Card className="border-border/70 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Planned ({metric})</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="project-dashboard-planned-value">
                            {formatMetricValue(metric, currentPlan, chartUnit)}
                        </div>
                        <p className="text-xs text-muted-foreground">{metricCopy.plannedDescription}</p>
                    </CardContent>
                </Card>
                <Card className="border-border/70 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Variance</CardTitle>
                        {variance === null ? (
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        ) : variance >= 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            variance === null
                                ? "text-foreground"
                                : variance >= 0
                                    ? "text-emerald-500"
                                    : "text-destructive",
                        )} data-testid="project-dashboard-variance-value">
                            {formatMetricDelta(metric, variance, chartUnit)}
                        </div>
                        <p className="text-xs text-muted-foreground">{metricCopy.varianceDescription}</p>
                    </CardContent>
                </Card>
                <Card className="border-border/70 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Governance</CardTitle>
                        <Badge
                            variant="outline"
                            className={cn("rounded-full", governanceBadgeClassName)}
                        >
                            {governanceBadgeLabel}
                        </Badge>
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <div className={cn(
                            "text-2xl font-bold",
                            ruleIsNeutral ? "text-foreground" : ruleIsPassing ? "text-emerald-500" : "text-destructive",
                        )} data-testid="project-dashboard-governance-value">
                            {ruleStatusLabel}
                        </div>
                        <p className="text-xs text-muted-foreground">Stage {stageLabel}</p>
                        <p className="text-xs text-muted-foreground">
                            {isHealthLoading
                                ? "Refreshing..."
                                : `Source ${metric} · ${health?.data_status ?? "unknown"}`}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">S-curve governance</h2>
                <p className="text-sm text-muted-foreground">{metricCopy.chartDescription}</p>
            </div>

                <Card className="col-span-4 border-border/70 shadow-sm">
                    <CardHeader>
                        <CardTitle>S-Curve Performance</CardTitle>
                        <CardDescription>Planned and actual {metric} over time.</CardDescription>
                    </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                            <XAxis
                                dataKey="date"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => format(new Date(value), "MMM d")}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                domain={isProgressMetric ? [0, 100] : ["auto", "auto"]}
                                tickFormatter={(value) => formatMetricAxisValue(metric, Number(value), chartUnit)}
                            />
                            <RechartsTooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                }}
                                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                                formatter={(value: number | string) => [
                                    formatMetricValue(metric, typeof value === "number" ? value : Number(value), chartUnit),
                                    "",
                                ]}
                                labelFormatter={(label) => format(new Date(label), "MMMM d, yyyy")}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="plan"
                                name={`Planned ${metric}`}
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="5 5"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="actual"
                                name={`Actual ${metric}`}
                                stroke="hsl(var(--primary))"
                                strokeWidth={3}
                                dot={{ fill: "hsl(var(--primary))", r: 4 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
};

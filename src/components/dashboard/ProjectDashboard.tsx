import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { AlertCircle, Calendar, CheckCircle2, Loader2, TrendingUp } from "lucide-react";

import { useProjectDashboard, useProjectSCurveHealth } from "@/api/queries/projects";
import type { ApiSCurveMetric } from "@/api/openapiClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

const METRIC_OPTIONS = [
    { value: "progress", label: "Progress" },
    { value: "hours", label: "Hours" },
    { value: "cost", label: "Cost" },
] as const;

function toMetricValue(value: number | null | undefined, fallback: number) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
    return null;
}

function formatPercentage(value: number | null) {
    if (value === null) return "N/A";
    return `${value.toFixed(1)}%`;
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
    const [metric, setMetric] = useState<ApiSCurveMetric>("progress");
    const { data: dashboard, isLoading, error } = useProjectDashboard(id || "", metric);
    const { data: health, isLoading: isHealthLoading } = useProjectSCurveHealth(id || "", metric);

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

    const currentActual = metric === "progress"
        ? toMetricValue(health?.actual_pct, dashboardActual)
        : toMetricValue(health?.actual_pct, Number.NaN);
    const currentPlan = metric === "progress"
        ? toMetricValue(health?.planned_pct, dashboardPlan)
        : toMetricValue(health?.planned_pct, Number.NaN);
    const variance = metric === "progress"
        ? toMetricValue(health?.variance_pct, dashboardVariance)
        : toMetricValue(health?.variance_pct, Number.NaN);
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
    const isProgressMetric = metric === "progress";
    const chartUnit = dashboard.unit ?? (isProgressMetric ? "%" : "");

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">{dashboard.project.name} Dashboard</h1>
                    <p className="text-muted-foreground">{dashboard.project.description || "Project progress and performance overview."}</p>
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
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Actual ({metric})</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="project-dashboard-actual-value">{formatPercentage(currentActual)}</div>
                        <p className="text-xs text-muted-foreground">Current cumulative actual value</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Planned ({metric})</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="project-dashboard-planned-value">{formatPercentage(currentPlan)}</div>
                        <p className="text-xs text-muted-foreground">Baseline target at current elapsed time</p>
                    </CardContent>
                </Card>
                <Card>
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
                            {variance === null
                                ? "N/A"
                                : `${variance > 0 ? "+" : ""}${formatPercentage(variance)}`}
                        </div>
                        <p className="text-xs text-muted-foreground">Actual minus planned</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Governance</CardTitle>
                        <div className={cn(
                            "h-3 w-3 rounded-full",
                            ruleIsNeutral ? "bg-muted-foreground/60" : ruleIsPassing ? "bg-emerald-500" : "bg-destructive",
                        )} />
                    </CardHeader>
                    <CardContent className="space-y-1">
                        <div className={cn(
                            "text-2xl font-bold",
                            ruleIsNeutral ? "text-foreground" : ruleIsPassing ? "text-emerald-500" : "text-destructive",
                        )} data-testid="project-dashboard-governance-value">
                            {ruleStatusLabel}
                        </div>
                        <p className="text-xs text-muted-foreground">Stage: {stageLabel}</p>
                        <p className="text-xs text-muted-foreground">
                            {isHealthLoading
                                ? "Refreshing health..."
                                : `Metric source: ${metric} · data: ${health?.data_status ?? "unknown"}`}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>S-Curve Performance</CardTitle>
                    <CardDescription>
                        Planned vs actual {metric} over time for this project.
                    </CardDescription>
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
                                unit={isProgressMetric ? "%" : undefined}
                                domain={isProgressMetric ? [0, 100] : ["auto", "auto"]}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                }}
                                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                                formatter={(value: number) => [
                                    `${value}${isProgressMetric ? "%" : chartUnit ? ` ${chartUnit}` : ""}`,
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

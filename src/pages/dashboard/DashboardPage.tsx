import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, Clock, FolderKanban, ShieldCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

import { useAllTasks } from "@/api/queries/tasks";
import {
    useMyProjectScopesQuery,
    usePortfolioSCurveSummary,
    useProjectsQuery,
} from "@/api/queries/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

function truncateLabel(value: string, maxLength = 16) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function DashboardPage() {
    const { data: projects, isLoading: isLoadingProjects } = useProjectsQuery();
    const { tasks, isLoading: isLoadingTasks } = useAllTasks();
    const { data: portfolioSummary, isLoading: isLoadingPortfolio } = usePortfolioSCurveSummary("progress");
    const { data: myScopes, isLoading: isLoadingScopes } = useMyProjectScopesQuery();

    const isLoading = isLoadingProjects || isLoadingTasks || isLoadingPortfolio || isLoadingScopes;
    const safeProjects = useMemo(
        () => (Array.isArray(projects) ? projects : []),
        [projects],
    );
    const totalProjects = safeProjects.length;
    const safeTasks = totalProjects > 0 ? tasks : [];
    const completedTasks = safeTasks.filter((task) => task.status === "done").length;
    const pendingTasks = safeTasks.filter((task) => task.status !== "done").length;
    const projectsWithHealth = useMemo(
        () => (Array.isArray(portfolioSummary?.projects) ? portfolioSummary.projects : []),
        [portfolioSummary?.projects],
    );
    const projectThemeById = useMemo(
        () => new Map(safeProjects.map((project) => [project.id, project.theme_color])),
        [safeProjects],
    );

    const chartData = useMemo(
        () => projectsWithHealth
            .filter(
                (project) =>
                    typeof project.actual_pct === "number"
                    && Number.isFinite(project.actual_pct),
            )
            .map((project) => ({
                shortName: truncateLabel(project.project_name),
                name: project.project_name,
                progress: Math.max(0, Math.min(100, project.actual_pct as number)),
                fill: projectThemeById.get(project.project_id) ?? "hsl(var(--chart-1))",
            })),
        [projectThemeById, projectsWithHealth],
    );
    const fullNameByShortName = useMemo(
        () => new Map(chartData.map((item) => [item.shortName, item.name])),
        [chartData],
    );
    const shouldCompactXAxis = chartData.length >= 6;

    const chartConfig = {
        progress: {
            label: "Progress",
            color: "hsl(var(--chart-1))",
        },
    } satisfies ChartConfig;

    const governanceSummary = useMemo(() => {
        const ruleEvaluatedProjects = projectsWithHealth.filter(
            (project) => typeof project.rule_50_70_pass === "boolean",
        );
        const passCount = ruleEvaluatedProjects.filter((project) => project.rule_50_70_pass === true).length;
        const passRate = ruleEvaluatedProjects.length > 0
            ? Math.round((passCount / ruleEvaluatedProjects.length) * 100)
            : null;
        const attentionCount = projectsWithHealth.filter((project) => {
            if (project.stage === "lag" || project.stage === "decline") return true;
            return typeof project.variance_pct === "number" && project.variance_pct < 0;
        }).length;
        const scopeList = Array.isArray(myScopes) ? myScopes : [];
        const uniquePermissionCount = new Set(
            scopeList.flatMap((scope) => scope.permissions ?? []),
        ).size;

        return {
            passCount,
            passRate,
            supportedRuleCount: ruleEvaluatedProjects.length,
            attentionCount,
            scopedProjectCount: scopeList.length,
            uniquePermissionCount,
        };
    }, [myScopes, projectsWithHealth]);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {["kpi-total", "kpi-active", "kpi-complete", "kpi-governance"].map((skeletonKey) => (
                        <Skeleton key={skeletonKey} className="h-32 rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-[400px] rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="max-w-3xl text-muted-foreground">
                        Start with the portfolio summary, then move into S-curve governance and project progress signals.
                    </p>
                </div>
                <Button asChild>
                    <Link to="/projects">View All Projects</Link>
                </Button>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Portfolio Summary</h3>
                    <p className="text-xs text-muted-foreground">Current scope across accessible projects</p>
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass shadow-sm transition-shadow hover:shadow-md" data-testid="dashboard-kpi-total-projects">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="dashboard-kpi-total-projects-value">{totalProjects}</div>
                        <p className="text-xs text-muted-foreground">Projects you can access</p>
                    </CardContent>
                </Card>
                <Card className="glass shadow-sm transition-shadow hover:shadow-md" data-testid="dashboard-kpi-active-tasks">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="dashboard-kpi-active-tasks-value">{pendingTasks}</div>
                        <p className="text-xs text-muted-foreground">Across accessible projects</p>
                    </CardContent>
                </Card>
                <Card className="glass shadow-sm transition-shadow hover:shadow-md" data-testid="dashboard-kpi-completed-tasks">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed Tasks</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="dashboard-kpi-completed-tasks-value">{completedTasks}</div>
                        <p className="text-xs text-muted-foreground">Done items in current scope</p>
                    </CardContent>
                </Card>
                <Card className="glass shadow-sm transition-shadow hover:shadow-md" data-testid="dashboard-kpi-scurve-pass-rate">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">S-Curve 50/70</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold" data-testid="dashboard-kpi-scurve-pass-rate-value">
                            {governanceSummary.passRate !== null
                                ? `${governanceSummary.passRate}%`
                                : "Not ready"}
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid="dashboard-kpi-scurve-pass-rate-note">
                            {governanceSummary.supportedRuleCount > 0
                                ? `${governanceSummary.passCount}/${governanceSummary.supportedRuleCount} projects passed`
                                : "Awaiting supported rule evaluations"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">S-Curve Governance</h3>
                <p className="text-xs text-muted-foreground">Use progress signals and access coverage together when prioritizing attention.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 min-w-0 glass">
                    <CardHeader>
                        <CardTitle>Project Progress</CardTitle>
                        <CardDescription>Actual progress from portfolio S-curve summary (`actual_pct`).</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-hidden pl-2">
                        {chartData.length > 0 ? (
                            <ChartContainer config={chartConfig} className="h-[320px] w-full overflow-hidden" data-testid="dashboard-project-progress-chart">
                                <BarChart
                                    data={chartData}
                                    margin={{
                                        top: 8,
                                        right: 12,
                                        left: 0,
                                        bottom: shouldCompactXAxis ? 56 : 18,
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="shortName"
                                        tickLine={false}
                                        tickMargin={8}
                                        axisLine={false}
                                        minTickGap={20}
                                        interval={0}
                                        angle={shouldCompactXAxis ? -24 : 0}
                                        textAnchor={shouldCompactXAxis ? "end" : "middle"}
                                        height={shouldCompactXAxis ? 64 : 32}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}%`}
                                    />
                                    <ChartTooltip
                                        content={(
                                            <ChartTooltipContent
                                                labelFormatter={(label) =>
                                                    fullNameByShortName.get(String(label)) ?? String(label)
                                                }
                                            />
                                        )}
                                    />
                                    <Bar dataKey="progress" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                Project progress data will appear here once portfolio summary values are available.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="col-span-3 glass shadow-sm transition-shadow hover:shadow-md">
                    <CardHeader>
                        <CardTitle>Governance Snapshot</CardTitle>
                        <CardDescription>S-curve risk plus project-scope access coverage.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Projects needing attention</p>
                            <p className="text-xl font-semibold">{governanceSummary.attentionCount}</p>
                            <p className="text-xs text-muted-foreground">
                                Lag/decline stage or negative variance against plan
                            </p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Accessible project scopes</p>
                            <p className="text-xl font-semibold">{governanceSummary.scopedProjectCount}</p>
                            <p className="text-xs text-muted-foreground">
                                {governanceSummary.uniquePermissionCount} unique scoped permissions
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ShieldCheck className="h-4 w-4" />
                            Backend remains permission-authoritative; UI uses this as guidance.
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

import { useMemo } from "react";
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
import { Loader2, TrendingUp, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectDashboard } from "@/api/queries/projects";
import { cn } from "@/lib/utils";

export const ProjectDashboard = () => {

    const { id } = useParams<{ id: string }>();
    const { data: dashboard, isLoading, error } = useProjectDashboard(id || "");

    const chartData = useMemo(() => {
        if (!dashboard) return [];

        // Combine plan and actual points by date
        const dateMap: Record<string, { date: string; plan?: number; actual?: number }> = {};

        dashboard.plan.forEach((p) => {
            const dateStr = format(new Date(p.date), "yyyy-MM-dd");
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
            dateMap[dateStr].plan = p.planned_progress;
        });

        dashboard.actual.forEach((a) => {
            const dateStr = format(new Date(a.date), "yyyy-MM-dd");
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr };
            dateMap[dateStr].actual = a.actual;
        });

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

    const currentActual = dashboard.actual.length > 0
        ? dashboard.actual[dashboard.actual.length - 1].actual
        : 0;

    const currentPlan = dashboard.plan.length > 0
        ? dashboard.plan[dashboard.plan.length - 1].planned_progress
        : 0;

    const variance = currentActual - currentPlan;

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{dashboard.project.name} Dashboard</h1>
                <p className="text-muted-foreground">{dashboard.project.description || "Project progress and performance overview."}</p>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Actual Progress</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currentActual}%</div>
                        <p className="text-xs text-muted-foreground">
                            Overall project completion
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Planned Progress</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currentPlan}%</div>
                        <p className="text-xs text-muted-foreground">
                            Target based on project plan
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Variance</CardTitle>
                        {variance >= 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            variance >= 0 ? "text-emerald-500" : "text-destructive"
                        )}>
                            {variance > 0 ? "+" : ""}{variance.toFixed(1)}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Difference from target
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                        <div className={cn(
                            "h-3 w-3 rounded-full",
                            variance >= 0 ? "bg-emerald-500" : "bg-destructive"
                        )} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {variance >= 0 ? "On Track" : "Behind"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Performance health
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* S-Curve Chart */}
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>S-Curve Performance</CardTitle>
                    <CardDescription>
                        Visual Comparison of planned vs. actual progress over time.
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
                                tickFormatter={(val) => format(new Date(val), "MMM d")}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                unit="%"
                                domain={[0, 100]}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                }}
                                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                                formatter={(value: number) => [`${value}%`, ""]}
                                labelFormatter={(label) => format(new Date(label), "MMMM d, yyyy")}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="plan"
                                name="Planned Progress"
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="5 5"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="actual"
                                name="Actual Progress"
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

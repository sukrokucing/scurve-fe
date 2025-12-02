import { useProjectsQuery } from "@/api/queries/projects";
import { useAllTasks } from "@/api/queries/tasks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { CheckCircle2, Clock, FolderKanban, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function DashboardPage() {
    const { data: projects, isLoading: isLoadingProjects } = useProjectsQuery();
    const { tasks, isLoading: isLoadingTasks } = useAllTasks();

    const isLoading = isLoadingProjects || isLoadingTasks;

    // Calculate high-level metrics
    // Calculate high-level metrics
    const totalProjects = projects?.length ?? 0;

    // Safeguard: Ensure tasks are only counted if we have projects
    // This prevents edge cases where tasks might be stale or mismatched
    const safeTasks = totalProjects > 0 ? tasks : [];

    const completedTasks = safeTasks.filter(t => t.status === 'done').length;
    const pendingTasks = safeTasks.filter(t => t.status !== 'done').length;

    const chartData = projects?.map(p => ({
        name: p.name,
        progress: typeof p.progress === 'number' ? p.progress : 0,
        fill: p.theme_color ?? "hsl(var(--chart-1))"
    })) ?? [];

    const chartConfig = {
        progress: {
            label: "Progress",
            color: "hsl(var(--chart-1))",
        },
    } satisfies ChartConfig;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-[400px] rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground">Overview of your workspace activity.</p>
                </div>
                <Button asChild>
                    <Link to="/projects">View All Projects</Link>
                </Button>
            </div>

            {/* Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalProjects}</div>
                        <p className="text-xs text-muted-foreground">+2 from last month</p>
                    </CardContent>
                </Card>
                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingTasks}</div>
                        <p className="text-xs text-muted-foreground">Across all projects</p>
                    </CardContent>
                </Card>
                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{completedTasks}</div>
                        <p className="text-xs text-muted-foreground">+12% completion rate</p>
                    </CardContent>
                </Card>
                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">94%</div>
                        <p className="text-xs text-muted-foreground">+2.5% from last week</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

                {/* Chart Section */}
                <Card className="col-span-4 glass">
                    <CardHeader>
                        <CardTitle>Project Progress</CardTitle>
                        <CardDescription>Real-time progress tracking across active projects.</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        {chartData.length > 0 ? (
                            <ChartContainer config={chartConfig} className="h-[300px] w-full">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        tickLine={false}
                                        tickMargin={10}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}%`}
                                    />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="progress" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        ) : (
                            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                                No project data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity / Projects List */}
                <Card className="col-span-3 glass">
                    <CardHeader>
                        <CardTitle>Recent Projects</CardTitle>
                        <CardDescription>Quick access to your latest work.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            {projects?.slice(0, 5).map((project) => (
                                <div key={project.id} className="flex items-center">
                                    <div className="h-9 w-9 rounded-full border flex items-center justify-center bg-background">
                                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: project.theme_color ?? "hsl(var(--primary))" }} />
                                    </div>
                                    <div className="ml-4 space-y-1">
                                        <p className="text-sm font-medium leading-none">{project.name}</p>
                                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                            {project.description || "No description"}
                                        </p>
                                    </div>
                                    <div className="ml-auto font-medium text-sm">
                                        {typeof project.progress === 'number' ? `${project.progress}%` : "0%"}
                                    </div>
                                </div>
                            ))}
                            {(!projects || projects.length === 0) && (
                                <p className="text-sm text-muted-foreground text-center py-4">No projects found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

import { useProjectsQuery } from "@/api/queries/projects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardPage() {
  const { data: projects, isLoading } = useProjectsQuery();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Projects overview</CardTitle>
          <CardDescription>Recent activity across your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : projects && projects.length > 0 ? (
            <ul className="space-y-4">
              {projects.slice(0, 5).map((project) => (
                <li key={project.id} className="rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{project.name}</span>
                    {typeof project.progress === "number" ? (
                      <span className="text-sm text-muted-foreground">{project.progress}%</span>
                    ) : null}
                  </div>
                  {project.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No projects yet. Create your first project to get started.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
          <CardDescription>Keep your team aligned with project timelines.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>• Add your project milestones to visualize S-curve projections.</li>
            <li>• Invite collaborators and assign project tasks.</li>
            <li>• Sync with the backend to track Gantt progress in real-time.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

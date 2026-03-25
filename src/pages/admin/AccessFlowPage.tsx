import { GitMerge, Search, ShieldCheck } from "lucide-react";
import { HierarchyExplorer } from "@/components/rbac/HierarchyExplorer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const AccessFlowPage = () => {
    return (
        <div className="space-y-8" data-testid="access-flow-page">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                        <GitMerge className="h-6 w-6 text-primary" />
                        Access Flow Explorer
                    </h1>
                    <p className="max-w-3xl text-muted-foreground">
                        Trace permission inheritance from user to role to permission, with a cleaner path for support and onboarding conversations.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <Card className="border-border/70 shadow-sm" data-testid="access-flow-page-intro-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Follow access end to end</CardTitle>
                        <CardDescription>
                            Search for one user, confirm their assigned roles, then inspect the exact permissions granted by the selected role.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            <Search className="mr-1 h-3 w-3" />
                            Search user first
                        </Badge>
                        <Badge variant="outline">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Then inspect assigned roles
                        </Badge>
                        <Badge variant="outline">Use reset scope to start a new trace</Badge>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm" data-testid="access-flow-page-guidance-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Best for support and audit questions</CardTitle>
                        <CardDescription>
                            This view is most useful when someone asks why a user has access, why they do not, or where a permission is inherited from.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground">
                            Keep the scope narrow. A single user and role trace is usually faster to reason about than scanning the whole system.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 shadow-sm" data-testid="access-flow-page-explorer-section">
                <CardHeader className="pb-3">
                    <CardTitle>Access trace</CardTitle>
                    <CardDescription>
                        Start with a user search, then move right through assigned roles and the resulting permissions.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <HierarchyExplorer />
                </CardContent>
            </Card>
        </div>
    );
};

import { Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { PermissionMatrix } from "@/components/rbac/PermissionMatrix";
import { AuditLogDialog } from "@/components/rbac/AuditLogDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


export const PolicyPage = () => {
    return (
        <div className="space-y-5" data-testid="policy-page">
            <div className="flex items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                    <Lock className="h-6 w-6 text-primary" />
                    Access Policy
                </h1>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <Card className="border-border/70 shadow-sm" data-testid="policy-page-intro-card">
                    <CardContent className="flex flex-wrap items-center gap-2 p-3 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Filter first
                        </Badge>
                        <Badge variant="outline">
                            <SlidersHorizontal className="mr-1 h-3 w-3" />
                            Visible cells only
                        </Badge>
                        <Badge variant="outline">Server audit</Badge>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm" data-testid="policy-page-audit-card">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">Recent changes</div>
                            <div className="text-xs text-muted-foreground">Open audit history when you need it.</div>
                        </div>
                        <AuditLogDialog />
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 shadow-sm" data-testid="policy-page-matrix-section">
                <CardHeader className="pb-2">
                    <CardTitle>Policy matrix</CardTitle>
                    <CardDescription>Scope first. Edit visible cells only.</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <PermissionMatrix />
                </CardContent>
            </Card>
        </div>
    );
};

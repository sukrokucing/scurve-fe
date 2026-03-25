import { Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { PermissionMatrix } from "@/components/rbac/PermissionMatrix";
import { AuditLogDialog } from "@/components/rbac/AuditLogDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


export const PolicyPage = () => {
    return (
        <div className="space-y-8" data-testid="policy-page">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                        <Lock className="h-6 w-6 text-primary" />
                        Access Policy
                    </h1>
                    <p className="max-w-3xl text-muted-foreground">
                        Set global RBAC deliberately: filter the scope first, then use the matrix to grant or revoke access with less noise and better auditability.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <Card className="border-border/70 shadow-sm" data-testid="policy-page-intro-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Keep policy work focused</CardTitle>
                        <CardDescription>
                            Use one role, one resource, or one permission search at a time. The matrix stays powerful, but the page should still read like a guided admin workflow.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Filter before editing
                        </Badge>
                        <Badge variant="outline">
                            <SlidersHorizontal className="mr-1 h-3 w-3" />
                            Use bulk actions carefully
                        </Badge>
                        <Badge variant="outline">Audit history stays server-driven</Badge>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm" data-testid="policy-page-audit-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Review recent changes</CardTitle>
                        <CardDescription>
                            Check who changed access, when it happened, and which user or role was affected without leaving policy work.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 pt-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <AuditLogDialog />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Use the audit log when you need to confirm intent before making the next permission change.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 shadow-sm" data-testid="policy-page-matrix-section">
                <CardHeader className="pb-3">
                    <CardTitle>Policy matrix</CardTitle>
                    <CardDescription>
                        Start narrow, use the quick guide if needed, and keep edit mode deliberate so policy changes stay easy to review.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <PermissionMatrix />
                </CardContent>
            </Card>
        </div>
    );
};

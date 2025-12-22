import { Lock, History } from "lucide-react";

import { PermissionMatrix } from "@/components/rbac/PermissionMatrix";
import { AuditLogDialog } from "@/components/rbac/AuditLogDialog";


export const PolicyPage = () => {
    return (
        <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Lock className="h-6 w-6 text-primary" />
                        Access Policy
                    </h1>
                    <p className="text-muted-foreground">
                        Configure global role-based access control (RBAC) policies efficiently.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <AuditLogDialog />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Matrix Area */}
                <div className="lg:col-span-4 space-y-4">
                    <PermissionMatrix />
                </div>
            </div>
        </div>
    );
};

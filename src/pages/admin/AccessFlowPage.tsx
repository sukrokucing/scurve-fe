import { GitMerge } from "lucide-react";
import { HierarchyExplorer } from "@/components/rbac/HierarchyExplorer";

export const AccessFlowPage = () => {
    return (
        <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <GitMerge className="h-6 w-6 text-primary" />
                        Access Flow Explorer
                    </h1>
                    <p className="text-muted-foreground">
                        Visualize how permissions are inherited from Users → Roles → Permissions.
                    </p>
                </div>
            </div>

            <HierarchyExplorer />
        </div>
    );
};

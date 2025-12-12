import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Info, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import { rbacApi, type Role, type Permission } from "@/api/rbac";

export const PermissionMatrix = () => {
    const queryClient = useQueryClient();
    const [toggling, setToggling] = useState<{ roleId: string; permId: string } | null>(null);

    // 1. Fetch available Roles
    const { data: roles, isLoading: loadingRoles } = useQuery({
        queryKey: ["roles"],
        queryFn: rbacApi.listRoles,
    });

    // 2. Fetch available Permissions
    const { data: permissions, isLoading: loadingPerms } = useQuery({
        queryKey: ["permissions"],
        queryFn: rbacApi.listPermissions,
    });

    // 3. Fetch Assigned Permissions for ALL roles
    // In a real app with many roles, this might need optimization or a bulk endpoint.
    // We'll use useQuery for each role to get its permissions.
    // For simplicity in this demo, we'll assume we can just fetch them when we render.
    // A better approach for many roles would be `useQueries`.

    // We will use a map to store: roleId -> Set<permissionId>
    // Since we can't easily use hooks in a loop without useQueries (which is verbose here),
    // we'll create a wrapper component or just fetch them all via a Promise.all in a distinct query.

    const { data: rolePermissionsMap, isLoading: loadingMap } = useQuery({
        queryKey: ["all-role-permissions", roles?.map(r => r.id)],
        queryFn: async () => {
            if (!roles) return {};
            const map: Record<string, Set<string>> = {};
            await Promise.all(roles.map(async (role) => {
                try {
                    const perms = await rbacApi.getRolePermissions(role.id);
                    map[role.id] = new Set(perms.map(p => p.id));
                } catch (e) {
                    console.warn(`Failed to fetch perms for role ${role.id}`, e);
                    map[role.id] = new Set();
                }
            }));
            return map;
        },
        enabled: !!roles && roles.length > 0,
    });

    const assignMutation = useMutation({
        mutationFn: async ({ roleId, permId }: { roleId: string; permId: string }) => {
            // Check if already assigned
            const assigned = rolePermissionsMap?.[roleId]?.has(permId);
            if (assigned) {
                // Revoke permission via API
                await rbacApi.revokePermissionFromRole(roleId, permId);
            } else {
                await rbacApi.assignPermissionToRole(roleId, { permission_id: permId });
            }
        },
        onSuccess: (_, { roleId }) => {
            // Invalidate the map to refetch
            queryClient.invalidateQueries({ queryKey: ["all-role-permissions"] });
            // Also invalidate specific role query used in other components
            queryClient.invalidateQueries({ queryKey: ["role-permissions", roleId] });
            toast.success("Permission updated");
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to update permission");
        },
        onSettled: () => setToggling(null),
    });

    const handleToggle = (roleId: string, permId: string) => {
        setToggling({ roleId, permId });
        assignMutation.mutate({ roleId, permId });
    };

    // Group permissions by Resource
    const groupedPermissions = useMemo(() => {
        if (!permissions) return {};
        const groups: Record<string, Permission[]> = {};

        permissions.forEach(p => {
            // Assume format "resource.action" (e.g. project.create)
            // Or just "resource" if no dot.
            const parts = p.name.split('.');
            // If name is "project.create", resource is "project"
            // If name is "manage_users", resource is "manage_users" (fallback)
            const resource = parts.length > 1 ? parts[0] : "General";
            if (!groups[resource]) groups[resource] = [];
            groups[resource].push(p);
        });

        return groups;
    }, [permissions]);

    const isLoading = loadingRoles || loadingPerms || loadingMap;

    if (isLoading) {
        return <div className="p-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!roles || !permissions) return <div>Failed to load data.</div>;

    const resources = Object.keys(groupedPermissions).sort();

    return (
        <div className="rounded-md border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[300px] font-bold">Resource / Permission</TableHead>
                            {roles.map(role => (
                                <TableHead key={role.id} className="text-center min-w-[120px]">
                                    <div className="flex flex-col items-center gap-1 py-1">
                                        <span className="font-semibold text-foreground">{role.name}</span>
                                        <span className="text-xs font-normal text-muted-foreground line-clamp-1">
                                            {role.description || "No desc"}
                                        </span>
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {resources.map(resource => (
                            <React.Fragment key={resource}>
                                {/* Resource Header Row */}
                                <TableRow key={`res-${resource}`} className="bg-muted/20 hover:bg-muted/30">
                                    <TableCell colSpan={roles.length + 1} className="font-semibold text-primary py-2 px-4 capitalize">
                                        {resource}
                                    </TableCell>
                                </TableRow>

                                {/* Permissions Rows */}
                                {groupedPermissions[resource].map(perm => (
                                    <TableRow key={perm.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{perm.name}</span>
                                                {perm.description && (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{perm.description}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                            </div>
                                        </TableCell>

                                        {roles.map(role => {
                                            const roleId = role.id;
                                            const isAssigned = rolePermissionsMap?.[roleId]?.has(perm.id);
                                            const isProcessing = toggling?.roleId === roleId && toggling?.permId === perm.id;

                                            // Determine interaction state
                                            // If REVOKE is technically impossible (no API), we should visually disable the "assigned" state
                                            // or show a tooltip. For now, we allow clicking but it will error if we try to revoke.

                                            return (
                                                <TableCell key={`${role.id}-${perm.id}`} className="text-center p-0">
                                                    <div
                                                        className={clsx(
                                                            "h-12 w-full flex items-center justify-center cursor-pointer transition-colors",
                                                            isAssigned
                                                                ? "bg-primary/5 hover:bg-primary/10"
                                                                : "hover:bg-muted/50"
                                                        )}
                                                        onClick={() => {
                                                            if (!isProcessing) handleToggle(role.id, perm.id);
                                                        }}
                                                    >
                                                        {isProcessing ? (
                                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                        ) : isAssigned ? (
                                                            <Badge variant="default" className="bg-teal-600 hover:bg-teal-700">
                                                                Allow
                                                            </Badge>
                                                        ) : (
                                                            <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </React.Fragment>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {/* Backend supports revocation; informational note removed */}
        </div>
    );
};

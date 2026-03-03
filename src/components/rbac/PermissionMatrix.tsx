import React, { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

import { rbacApi } from "@/api/rbac";
import type { Permission, Role } from "@/api/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const ALL_ROLES = "__all_roles__";
const ALL_RESOURCES = "__all_resources__";

type ToggleState = { roleId: string; permId: string } | null;
type BulkState = { roleId: string; mode: "grant" | "revoke" } | null;

export const PermissionMatrix = () => {
    const queryClient = useQueryClient();

    const [editMode, setEditMode] = useState(true);
    const [allowGrant, setAllowGrant] = useState(true);
    const [allowRevoke, setAllowRevoke] = useState(true);
    const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
    const [resourceFilter, setResourceFilter] = useState(ALL_RESOURCES);
    const [permissionQueryInput, setPermissionQueryInput] = useState("");
    const [assignedOnly, setAssignedOnly] = useState(false);
    const [toggling, setToggling] = useState<ToggleState>(null);
    const [bulkAction, setBulkAction] = useState<BulkState>(null);
    const debouncedPermissionQuery = useDebouncedValue(permissionQueryInput, 180);
    const deferredPermissionQuery = useDeferredValue(debouncedPermissionQuery);
    const normalizedPermissionQuery = useMemo(
        () => deferredPermissionQuery.trim().toLowerCase(),
        [deferredPermissionQuery],
    );

    const { data: roles, isLoading: loadingRoles } = useQuery({
        queryKey: ["roles"],
        queryFn: rbacApi.listRoles,
    });

    const { data: permissions, isLoading: loadingPerms } = useQuery({
        queryKey: ["permissions"],
        queryFn: rbacApi.listPermissions,
    });
    const roleIds = useMemo(() => (roles ?? []).map((role) => role.id), [roles]);

    const { data: rolePermissionsMap, isLoading: loadingMap } = useQuery({
        queryKey: ["all-role-permissions", roleIds],
        queryFn: async () => {
            if (roleIds.length === 0 || !roles) return {};
            const map: Record<string, Set<string>> = {};

            await Promise.all(
                roles.map(async (role) => {
                    try {
                        const rolePerms = await rbacApi.getRolePermissions(role.id);
                        map[role.id] = new Set(rolePerms.map((perm) => perm.id));
                    } catch (error) {
                        console.warn(`Failed to fetch permissions for role ${role.id}`, error);
                        map[role.id] = new Set();
                    }
                }),
            );

            return map;
        },
        enabled: roleIds.length > 0,
    });

    const groupedPermissions = useMemo(() => {
        if (!permissions) return {} as Record<string, Permission[]>;
        const groups: Record<string, Permission[]> = {};

        permissions.forEach((permission) => {
            const [resourcePart] = permission.name.split(".");
            const resource = resourcePart || "General";
            if (!groups[resource]) groups[resource] = [];
            groups[resource].push(permission);
        });

        Object.keys(groups).forEach((resource) => {
            groups[resource] = [...groups[resource]].sort((a, b) => a.name.localeCompare(b.name));
        });

        return groups;
    }, [permissions]);

    const filteredRoles = useMemo<Role[]>(() => {
        if (!roles) return [];
        if (roleFilter === ALL_ROLES) return roles;
        return roles.filter((role) => role.id === roleFilter);
    }, [roleFilter, roles]);

    const filteredGroupedPermissions = useMemo(() => {
        const next: Record<string, Permission[]> = {};
        const roleIds = filteredRoles.map((role) => role.id);

        Object.entries(groupedPermissions).forEach(([resource, perms]) => {
            if (resourceFilter !== ALL_RESOURCES && resource !== resourceFilter) {
                return;
            }

            const visiblePerms = perms.filter((perm) => {
                const matchesQuery =
                    normalizedPermissionQuery.length === 0
                    || perm.name.toLowerCase().includes(normalizedPermissionQuery)
                    || (perm.description?.toLowerCase().includes(normalizedPermissionQuery) ?? false);

                if (!matchesQuery) return false;
                if (!assignedOnly) return true;

                return roleIds.some((roleId) => rolePermissionsMap?.[roleId]?.has(perm.id));
            });

            if (visiblePerms.length > 0) {
                next[resource] = visiblePerms;
            }
        });

        return next;
    }, [assignedOnly, filteredRoles, groupedPermissions, normalizedPermissionQuery, resourceFilter, rolePermissionsMap]);

    const visibleResources = useMemo(
        () => Object.keys(filteredGroupedPermissions).sort(),
        [filteredGroupedPermissions],
    );

    const visiblePermissionIds = useMemo(
        () => visibleResources.flatMap((resource) => filteredGroupedPermissions[resource].map((perm) => perm.id)),
        [filteredGroupedPermissions, visibleResources],
    );

    const roleOptions = useMemo(
        () => [
            { value: ALL_ROLES, label: "All roles" },
            ...(roles ?? []).map((role) => ({ value: role.id, label: role.name })),
        ],
        [roles],
    );

    const resourceOptions = useMemo(
        () => [
            { value: ALL_RESOURCES, label: "All resources" },
            ...Object.keys(groupedPermissions).sort().map((resource) => ({ value: resource, label: resource })),
        ],
        [groupedPermissions],
    );

    const assignMutation = useMutation({
        mutationFn: async ({ roleId, permId }: { roleId: string; permId: string }) => {
            const assigned = rolePermissionsMap?.[roleId]?.has(permId);
            if (assigned) {
                await rbacApi.revokePermissionFromRole(roleId, permId);
                return "revoke" as const;
            }

            await rbacApi.assignPermissionToRole(roleId, { permission_id: permId });
            return "grant" as const;
        },
        onSuccess: (_, { roleId }) => {
            queryClient.invalidateQueries({ queryKey: ["all-role-permissions"] });
            queryClient.invalidateQueries({ queryKey: ["role-permissions", roleId] });
            toast.success("Permission updated");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to update permission");
        },
        onSettled: () => setToggling(null),
    });

    const bulkMutation = useMutation({
        mutationFn: async ({
            roleId,
            permissionIds,
            mode,
        }: {
            roleId: string;
            permissionIds: string[];
            mode: "grant" | "revoke";
        }) => {
            const assignedSet = rolePermissionsMap?.[roleId] ?? new Set<string>();
            const actionableIds = permissionIds.filter((permissionId) =>
                mode === "grant" ? !assignedSet.has(permissionId) : assignedSet.has(permissionId),
            );

            if (actionableIds.length === 0) {
                return { changed: 0 };
            }

            await Promise.all(
                actionableIds.map((permissionId) =>
                    mode === "grant"
                        ? rbacApi.assignPermissionToRole(roleId, { permission_id: permissionId })
                        : rbacApi.revokePermissionFromRole(roleId, permissionId),
                ),
            );

            return { changed: actionableIds.length };
        },
        onSuccess: ({ changed }, { roleId, mode }) => {
            queryClient.invalidateQueries({ queryKey: ["all-role-permissions"] });
            queryClient.invalidateQueries({ queryKey: ["role-permissions", roleId] });
            const verb = mode === "grant" ? "granted" : "revoked";
            toast.success(`Bulk update complete: ${changed} ${verb}`);
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Bulk permission update failed");
        },
        onSettled: () => setBulkAction(null),
    });

    const canMutate = editMode;
    const isLoading = loadingRoles || loadingPerms || loadingMap;

    const totalVisiblePermissions = visiblePermissionIds.length;
    const totalVisibleCells = filteredRoles.length * totalVisiblePermissions;

    const canToggleCell = (isAssigned: boolean) => {
        if (!canMutate) return false;
        if (isAssigned) return allowRevoke;
        return allowGrant;
    };

    const handleToggle = (roleId: string, permId: string, isAssigned: boolean) => {
        if (!canToggleCell(isAssigned)) return;
        if (toggling || bulkAction) return;
        setToggling({ roleId, permId });
        assignMutation.mutate({ roleId, permId });
    };

    const handleBulkForRole = (roleId: string, mode: "grant" | "revoke") => {
        if (!editMode) return;
        if (mode === "grant" && !allowGrant) return;
        if (mode === "revoke" && !allowRevoke) return;

        setBulkAction({ roleId, mode });
        bulkMutation.mutate({ roleId, permissionIds: visiblePermissionIds, mode });
    };

    if (isLoading) {
        return (
            <div className="p-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!roles || !permissions) {
        return <div>Failed to load data.</div>;
    }

    return (
        <div className="rounded-md border bg-card shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-3">
                <Button
                    type="button"
                    variant={editMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setEditMode((prev) => !prev)}
                    data-testid="rbac-edit-mode-toggle"
                >
                    Edit
                </Button>
                <Button
                    type="button"
                    variant={allowGrant ? "secondary" : "outline"}
                    size="sm"
                    disabled={!editMode}
                    onClick={() => setAllowGrant((prev) => !prev)}
                    data-testid="rbac-grant-toggle"
                >
                    Grant
                </Button>
                <Button
                    type="button"
                    variant={allowRevoke ? "secondary" : "outline"}
                    size="sm"
                    disabled={!editMode}
                    onClick={() => setAllowRevoke((prev) => !prev)}
                    data-testid="rbac-revoke-toggle"
                >
                    Revoke
                </Button>
                <Combobox
                    value={roleFilter}
                    onChange={setRoleFilter}
                    options={roleOptions}
                    className="w-[170px]"
                    placeholder="All roles"
                    searchPlaceholder="Search roles..."
                    triggerAriaLabel="Filter roles"
                    triggerTestId="rbac-role-filter-combobox"
                />
                <Combobox
                    value={resourceFilter}
                    onChange={setResourceFilter}
                    options={resourceOptions}
                    className="w-[190px]"
                    placeholder="All resources"
                    searchPlaceholder="Search resources..."
                    triggerAriaLabel="Filter resources"
                    triggerTestId="rbac-resource-filter-combobox"
                />
                <Input
                    value={permissionQueryInput}
                    onChange={(event) => setPermissionQueryInput(event.target.value)}
                    placeholder="Search permissions..."
                    className="h-11 w-[240px]"
                    data-testid="rbac-permission-search-input"
                />
                <Button
                    type="button"
                    variant={assignedOnly ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setAssignedOnly((prev) => !prev)}
                    data-testid="rbac-assigned-only-toggle"
                >
                    Assigned only
                </Button>
                <div className="ml-auto text-xs text-muted-foreground">
                    {filteredRoles.length} role(s) • {totalVisiblePermissions} permission(s) • {totalVisibleCells} cell(s)
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[320px] font-bold">Resource / Permission</TableHead>
                            {filteredRoles.map((role) => {
                                const roleBusy = bulkAction?.roleId === role.id && bulkMutation.isPending;
                                return (
                                    <TableHead key={role.id} className="text-center min-w-[170px]">
                                        <div className="flex flex-col items-center gap-1 py-1">
                                            <span className="font-semibold text-foreground">{role.name}</span>
                                            <span className="text-xs font-normal text-muted-foreground line-clamp-1" title={role.description || "No desc"}>
                                                {role.description || "No desc"}
                                            </span>
                                            <div className="flex items-center gap-1 pt-1">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-2 text-xs"
                                                    disabled={!editMode || !allowGrant || totalVisiblePermissions === 0 || roleBusy}
                                                    onClick={() => handleBulkForRole(role.id, "grant")}
                                                    data-testid={`rbac-role-grant-visible-${role.id}`}
                                                >
                                                    + Visible
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 px-2 text-xs"
                                                    disabled={!editMode || !allowRevoke || totalVisiblePermissions === 0 || roleBusy}
                                                    onClick={() => handleBulkForRole(role.id, "revoke")}
                                                    data-testid={`rbac-role-revoke-visible-${role.id}`}
                                                >
                                                    - Visible
                                                </Button>
                                            </div>
                                        </div>
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibleResources.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={filteredRoles.length + 1} className="h-20 text-center text-muted-foreground">
                                    No permissions match the current granular filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            visibleResources.map((resource) => (
                                <React.Fragment key={resource}>
                                    <TableRow className="bg-muted/20 hover:bg-muted/30">
                                        <TableCell colSpan={filteredRoles.length + 1} className="font-semibold text-primary py-2 px-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="capitalize">{resource}</span>
                                                <span className="text-xs font-normal text-muted-foreground">
                                                    {filteredGroupedPermissions[resource].length} permission(s)
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    {filteredGroupedPermissions[resource].map((permission) => (
                                        <TableRow key={permission.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">{permission.name}</span>
                                                    {permission.description && (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-1"
                                                                        aria-label={`Permission info for ${permission.name}`}
                                                                    >
                                                                        <Info className="h-4 w-4" />
                                                                    </button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>{permission.description}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {filteredRoles.map((role) => {
                                                const roleId = role.id;
                                                const isAssigned = rolePermissionsMap?.[roleId]?.has(permission.id) ?? false;
                                                const isCellBusy =
                                                    (toggling?.roleId === roleId && toggling?.permId === permission.id)
                                                    || (bulkAction?.roleId === roleId && bulkMutation.isPending);
                                                const canToggle = canToggleCell(isAssigned);
                                                const permissionAction = isAssigned ? "Revoke" : "Grant";
                                                const permissionState = isAssigned ? "allowed" : "not allowed";
                                                const permissionCellLabel = isCellBusy
                                                    ? `Updating ${permission.name} permission for role ${role.name}`
                                                    : `${permissionAction} ${permission.name} permission for role ${role.name} (${permissionState})`;

                                                return (
                                                    <TableCell key={`${roleId}-${permission.id}`} className="text-center p-0">
                                                        <button
                                                            type="button"
                                                            className={clsx(
                                                                "h-12 w-full flex items-center justify-center transition-colors",
                                                                canToggle
                                                                    ? (isAssigned ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50")
                                                                    : "bg-muted/20 opacity-60 cursor-not-allowed",
                                                            )}
                                                            disabled={!canToggle || isCellBusy}
                                                            onClick={() => handleToggle(roleId, permission.id, isAssigned)}
                                                            aria-label={permissionCellLabel}
                                                            aria-pressed={isAssigned}
                                                            aria-busy={isCellBusy || undefined}
                                                            title={permissionCellLabel}
                                                            data-testid={`rbac-permission-cell-${roleId}-${permission.id}`}
                                                        >
                                                            {isCellBusy ? (
                                                                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />
                                                            ) : isAssigned ? (
                                                                <Badge variant="default">
                                                                    Allow
                                                                </Badge>
                                                            ) : (
                                                                <div aria-hidden="true" className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                                                            )}
                                                        </button>
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </React.Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

import { rbacApi } from "@/api/rbac";
import type { Permission, Role } from "@/api/rbac";
import { rbacKeys, usePermissionsQuery, useRolesWithPermissionsQuery } from "@/api/queries/rbac";
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
import { useMedia } from "@/hooks/vendor/reactUse";

const ALL_ROLES = "__all_roles__";
const ALL_RESOURCES = "__all_resources__";

type ToggleState = { roleId: string; permId: string } | null;
type BulkState = { roleId: string; mode: "grant" | "revoke" } | null;
type MatrixRow =
    | { kind: "resource"; resource: string; permissionCount: number }
    | { kind: "permission"; resource: string; permission: Permission };
const matrixColumnHelper = createColumnHelper<MatrixRow>();

export const PermissionMatrix = () => {
    const queryClient = useQueryClient();

    const [editMode, setEditMode] = useState(false);
    const [allowGrant, setAllowGrant] = useState(true);
    const [allowRevoke, setAllowRevoke] = useState(true);
    const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
    const [resourceFilter, setResourceFilter] = useState(ALL_RESOURCES);
    const [permissionQueryInput, setPermissionQueryInput] = useState("");
    const [assignedOnly, setAssignedOnly] = useState(false);
    const [toggling, setToggling] = useState<ToggleState>(null);
    const [bulkAction, setBulkAction] = useState<BulkState>(null);
    const [showQuickStart, setShowQuickStart] = useState(true);
    const isMobileViewport = useMedia("(max-width: 1023px)", false);
    const [showAdvancedMatrix, setShowAdvancedMatrix] = useState(false);
    const debouncedPermissionQuery = useDebouncedValue(permissionQueryInput, 180);
    const deferredPermissionQuery = useDeferredValue(debouncedPermissionQuery);
    const normalizedPermissionQuery = useMemo(
        () => deferredPermissionQuery.trim().toLowerCase(),
        [deferredPermissionQuery],
    );

    const { data: rolesWithPermissions = [], isLoading: loadingRolesWithPermissions } = useRolesWithPermissionsQuery();
    const { data: permissions, isLoading: loadingPerms } = usePermissionsQuery();

    const roles = useMemo<Role[]>(
        () => rolesWithPermissions.map((entry) => entry.role),
        [rolesWithPermissions],
    );

    const rolePermissionsMap = useMemo<Record<string, Set<string>>>(() => {
        const map: Record<string, Set<string>> = {};
        rolesWithPermissions.forEach(({ role, permissions: rolePermissions }) => {
            map[role.id] = new Set(rolePermissions.map((permission) => permission.id));
        });
        return map;
    }, [rolesWithPermissions]);

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
    const selectedRole = useMemo(
        () => (roleFilter === ALL_ROLES ? null : roles.find((role) => role.id === roleFilter) ?? null),
        [roleFilter, roles],
    );
    const activeFilterSummary = useMemo(() => {
        const summary: string[] = [];
        if (roleFilter !== ALL_ROLES && selectedRole) {
            summary.push(`Role: ${selectedRole.name}`);
        }
        if (resourceFilter !== ALL_RESOURCES) {
            summary.push(`Resource: ${resourceFilter}`);
        }
        if (normalizedPermissionQuery) {
            summary.push(`Search: ${permissionQueryInput.trim()}`);
        }
        if (assignedOnly) {
            summary.push("Assigned only");
        }
        return summary;
    }, [assignedOnly, normalizedPermissionQuery, permissionQueryInput, resourceFilter, roleFilter, selectedRole]);

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
    const matrixRows = useMemo<MatrixRow[]>(() => {
        const rows: MatrixRow[] = [];
        visibleResources.forEach((resource) => {
            const permissionsForResource = filteredGroupedPermissions[resource] ?? [];
            rows.push({
                kind: "resource",
                resource,
                permissionCount: permissionsForResource.length,
            });
            permissionsForResource.forEach((permission) => {
                rows.push({
                    kind: "permission",
                    resource,
                    permission,
                });
            });
        });
        return rows;
    }, [filteredGroupedPermissions, visibleResources]);

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
    const canFocusFirstRole = roleFilter === ALL_ROLES && roles.length > 0;

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
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolesWithPermissions });
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolePermissions(roleId) });
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
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolesWithPermissions });
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolePermissions(roleId) });
            const verb = mode === "grant" ? "granted" : "revoked";
            toast.success(`Bulk update complete: ${changed} ${verb}`);
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Bulk permission update failed");
        },
        onSettled: () => setBulkAction(null),
    });

    const canMutate = editMode;
    const isLoading = loadingRolesWithPermissions || loadingPerms;

    const totalVisiblePermissions = visiblePermissionIds.length;
    const totalVisibleCells = filteredRoles.length * totalVisiblePermissions;

    useEffect(() => {
        if (!isMobileViewport) {
            setShowAdvancedMatrix(false);
        }
    }, [isMobileViewport]);

    useEffect(() => {
        if (isMobileViewport && editMode) {
            setShowAdvancedMatrix(true);
        }
    }, [editMode, isMobileViewport]);

    const summaryRole = filteredRoles.length === 1 ? filteredRoles[0] : null;
    const resourceSummaries = useMemo(() => {
        const assignedSet = summaryRole ? rolePermissionsMap?.[summaryRole.id] : undefined;
        return visibleResources.map((resource) => {
            const permissionsForResource = filteredGroupedPermissions[resource] ?? [];
            const assignedCount = assignedSet
                ? permissionsForResource.reduce(
                    (count, permission) => (assignedSet.has(permission.id) ? count + 1 : count),
                    0,
                )
                : null;

            return {
                resource,
                totalPermissions: permissionsForResource.length,
                assignedCount,
                preview: permissionsForResource.slice(0, 3).map((permission) => permission.name),
            };
        });
    }, [filteredGroupedPermissions, rolePermissionsMap, summaryRole, visibleResources]);

    const canToggleCell = useCallback((isAssigned: boolean) => {
        if (!canMutate) return false;
        if (isAssigned) return allowRevoke;
        return allowGrant;
    }, [allowGrant, allowRevoke, canMutate]);

    const handleToggle = useCallback((roleId: string, permId: string, isAssigned: boolean) => {
        if (!canToggleCell(isAssigned)) return;
        if (toggling || bulkAction) return;
        setToggling({ roleId, permId });
        assignMutation.mutate({ roleId, permId });
    }, [assignMutation, bulkAction, canToggleCell, toggling]);

    const handleBulkForRole = useCallback((roleId: string, mode: "grant" | "revoke") => {
        if (!editMode) return;
        if (mode === "grant" && !allowGrant) return;
        if (mode === "revoke" && !allowRevoke) return;

        setBulkAction({ roleId, mode });
        bulkMutation.mutate({ roleId, permissionIds: visiblePermissionIds, mode });
    }, [allowGrant, allowRevoke, bulkMutation, editMode, visiblePermissionIds]);
    const handleFocusFirstRole = useCallback(() => {
        if (roles.length === 0) return;
        setRoleFilter(roles[0].id);
    }, [roles]);
    const handleResetFilters = useCallback(() => {
        setRoleFilter(ALL_ROLES);
        setResourceFilter(ALL_RESOURCES);
        setPermissionQueryInput("");
        setAssignedOnly(false);
        setEditMode(false);
        setAllowGrant(true);
        setAllowRevoke(true);
    }, []);

    const matrixColumns = useMemo<ColumnDef<MatrixRow, unknown>[]>(() => ([
        matrixColumnHelper.display({
            id: "resourcePermission",
            header: () => <span className="font-bold">Resource / Permission</span>,
            cell: (info) => {
                const row = info.row.original;
                if (row.kind !== "permission") return null;
                return (
                    <div className="flex items-center gap-2">
                        <span className="text-sm">{row.permission.name}</span>
                        {row.permission.description ? (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-1"
                                            aria-label={`Permission info for ${row.permission.name}`}
                                        >
                                            <Info className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{row.permission.description}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : null}
                    </div>
                );
            },
        }),
        ...filteredRoles.map((role) => matrixColumnHelper.display({
            id: `role-${role.id}`,
            header: () => {
                const roleBusy = bulkAction?.roleId === role.id && bulkMutation.isPending;
                return (
                    <div className="flex min-w-[170px] flex-col items-center gap-1 py-1 text-center">
                        <span className="font-semibold text-foreground">{role.name}</span>
                        <span className="line-clamp-1 text-xs font-normal text-muted-foreground" title={role.description || "No desc"}>
                            {role.description || "No desc"}
                        </span>
                        {editMode ? (
                            <div className="flex items-center gap-1 pt-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-9 px-2 text-xs"
                                    disabled={!allowGrant || totalVisiblePermissions === 0 || roleBusy}
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
                                    disabled={!allowRevoke || totalVisiblePermissions === 0 || roleBusy}
                                    onClick={() => handleBulkForRole(role.id, "revoke")}
                                    data-testid={`rbac-role-revoke-visible-${role.id}`}
                                >
                                    - Visible
                                </Button>
                            </div>
                        ) : (
                            <span className="pt-1 text-[11px] text-muted-foreground">
                                Read-only
                            </span>
                        )}
                    </div>
                );
            },
            cell: (info) => {
                const row = info.row.original;
                if (row.kind !== "permission") return null;
                const roleId = role.id;
                const permissionId = row.permission.id;
                const isAssigned = rolePermissionsMap?.[roleId]?.has(permissionId) ?? false;
                const isCellBusy =
                    (toggling?.roleId === roleId && toggling?.permId === permissionId)
                    || (bulkAction?.roleId === roleId && bulkMutation.isPending);
                const canToggle = canToggleCell(isAssigned);
                const permissionAction = isAssigned ? "Revoke" : "Grant";
                const permissionState = isAssigned ? "allowed" : "not allowed";
                const permissionCellLabel = isCellBusy
                    ? `Updating ${row.permission.name} permission for role ${role.name}`
                    : `${permissionAction} ${row.permission.name} permission for role ${role.name} (${permissionState})`;

                return (
                    <button
                        type="button"
                        className={clsx(
                            "h-12 w-full flex items-center justify-center transition-colors",
                            canToggle
                                ? (isAssigned ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50")
                                : "bg-muted/20 opacity-60 cursor-not-allowed",
                        )}
                        disabled={!canToggle || isCellBusy}
                        onClick={() => handleToggle(roleId, permissionId, isAssigned)}
                        aria-label={permissionCellLabel}
                        aria-pressed={isAssigned}
                        aria-busy={isCellBusy || undefined}
                        title={permissionCellLabel}
                        data-testid={`rbac-permission-cell-${roleId}-${permissionId}`}
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
                );
            },
        })),
    ]), [
        allowGrant,
        allowRevoke,
        bulkAction?.roleId,
        bulkMutation.isPending,
        canToggleCell,
        editMode,
        filteredRoles,
        handleBulkForRole,
        handleToggle,
        rolePermissionsMap,
        toggling?.permId,
        toggling?.roleId,
        totalVisiblePermissions,
    ]);

    const matrixTable = useReactTable({
        data: matrixRows,
        columns: matrixColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (row) => row.kind === "resource" ? `resource-${row.resource}` : row.permission.id,
    });

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
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-3" data-testid="rbac-controls-bar">
                <Button
                    type="button"
                    variant={editMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setEditMode((prev) => !prev)}
                    data-testid="rbac-edit-mode-toggle"
                >
                    {editMode ? "Exit edit mode" : "Edit permissions"}
                </Button>
                {editMode ? (
                    <>
                        <Button
                            type="button"
                            variant={allowGrant ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setAllowGrant((prev) => !prev)}
                            data-testid="rbac-grant-toggle"
                        >
                            Allow grants
                        </Button>
                        <Button
                            type="button"
                            variant={allowRevoke ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setAllowRevoke((prev) => !prev)}
                            data-testid="rbac-revoke-toggle"
                        >
                            Allow revokes
                        </Button>
                    </>
                ) : (
                    <Badge variant="outline" className="h-8 px-2 text-[11px]">
                        Review mode
                    </Badge>
                )}
                <Combobox
                    value={roleFilter}
                    onChange={setRoleFilter}
                    options={roleOptions}
                    className="w-full sm:w-[170px]"
                    placeholder="All roles"
                    searchPlaceholder="Search roles..."
                    triggerAriaLabel="Filter roles"
                    triggerTestId="rbac-role-filter-combobox"
                />
                <Combobox
                    value={resourceFilter}
                    onChange={setResourceFilter}
                    options={resourceOptions}
                    className="w-full sm:w-[190px]"
                    placeholder="All resources"
                    searchPlaceholder="Search resources..."
                    triggerAriaLabel="Filter resources"
                    triggerTestId="rbac-resource-filter-combobox"
                />
                <Input
                    value={permissionQueryInput}
                    onChange={(event) => setPermissionQueryInput(event.target.value)}
                    placeholder="Search permissions..."
                    className="h-11 w-full sm:w-[240px]"
                    data-testid="rbac-permission-search-input"
                />
                <Button
                    type="button"
                    variant={assignedOnly ? "secondary" : "outline"}
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setAssignedOnly((prev) => !prev)}
                    data-testid="rbac-assigned-only-toggle"
                >
                    Assigned only
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setShowQuickStart((prev) => !prev)}
                    data-testid="rbac-toggle-help-button"
                >
                    {showQuickStart ? "Hide guide" : "Show guide"}
                </Button>
                <div className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    {filteredRoles.length} role(s) • {totalVisiblePermissions} permission(s) • {totalVisibleCells} cell(s)
                </div>
            </div>
            <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground" data-testid="rbac-filter-summary">
                <div className="flex flex-wrap items-center gap-2">
                    {activeFilterSummary.length > 0 ? (
                        <>
                            {activeFilterSummary.map((item) => (
                                <Badge key={item} variant="outline">
                                    {item}
                                </Badge>
                            ))}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2"
                                onClick={handleResetFilters}
                                data-testid="rbac-filter-summary-reset-button"
                            >
                                Reset filters
                            </Button>
                        </>
                    ) : (
                        <span>All roles and resources are visible. Search narrows permission names when needed.</span>
                    )}
                </div>
            </div>
            {showQuickStart ? (
                <div className="border-b bg-background px-3 py-3 text-xs text-muted-foreground" data-testid="rbac-quick-start-panel">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-foreground">Quick start (recommended order)</div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleFocusFirstRole}
                                disabled={!canFocusFirstRole}
                                data-testid="rbac-focus-first-role-button"
                            >
                                Focus first role
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleResetFilters}
                                data-testid="rbac-reset-filters-button"
                            >
                                Reset filters
                            </Button>
                        </div>
                    </div>
                    <div className="mt-2 grid gap-2 lg:grid-cols-3">
                        <p>
                            1. Filter to one role first{selectedRole ? ` (${selectedRole.name})` : ""} so permission changes are easy to verify.
                        </p>
                        <p>
                            2. Narrow by resource/search, then use <span className="font-medium text-foreground">Assigned only</span> for quick audits.
                        </p>
                        <p>
                            3. Enter edit mode and apply grant/revoke intentionally. Verify outcome in Audit Log after changes.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="border-b bg-background px-3 py-2 text-xs text-muted-foreground">
                    Tip: filter to one role, then enable edit mode to make precise grant/revoke changes with less noise.
                </div>
            )}

            {isMobileViewport && !showAdvancedMatrix ? (
                <div className="space-y-3 border-b bg-background px-3 py-3" data-testid="rbac-mobile-basic-mode">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-medium">Mobile basic mode</div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAdvancedMatrix(true)}
                            data-testid="rbac-mobile-open-matrix-button"
                        >
                            Open full matrix
                        </Button>
                    </div>
                    {summaryRole ? (
                        <p className="text-xs text-muted-foreground">
                            Summary is scoped to role <span className="font-medium text-foreground">{summaryRole.name}</span>.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Filter to a single role to view assignment coverage per resource.
                        </p>
                    )}
                    <div className="grid gap-2">
                        {resourceSummaries.length === 0 ? (
                            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                No resources match current filters.
                            </div>
                        ) : (
                            resourceSummaries.map((summary) => (
                                <div key={summary.resource} className="space-y-1 rounded-md border bg-card px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium capitalize">{summary.resource}</span>
                                        <Badge variant="outline" className="text-[11px]">
                                            {summary.totalPermissions} permission(s)
                                        </Badge>
                                    </div>
                                    {typeof summary.assignedCount === "number" ? (
                                        <div className="text-xs text-muted-foreground">
                                            {summary.assignedCount} assigned
                                        </div>
                                    ) : null}
                                    <div
                                        className="text-xs text-muted-foreground line-clamp-1"
                                        title={summary.preview.join(", ")}
                                    >
                                        {summary.preview.join(", ") || "No visible permissions"}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : null}

            {isMobileViewport && showAdvancedMatrix ? (
                <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Advanced matrix mode</span>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowAdvancedMatrix(false)}
                        data-testid="rbac-mobile-close-matrix-button"
                    >
                        Back to basic
                    </Button>
                </div>
            ) : null}

            {!isMobileViewport || showAdvancedMatrix ? (
                <div className="overflow-x-auto" data-testid="rbac-matrix-scroll">
                    <Table className="min-w-[900px]">
                        <TableHeader>
                            {matrixTable.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id} className="bg-muted/50">
                                    {headerGroup.headers.map((header) => (
                                        <TableHead key={header.id} className={header.id === "resourcePermission" ? "w-[320px] font-bold" : "text-center"}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {visibleResources.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={filteredRoles.length + 1} className="h-20 text-center text-muted-foreground">
                                        No permissions match the current granular filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                matrixTable.getRowModel().rows.map((row) => {
                                    if (row.original.kind === "resource") {
                                        return (
                                            <TableRow key={row.id} className="bg-muted/20 hover:bg-muted/30">
                                                <TableCell colSpan={filteredRoles.length + 1} className="font-semibold text-primary py-2 px-4">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="capitalize">{row.original.resource}</span>
                                                        <span className="text-xs font-normal text-muted-foreground">
                                                            {row.original.permissionCount} permission(s)
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }

                                    return (
                                        <TableRow key={row.id}>
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell
                                                    key={cell.id}
                                                    className={cell.column.id === "resourcePermission" ? "font-medium" : "text-center p-2"}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            ) : null}
        </div>
    );
};

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, Plus, User as UserIcon, Loader2, Check, ShieldCheck, KeyRound, ScanSearch } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import {
    TableCell,
    TableRow,
} from "@/components/ui/table";
import { AppDataTable } from "@/components/ui/app-data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
    Dialog,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";

import {
    useAssignRoleToUserMutation,
    useRevokeRoleFromUserMutation,
    useRolesQuery,
    useUserEffectivePermissionsQuery,
    useUserRolesQuery,
} from "@/api/queries/rbac";
import { useUsersLookupQuery } from "@/api/queries/users";
import { useClientPagination } from "@/hooks/useClientPagination";
import { useMedia } from "@/hooks/vendor/reactUse";
import { rbacApi, type Role } from "@/api/rbac";
import { assignRoleSchema, type AssignRoleValues } from "@/schemas/user-access";

const ALL_PERMISSION_DOMAINS = "__all_permission_domains__";
const LAPTOP_PERMISSION_FOCUS_THRESHOLD = 8;
const PREFERRED_PERMISSION_DOMAIN_ORDER = [
    "project",
    "task",
    "member",
    "resource_role",
    "work_log",
    "role",
    "permission",
    "dashboard",
] as const;
type EffectivePermissionRow = NonNullable<Awaited<ReturnType<typeof rbacApi.getUserEffectivePermissions>>["permissions"]>[number];
const effectivePermissionColumnHelper = createColumnHelper<EffectivePermissionRow>();

export const UserAccessPage = () => {
    const { userId } = useParams<{ userId: string }>();
    const safeUserId = userId ?? "";
    const [assignOpen, setAssignOpen] = useState(false);
    const [revokeRole, setRevokeRole] = useState<Role | null>(null);
    const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
    const [permissionDomainFilter, setPermissionDomainFilter] = useState(ALL_PERMISSION_DOMAINS);
    const [permissionFocusDismissed, setPermissionFocusDismissed] = useState(false);
    const [autoFocusedPermissionDomain, setAutoFocusedPermissionDomain] = useState<string | null>(null);
    const isLaptopViewport = useMedia("(min-width: 1024px) and (max-width: 1439px)", false);

    // --- Queries ---
    const { data: userRoles, isLoading: loadingRoles } = useUserRolesQuery(safeUserId, { enabled: Boolean(userId) });

    const { data: effectivePerms, isLoading: loadingPerms } = useUserEffectivePermissionsQuery(safeUserId, { enabled: Boolean(userId) });

    const { data: allRoles } = useRolesQuery({ enabled: Boolean(userId) });
    const { data: usersLookup } = useUsersLookupQuery({ enabled: Boolean(userId) });
    const selectedUser = useMemo(
        () => usersLookup?.users.find((user) => user.id === safeUserId),
        [safeUserId, usersLookup?.users],
    );
    const permissionRows = useMemo(
        () => effectivePerms?.permissions ?? [],
        [effectivePerms?.permissions],
    );
    const permissionDomains = useMemo(
        () => Array.from(new Set(
            permissionRows.map((permission) => permission.name.split(".")[0] || "general"),
        )).sort(),
        [permissionRows],
    );
    const preferredPermissionDomain = useMemo(() => {
        for (const preferredDomain of PREFERRED_PERMISSION_DOMAIN_ORDER) {
            if (permissionDomains.includes(preferredDomain)) {
                return preferredDomain;
            }
        }
        return permissionDomains[0] ?? null;
    }, [permissionDomains]);
    const shouldAutoFocusPermissionDomain = isLaptopViewport
        && permissionRows.length > LAPTOP_PERMISSION_FOCUS_THRESHOLD
        && !permissionFocusDismissed
        && permissionDomainFilter === ALL_PERMISSION_DOMAINS;
    const filteredPermissions = useMemo(
        () => permissionDomainFilter === ALL_PERMISSION_DOMAINS
            ? permissionRows
            : permissionRows.filter((permission) => (permission.name.split(".")[0] || "general") === permissionDomainFilter),
        [permissionDomainFilter, permissionRows],
    );
    const permissionsPagination = useClientPagination(filteredPermissions, { initialPageSize: 20 });
    const permissionDomainOptions = useMemo(
        () => [
            { value: ALL_PERMISSION_DOMAINS, label: "All permission domains" },
            ...permissionDomains.map((domain) => ({
                value: domain,
                label: domain.replace(/_/g, " "),
            })),
        ],
        [permissionDomains],
    );
    const isAutoFocusedPermissionDomain = Boolean(
        permissionDomainFilter !== ALL_PERMISSION_DOMAINS
        && autoFocusedPermissionDomain === permissionDomainFilter,
    );
    const activePermissionDomainLabel = permissionDomainFilter === ALL_PERMISSION_DOMAINS
        ? "All permission domains"
        : `Domain: ${permissionDomainFilter}`;

    useEffect(() => {
        if (!shouldAutoFocusPermissionDomain || !preferredPermissionDomain) return;
        setPermissionDomainFilter(preferredPermissionDomain);
        setAutoFocusedPermissionDomain(preferredPermissionDomain);
    }, [preferredPermissionDomain, shouldAutoFocusPermissionDomain]);

    const handlePermissionDomainChange = useCallback((value: string) => {
        setPermissionDomainFilter(value || ALL_PERMISSION_DOMAINS);
        setPermissionFocusDismissed(true);
        setAutoFocusedPermissionDomain(null);
    }, []);
    const handleShowAllPermissions = useCallback(() => {
        setPermissionDomainFilter(ALL_PERMISSION_DOMAINS);
        setPermissionFocusDismissed(true);
        setAutoFocusedPermissionDomain(null);
    }, []);

    // --- Mutations ---
    const assignRoleMutation = useAssignRoleToUserMutation(safeUserId);
    const revokeRoleMutation = useRevokeRoleFromUserMutation(safeUserId);

    // --- Form ---
    const form = useForm<AssignRoleValues>({
        resolver: zodResolver(assignRoleSchema),
    });
    const selectedAssignRoleId = form.watch("roleId");

    const onSubmit = (values: AssignRoleValues) => {
        assignRoleMutation.mutate(values.roleId, {
            onSuccess: () => {
                setAssignOpen(false);
                toast.success("Role assigned successfully");
                form.reset();
            },
            onError: (err) => {
                toast.error("Failed to assign role");
                console.error(err);
            },
        });
    };

    const isLoading = loadingRoles || loadingPerms;
    const permissionColumns = useState<ColumnDef<EffectivePermissionRow, unknown>[]>(() => ([
        effectivePermissionColumnHelper.accessor("name", {
            header: "Permission",
            meta: {
                headerClassName: "w-[38%] min-w-[220px]",
                cellClassName: "align-middle py-2.5",
            },
            cell: (info) => (
                <div className="flex items-center gap-2 font-medium">
                    <Check className="h-3 w-3 text-success" />
                    {info.getValue()}
                </div>
            ),
        }),
        effectivePermissionColumnHelper.display({
            id: "source",
            header: "Source",
            meta: {
                headerClassName: "w-[26%] min-w-[170px]",
                cellClassName: "align-middle py-2.5",
            },
            cell: (info) => (
                <Badge variant={info.row.original.source === "role" ? "secondary" : "default"} className="text-[11px]">
                    {info.row.original.source === "role" ? `Role: ${info.row.original.role_name}` : "Direct"}
                </Badge>
            ),
        }),
        effectivePermissionColumnHelper.accessor("scope", {
            header: "Scope",
            meta: {
                cellClassName: "align-middle py-2.5",
            },
            cell: (info) => (
                <span className="block max-w-[220px] truncate text-xs font-mono text-muted-foreground" title={info.getValue() ? JSON.stringify(info.getValue()) : "No scope"}>
                    {info.getValue() ? JSON.stringify(info.getValue()) : "—"}
                </span>
            ),
        }),
    ]))[0];

    // Filter roles that act like "available" roles (not already assigned)
    const assignedRoleIds = useMemo(
        () => new Set((userRoles ?? []).map((role) => role.id)),
        [userRoles],
    );
    const availableRoles = useMemo(
        () => allRoles?.filter((role) => !assignedRoleIds.has(role.id)) ?? [],
        [allRoles, assignedRoleIds],
    );
    const selectedAssignableRole = useMemo(
        () => availableRoles.find((role) => role.id === selectedAssignRoleId) ?? null,
        [availableRoles, selectedAssignRoleId],
    );

    if (!userId) return <div>Invalid User ID</div>;

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-8" data-testid="user-access-page">
            <div className="space-y-3">
                <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                    <UserIcon className="h-6 w-6 text-primary" />
                    User Access Management
                </h1>
                <p className="max-w-3xl text-muted-foreground">
                    Review one user’s assigned roles and final effective permissions together, so access changes stay easier to explain and verify.
                </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <Card className="border-border/70 shadow-sm" data-testid="user-access-page-intro-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Work from identity to access outcome</CardTitle>
                        <CardDescription>
                            Confirm the user first, then review assigned roles, and finally verify the computed permission result before making changes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            <ScanSearch className="mr-1 h-3 w-3" />
                            Confirm identity first
                        </Badge>
                        <Badge variant="outline">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Review assigned roles
                        </Badge>
                        <Badge variant="outline">
                            <KeyRound className="mr-1 h-3 w-3" />
                            Verify effective access
                        </Badge>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm" data-testid="user-access-page-identity-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Current user scope</CardTitle>
                        <CardDescription>
                            This panel keeps the user context visible while you grant or revoke roles.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-sm">
                        <Badge variant="secondary">{selectedUser?.name ?? "Unknown user"}</Badge>
                        {selectedUser?.email ? <Badge variant="outline">{selectedUser.email}</Badge> : null}
                        <Badge variant="outline">{userRoles?.length ?? 0} assigned role{(userRoles?.length ?? 0) === 1 ? "" : "s"}</Badge>
                        <Badge variant="outline">{effectivePerms?.permissions?.length ?? 0} effective permission{(effectivePerms?.permissions?.length ?? 0) === 1 ? "" : "s"}</Badge>
                        <Badge variant="outline" className="font-mono text-xs">
                            ID: {userId}
                        </Badge>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* --- Assigned Roles --- */}
                <Card className="border-border/70 shadow-sm" data-testid="user-access-page-roles-section">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle>Assigned Roles</CardTitle>
                            <CardDescription>Roles currently granted to this user. Use assign/revoke to adjust access quickly.</CardDescription>
                        </div>
                        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" data-testid="user-access-assign-role-button">
                                <Plus className="mr-2 h-4 w-4" />
                                Assign Role
                            </Button>
                        </DialogTrigger>
                            <AppDialogContent
                                className="sm:max-w-lg"
                                title="Assign Role"
                                description="Grant one role at a time."
                            >
                                <div className="space-y-3">
                                    <div
                                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground"
                                        data-testid="user-access-assign-role-dialog-overview"
                                    >
                                        <Badge variant="secondary">{selectedUser?.name ?? "Unknown user"}</Badge>
                                        {selectedUser?.email ? <Badge variant="outline">{selectedUser.email}</Badge> : null}
                                        <Badge variant="outline">{userRoles?.length ?? 0} assigned</Badge>
                                        <Badge variant="outline">{availableRoles.length} available</Badge>
                                    </div>
                                    <Form {...form}>
                                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                                            <div className="space-y-3 rounded-lg border border-border/70 bg-background/80 p-4">
                                                <FormField
                                                    control={form.control}
                                                    name="roleId"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Role</FormLabel>
                                                            <Combobox
                                                                options={availableRoles.map(role => ({ value: role.id, label: role.name }))}
                                                                value={field.value}
                                                                onChange={field.onChange}
                                                                placeholder="Select a role"
                                                                searchPlaceholder="Search roles..."
                                                                emptyText={availableRoles.length === 0 ? "No roles available" : "No role found."}
                                                            />
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-3 text-sm" data-testid="user-access-assign-role-preview">
                                                    {selectedAssignableRole ? (
                                                        <>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge variant="secondary">{selectedAssignableRole.name}</Badge>
                                                                <Badge variant="outline">Assigned to {selectedUser?.name ?? "this user"}</Badge>
                                                            </div>
                                                            <p className="text-muted-foreground">
                                                                {selectedAssignableRole.description || "No role description provided."}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-muted-foreground">
                                                            Choose a role above to review its intent before assigning it.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <DialogFooter className="flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-xs text-muted-foreground">
                                                    Effective access updates as soon as the assign completes.
                                                </p>
                                                <Button type="submit" disabled={assignRoleMutation.isPending}>
                                                    Assign
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </Form>
                                </div>
                            </AppDialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 pt-4">
                            {!userRoles || userRoles.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No roles assigned.</p>
                            ) : (
                                userRoles.map(role => (
                                    <div key={role.id} className="flex items-center justify-between rounded-lg border p-2.5 shadow-sm" data-testid="user-access-role-card">
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium">{role.name}</span>
                                                <Badge variant="outline">Role</Badge>
                                            </div>
                                            <span className="block truncate text-xs text-muted-foreground" title={role.description || "No role description provided."}>
                                                {role.description || "No role description provided."}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive"
                                            data-testid="user-access-role-revoke-button"
                                            onClick={() => {
                                                setRevokeRole(role);
                                                setRevokeConfirmOpen(true);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* --- Effective Permissions --- */}
                <Card className="border-border/70 shadow-sm" data-testid="user-access-page-permissions-section">
                    <CardHeader>
                        <CardTitle>Effective Permissions</CardTitle>
                        <CardDescription>
                            Computed permissions from all roles and direct grants. Use this to verify final access outcome.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-1">
                                <div className="max-w-xs">
                                    <p className="text-xs font-medium text-muted-foreground">Permission domain</p>
                                    <Combobox
                                        options={permissionDomainOptions}
                                        value={permissionDomainFilter}
                                        onChange={handlePermissionDomainChange}
                                        placeholder="All permission domains"
                                        searchPlaceholder="Search permission domains..."
                                        triggerTestId="user-access-permission-domain-filter-combobox"
                                    />
                                </div>
                            </div>
                            <div
                                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                                data-testid="user-access-permissions-summary"
                            >
                                <Badge variant="outline">{activePermissionDomainLabel}</Badge>
                                <Badge variant="outline">{filteredPermissions.length} visible</Badge>
                                <Badge variant="outline">{permissionRows.length} total</Badge>
                            </div>
                        </div>
                        {isAutoFocusedPermissionDomain ? (
                            <div
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"
                                data-testid="user-access-permission-focus-banner"
                            >
                                <div>
                                    Focused on <span className="font-medium text-foreground">{permissionDomainFilter}</span> permissions by default for a calmer laptop view.
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={handleShowAllPermissions}
                                    data-testid="user-access-show-all-permissions-button"
                                >
                                    Show all permissions
                                </Button>
                            </div>
                        ) : null}
                        <div className="rounded-md border">
                            <AppDataTable
                                data={permissionsPagination.pageItems}
                                columns={permissionColumns}
                                getRowId={(row, index) => `${row.name}-${index}`}
                                className="text-sm"
                                rowClassName="hover:bg-muted/25"
                                emptyRow={(
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            No permissions found.
                                        </TableCell>
                                    </TableRow>
                                    )}
                                />
                            <DataTablePagination
                                currentPage={permissionsPagination.page}
                                totalPages={permissionsPagination.totalPages}
                                pageSize={permissionsPagination.pageSize}
                                setPage={permissionsPagination.setPage}
                                setPageSize={permissionsPagination.setPageSize}
                                totalItems={permissionsPagination.totalItems}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
            <AlertDialog
                open={revokeConfirmOpen}
                onOpenChange={(open) => {
                    if (!open) setRevokeRole(null);
                    setRevokeConfirmOpen(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke role</AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Revoke role "${revokeRole?.name ?? ""}" from this user?`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm" data-testid="user-access-revoke-role-summary">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">{selectedUser?.name ?? "Unknown user"}</Badge>
                            <Badge variant="outline">{userRoles?.length ?? 0} assigned role{(userRoles?.length ?? 0) === 1 ? "" : "s"}</Badge>
                            <Badge variant="outline">{effectivePerms?.permissions?.length ?? 0} effective permission{(effectivePerms?.permissions?.length ?? 0) === 1 ? "" : "s"}</Badge>
                        </div>
                        <p className="text-muted-foreground">
                            {revokeRole?.description || "No role description provided."}
                        </p>
                        <p className="text-muted-foreground">
                            Effective access may shrink immediately after this change. Use the permissions table to verify the final outcome once the revoke completes.
                        </p>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setRevokeConfirmOpen(false);
                                    setRevokeRole(null);
                                }}
                            >
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => {
                                    if (!revokeRole) return;
                                    revokeRoleMutation.mutate(revokeRole.id, {
                                        onSuccess: () => {
                                            toast.success("Role revoked");
                                        },
                                        onError: (err) => {
                                            toast.error("Failed to revoke role");
                                            console.error(err);
                                        },
                                    });
                                    setRevokeConfirmOpen(false);
                                    setRevokeRole(null);
                                }}
                                disabled={revokeRoleMutation.isPending || !revokeRole}
                                data-testid="user-access-revoke-role-confirm-button"
                            >
                                {revokeRoleMutation.isPending ? "Revoking..." : "Revoke"}
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

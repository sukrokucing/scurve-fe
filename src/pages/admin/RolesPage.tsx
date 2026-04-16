import { useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Loader2, Shield, Settings, Check, KeyRound, Layers3 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
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
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppDataTable } from "@/components/ui/app-data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useClientPagination } from "@/hooks/useClientPagination";

import {
    useAssignPermissionToRoleMutation,
    useCreateRoleMutation,
    useDeleteRoleMutation,
    usePermissionsQuery,
    useRevokePermissionFromRoleMutation,
    useRolePermissionsQuery,
    useRolesQuery,
} from "@/api/queries/rbac";

import type { Permission, Role } from "@/api/rbac";
import { roleSchema, assignPermSchema, type RoleFormValues, type AssignPermValues } from "@/schemas/roles";

const roleColumnHelper = createColumnHelper<Role>();

// --- Components ---

const RoleDetailsDialog = ({ role, open, onOpenChange }: { role: Role | null; open: boolean; onOpenChange: (open: boolean) => void }) => {
    // Fetch role permissions
    const { data: rolePerms, isLoading: loadingPerms } = useRolePermissionsQuery(role?.id, { enabled: open });

    // Fetch all permissions for selection
    const { data: allPerms } = usePermissionsQuery({ enabled: open });

    const assignMutation = useAssignPermissionToRoleMutation(role?.id);
    const revokeMutation = useRevokePermissionFromRoleMutation(role?.id);
    const [permissionSearch, setPermissionSearch] = useState("");
    const [permissionToRevoke, setPermissionToRevoke] = useState<Permission | null>(null);
    const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);

    const form = useForm<AssignPermValues>({
        resolver: zodResolver(assignPermSchema),
    });

    // Filter available perms
    const assignedIds = useMemo(() => new Set((rolePerms ?? []).map((permission) => permission.id)), [rolePerms]);
    const availablePerms = useMemo(
        () => allPerms?.filter((permission) => !assignedIds.has(permission.id)) ?? [],
        [allPerms, assignedIds],
    );
    const assignedPermissions = useMemo(() => rolePerms ?? [], [rolePerms]);
    const normalizedPermissionSearch = permissionSearch.trim().toLowerCase();
    const filteredAssignedPermissions = useMemo(() => {
        if (!normalizedPermissionSearch) {
            return assignedPermissions;
        }

        return assignedPermissions.filter((permission) => {
            const haystack = `${permission.name} ${permission.description ?? ""}`.toLowerCase();
            return haystack.includes(normalizedPermissionSearch);
        });
    }, [assignedPermissions, normalizedPermissionSearch]);
    const groupedAssignedPermissions = useMemo(() => {
        const groups = new Map<string, typeof filteredAssignedPermissions>();

        for (const permission of filteredAssignedPermissions) {
            const category = permission.name.split(".")[0] || "general";
            const current = groups.get(category) ?? [];
            groups.set(category, [...current, permission]);
        }

        return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
    }, [filteredAssignedPermissions]);

    const handleDialogOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            form.reset();
            setPermissionSearch("");
            setPermissionToRevoke(null);
            setRevokeConfirmOpen(false);
        }
        onOpenChange(nextOpen);
    };

    const handleRequestRevoke = (permission: Permission) => {
        setPermissionToRevoke(permission);
        setRevokeConfirmOpen(true);
    };

    const handleConfirmRevoke = () => {
        if (!permissionToRevoke) return;
        revokeMutation.mutate(permissionToRevoke.id, {
            onSuccess: () => {
                toast.success("Permission removed");
                setRevokeConfirmOpen(false);
                setPermissionToRevoke(null);
            },
            onError: (error) => {
                toast.error("Failed to remove permission");
                console.error(error);
            },
        });
    };

    if (!role) return null;

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <AppDialogContent
                className="max-h-[88vh] overflow-y-auto sm:max-w-4xl"
                title={(
                    <span className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {role.name}
                    </span>
                )}
                description={role.description || "No role description provided."}
            >
                <div className="grid gap-4 py-4">
                    <Card className="border-border/70 shadow-sm" data-testid="roles-details-overview-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Role overview</CardTitle>
                            <CardDescription>
                                Use this dialog for focused role-level permission changes. Use Access Policy when you need wider grant or revoke sweeps across many roles or resources.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3 pt-0">
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">{assignedPermissions.length} assigned</Badge>
                                <Badge variant="outline">{availablePerms.length} available</Badge>
                                <Badge variant="outline">Created {format(new Date(role.created_at), "MMM d, yyyy")}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {role.description || "Add a short description later so other admins can tell when to use this role without opening the full permission list."}
                            </p>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <Card className="border-border/70 shadow-sm" data-testid="roles-details-assign-card">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Add permission</CardTitle>
                                <CardDescription>
                                    Pick one permission at a time so the role stays intentional and easy to review later.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4 pt-0">
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <Badge variant="outline">{availablePerms.length} ready to add</Badge>
                                    <Badge variant="outline">Permission changes stay role-scoped</Badge>
                                </div>
                                <Form {...form}>
                                    <form
                                        onSubmit={form.handleSubmit((values) => {
                                            assignMutation.mutate(values.permissionId, {
                                                onSuccess: () => {
                                                    toast.success("Permission assigned");
                                                    form.reset();
                                                },
                                                onError: (err) => {
                                                    toast.error("Failed to assign permission");
                                                    console.error(err);
                                                },
                                            });
                                        })}
                                        className="flex flex-col gap-3"
                                    >
                                        <FormField
                                            control={form.control}
                                            name="permissionId"
                                            render={({ field }) => (
                                                <FormItem className="space-y-2">
                                                    <FormLabel>Select permission</FormLabel>
                                                    <FormControl>
                                                        <Combobox
                                                            options={availablePerms.map((permission) => ({ value: permission.id, label: permission.name }))}
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            placeholder="Add Permission..."
                                                            searchPlaceholder="Search permissions..."
                                                            emptyText={availablePerms.length === 0 ? "No unassigned permissions" : "No permission found."}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button
                                            type="submit"
                                            disabled={assignMutation.isPending}
                                            aria-label="Assign selected permission"
                                            title="Assign selected permission"
                                            data-testid="roles-details-assign-permission-button"
                                        >
                                            <Plus className="mr-2 h-4 w-4" />
                                            Assign permission
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                        </Card>

                        <Card className="border-border/70 shadow-sm" data-testid="roles-details-permissions-card">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Assigned permissions</CardTitle>
                                <CardDescription>
                                    Review the current grants by domain so you can spot overly broad roles before changing them. Remove a grant here when the role has become too broad for its intent.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4 pt-0">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <Badge variant="outline">{filteredAssignedPermissions.length} shown</Badge>
                                        <Badge variant="outline">{groupedAssignedPermissions.length} domain{groupedAssignedPermissions.length === 1 ? "" : "s"}</Badge>
                                    </div>
                                    <Input
                                        value={permissionSearch}
                                        onChange={(event) => setPermissionSearch(event.target.value)}
                                        placeholder="Filter assigned permissions..."
                                        className="sm:max-w-xs"
                                        data-testid="roles-details-permission-search-input"
                                    />
                                </div>
                                <ScrollArea className="h-[280px] rounded-md border bg-muted/10 p-4">
                                    {loadingPerms ? (
                                        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                    ) : assignedPermissions.length === 0 ? (
                                        <p className="py-4 text-sm text-muted-foreground">No permissions assigned.</p>
                                    ) : filteredAssignedPermissions.length === 0 ? (
                                        <p className="py-4 text-sm text-muted-foreground">No assigned permissions match this filter.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {groupedAssignedPermissions.map(([group, permissions]) => (
                                                <div key={group} className="space-y-2" data-testid="roles-details-permission-group">
                                                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                            {group.replace(/[_-]/g, " ")}
                                                        </p>
                                                        <Badge variant="outline">{permissions.length}</Badge>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {permissions.map((permission) => (
                                                            <div
                                                                key={permission.id}
                                                                className="rounded-lg border border-border/60 bg-background/90 p-3"
                                                                data-testid="roles-details-permission-row"
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="flex items-start gap-3">
                                                                        <span className="mt-0.5 rounded-full bg-success/10 p-1 text-success">
                                                                            <Check className="h-3.5 w-3.5" />
                                                                        </span>
                                                                        <div className="space-y-1">
                                                                            <p className="font-mono text-sm">{permission.name}</p>
                                                                            <p className="text-xs text-muted-foreground">
                                                                                {permission.description || "No permission description provided."}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="text-muted-foreground hover:text-destructive"
                                                                        data-testid="roles-details-permission-revoke-button"
                                                                        aria-label={`Remove permission ${permission.name}`}
                                                                        title={`Remove permission ${permission.name}`}
                                                                        onClick={() => handleRequestRevoke(permission)}
                                                                        disabled={revokeMutation.isPending}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </AppDialogContent>
            <AlertDialog
                open={revokeConfirmOpen}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setPermissionToRevoke(null);
                    }
                    setRevokeConfirmOpen(nextOpen);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove permission</AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Remove "${permissionToRevoke?.name ?? ""}" from role "${role.name}"?`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm" data-testid="roles-details-revoke-summary">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">{role.name}</Badge>
                            <Badge variant="outline">{assignedPermissions.length} assigned permission{assignedPermissions.length === 1 ? "" : "s"}</Badge>
                        </div>
                        <p className="text-muted-foreground">
                            {permissionToRevoke?.description || "No permission description provided."}
                        </p>
                        <p className="text-muted-foreground">
                            Removing this grant can immediately reduce what every user with this role can do. Review the role roster again after the change if this permission was part of a broader workflow.
                        </p>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setRevokeConfirmOpen(false);
                                    setPermissionToRevoke(null);
                                }}
                            >
                                Cancel
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={handleConfirmRevoke}
                                disabled={revokeMutation.isPending || !permissionToRevoke}
                                data-testid="roles-details-revoke-confirm-button"
                            >
                                {revokeMutation.isPending ? "Removing..." : "Remove permission"}
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
};

export const RolesPage = () => {
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // --- Queries ---
    const { data: roles, isLoading } = useRolesQuery();
    const rosterPagination = useClientPagination(roles ?? [], { initialPageSize: 25 });

    // --- Mutations ---
    const createMutation = useCreateRoleMutation();
    const deleteMutation = useDeleteRoleMutation();

    // --- Form ---
    const form = useForm<RoleFormValues>({
        resolver: zodResolver(roleSchema),
        defaultValues: {
            name: "",
            description: "",
        },
    });

    const onSubmit = (values: RoleFormValues) => {
        createMutation.mutate(values, {
            onSuccess: () => {
                setCreateOpen(false);
                toast.success("Role created successfully");
                form.reset();
            },
            onError: (err) => {
                toast.error("Failed to create role");
                console.error(err);
            },
        });
    };

    const columns = useState<ColumnDef<Role, unknown>[]>(() => ([
        roleColumnHelper.accessor("name", {
            header: "Name",
            cell: (info) => (
                <Button
                    variant="link"
                    className="p-0 h-auto font-semibold"
                    data-testid="roles-row-name-button"
                    onClick={() => {
                        setSelectedRole(info.row.original);
                        setDetailsOpen(true);
                    }}
                >
                    {info.getValue()}
                </Button>
            ),
        }),
        roleColumnHelper.accessor("description", {
            header: "Description",
            cell: (info) => <span className="text-muted-foreground">{info.getValue() || "—"}</span>,
        }),
        roleColumnHelper.accessor("created_at", {
            header: "Created",
            cell: (info) => (
                <span className="text-sm text-muted-foreground">
                    {format(new Date(info.getValue()), "MMM d, yyyy")}
                </span>
            ),
        }),
        roleColumnHelper.display({
            id: "actions",
            header: () => <div className="w-[100px]" />,
            cell: (info) => {
                const role = info.row.original;
                return (
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                            data-testid="roles-row-settings-button"
                            aria-label={`Open settings for role ${role.name}`}
                            title={`Open settings for role ${role.name}`}
                            onClick={() => {
                                setSelectedRole(role);
                                setDetailsOpen(true);
                            }}
                        >
                            <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            data-testid="roles-row-delete-button"
                            aria-label={`Delete role ${role.name}`}
                            title={`Delete role ${role.name}`}
                            onClick={() => {
                                setRoleToDelete(role);
                                setDeleteConfirmOpen(true);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                );
            },
        }),
    ]))[0];

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-8" data-testid="roles-page">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                        <Shield className="h-6 w-6 text-primary" />
                        Roles
                    </h1>
                    <p className="max-w-3xl text-muted-foreground">
                        Define role intent first, then manage permissions from the role details view so the main list stays easy to scan and compare.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card className="border-border/70 shadow-sm" data-testid="roles-page-intro-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Keep the roster readable</CardTitle>
                        <CardDescription>
                            Use the main list to compare role names and intent. Open role details only when you need to add permissions or inspect the full grant set.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            <Layers3 className="mr-1 h-3 w-3" />
                            Compare role intent first
                        </Badge>
                        <Badge variant="outline">
                            <KeyRound className="mr-1 h-3 w-3" />
                            Configure permissions in details
                        </Badge>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm" data-testid="roles-page-primary-actions-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Primary action</CardTitle>
                        <CardDescription>
                            Create new roles here, then manage their permissions from the role details dialog to keep one change surface at a time.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{roles?.length ?? 0} role{(roles?.length ?? 0) === 1 ? "" : "s"}</Badge>
                            <Badge variant="outline">Permissions stay role-scoped</Badge>
                        </div>
                        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                            <DialogTrigger asChild>
                                <Button data-testid="roles-create-button">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create Role
                                </Button>
                            </DialogTrigger>
                            <AppDialogContent
                                className="sm:max-w-[425px]"
                                title="Create New Role"
                                description="Define a new role to assign permissions to users."
                            >
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Role Name</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="e.g. Project Manager"
                                                            data-testid="roles-create-name-input"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Description</FormLabel>
                                                    <FormControl>
                                                        <Textarea
                                                            placeholder="Describe what this role allows..."
                                                            className="resize-none"
                                                            data-testid="roles-create-description-input"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <DialogFooter>
                                            <Button
                                                type="submit"
                                                disabled={createMutation.isPending}
                                                data-testid="roles-create-submit-button"
                                            >
                                                {createMutation.isPending && (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                )}
                                                Create Role
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </Form>
                            </AppDialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 shadow-sm" data-testid="roles-page-table-card">
                <CardHeader>
                    <CardTitle>Role roster</CardTitle>
                    <CardDescription>
                        Scan role identity first, then use the trailing actions to inspect permissions or remove a role when needed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="rounded-md border bg-card">
                        <AppDataTable
                            data={rosterPagination.pageItems}
                            columns={columns}
                            getRowId={(row) => row.id}
                            emptyRow={(
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        No roles found. Create one to get started.
                                    </TableCell>
                                    </TableRow>
                            )}
                        />
                        <DataTablePagination
                            currentPage={rosterPagination.page}
                            totalPages={rosterPagination.totalPages}
                            pageSize={rosterPagination.pageSize}
                            setPage={rosterPagination.setPage}
                            setPageSize={rosterPagination.setPageSize}
                            totalItems={rosterPagination.totalItems}
                            pageSizeOptions={[10, 25, 50, 100]}
                        />
                    </div>
                </CardContent>
            </Card>

            <RoleDetailsDialog
                role={selectedRole}
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
            />
            <AlertDialog
                open={deleteConfirmOpen}
                onOpenChange={(open) => {
                    if (!open) setRoleToDelete(null);
                    setDeleteConfirmOpen(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete role</AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Delete role "${roleToDelete?.name ?? ""}"? This action cannot be undone.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setDeleteConfirmOpen(false);
                                    setRoleToDelete(null);
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
                                    if (!roleToDelete) return;
                                    deleteMutation.mutate(roleToDelete.id, {
                                        onSuccess: () => {
                                            toast.success("Role deleted");
                                        },
                                        onError: (err) => {
                                            toast.error("Failed to delete role");
                                            console.error(err);
                                        },
                                    });
                                    setDeleteConfirmOpen(false);
                                    setRoleToDelete(null);
                                }}
                                disabled={deleteMutation.isPending || !roleToDelete}
                                data-testid="roles-delete-confirm-button"
                            >
                                {deleteMutation.isPending ? "Deleting..." : "Delete"}
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

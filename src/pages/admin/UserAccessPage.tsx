import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Trash2, Plus, User as UserIcon, Loader2, Check } from "lucide-react";

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
import { rbacApi, type Role } from "@/api/rbac";



// --- Schema ---
const assignRoleSchema = z.object({
    roleId: z.string().min(1, "Please select a role"),
});

type AssignRoleValues = z.infer<typeof assignRoleSchema>;
type EffectivePermissionRow = NonNullable<Awaited<ReturnType<typeof rbacApi.getUserEffectivePermissions>>["permissions"]>[number];
const effectivePermissionColumnHelper = createColumnHelper<EffectivePermissionRow>();

export const UserAccessPage = () => {
    const { userId } = useParams<{ userId: string }>();
    const safeUserId = userId ?? "";
    const [assignOpen, setAssignOpen] = useState(false);
    const [revokeRole, setRevokeRole] = useState<Role | null>(null);
    const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);

    // --- Queries ---
    const { data: userRoles, isLoading: loadingRoles } = useUserRolesQuery(safeUserId, { enabled: Boolean(userId) });

    const { data: effectivePerms, isLoading: loadingPerms } = useUserEffectivePermissionsQuery(safeUserId, { enabled: Boolean(userId) });

    const { data: allRoles } = useRolesQuery({ enabled: Boolean(userId) });
    const { data: usersLookup } = useUsersLookupQuery({ enabled: Boolean(userId) });
    const selectedUser = useMemo(
        () => usersLookup?.users.find((user) => user.id === safeUserId),
        [safeUserId, usersLookup?.users],
    );

    // --- Mutations ---
    const assignRoleMutation = useAssignRoleToUserMutation(safeUserId);
    const revokeRoleMutation = useRevokeRoleFromUserMutation(safeUserId);

    // --- Form ---
    const form = useForm<AssignRoleValues>({
        resolver: zodResolver(assignRoleSchema),
    });

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
            cell: (info) => (
                <Badge variant={info.row.original.source === "role" ? "secondary" : "default"}>
                    {info.row.original.source === "role" ? `Role: ${info.row.original.role_name}` : "Direct"}
                </Badge>
            ),
        }),
        effectivePermissionColumnHelper.accessor("scope", {
            header: "Scope",
            cell: (info) => (
                <span className="text-xs font-mono text-muted-foreground">
                    {info.getValue() ? JSON.stringify(info.getValue()) : "—"}
                </span>
            ),
        }),
    ]))[0];

    if (!userId) return <div>Invalid User ID</div>;

    // Filter roles that act like "available" roles (not already assigned)
    const assignedRoleIds = new Set(userRoles?.map(r => r.id));
    const availableRoles = allRoles?.filter(r => !assignedRoleIds.has(r.id)) || [];

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <UserIcon className="h-6 w-6 text-primary" />
                    User Access Management
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Review assigned roles and effective permissions for this user account.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary">{selectedUser?.name ?? "Unknown user"}</Badge>
                    {selectedUser?.email ? <Badge variant="outline">{selectedUser.email}</Badge> : null}
                    <Badge variant="outline" className="font-mono text-xs">
                        ID: {userId}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* --- Assigned Roles --- */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle>Assigned Roles</CardTitle>
                            <CardDescription>Roles currently granted to this user. Use assign/revoke to adjust access quickly.</CardDescription>
                        </div>
                        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-2 h-4 w-4" />
                                Assign Role
                            </Button>
                        </DialogTrigger>
                            <AppDialogContent
                                title="Assign Role"
                                description="Select a role to grant to this user."
                            >
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                                        <DialogFooter>
                                            <Button type="submit" disabled={assignRoleMutation.isPending}>
                                                Assign
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </Form>
                            </AppDialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 pt-4">
                            {!userRoles || userRoles.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No roles assigned.</p>
                            ) : (
                                userRoles.map(role => (
                                    <div key={role.id} className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                        <div className="flex flex-col space-y-1">
                                            <span className="font-medium">{role.name}</span>
                                            <span className="text-xs text-muted-foreground">{role.description}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-muted-foreground hover:text-destructive"
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
                <Card>
                    <CardHeader>
                        <CardTitle>Effective Permissions</CardTitle>
                        <CardDescription>
                            Computed permissions from all roles and direct grants. Use this to verify final access outcome.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <AppDataTable
                                data={effectivePerms?.permissions ?? []}
                                columns={permissionColumns}
                                getRowId={(row, index) => `${row.name}-${index}`}
                                emptyRow={(
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            No permissions found.
                                        </TableCell>
                                    </TableRow>
                                )}
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

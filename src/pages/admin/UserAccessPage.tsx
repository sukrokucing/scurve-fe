import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Shield, Trash2, Plus, User as UserIcon, Loader2, Check } from "lucide-react";
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { rbacApi, type Role } from "@/api/rbac";

// --- Schema ---
const assignRoleSchema = z.object({
    roleId: z.string().min(1, "Please select a role"),
});

type AssignRoleValues = z.infer<typeof assignRoleSchema>;

export const UserAccessPage = () => {
    const { userId } = useParams<{ userId: string }>();
    const queryClient = useQueryClient();
    const [assignOpen, setAssignOpen] = useState(false);

    if (!userId) return <div>Invalid User ID</div>;

    // --- Queries ---
    const { data: userRoles, isLoading: loadingRoles } = useQuery({
        queryKey: ["user-roles", userId],
        queryFn: () => rbacApi.getUserRoles(userId),
    });

    const { data: effectivePerms, isLoading: loadingPerms } = useQuery({
        queryKey: ["user-permissions", userId],
        queryFn: () => rbacApi.getUserEffectivePermissions(userId),
    });

    const { data: allRoles } = useQuery({
        queryKey: ["roles"],
        queryFn: rbacApi.listRoles,
    });

    // --- Mutations ---
    const assignRoleMutation = useMutation({
        mutationFn: (values: AssignRoleValues) => rbacApi.assignRoleToUser(userId, { role_id: values.roleId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["user-roles", userId] });
            queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
            setAssignOpen(false);
            toast.success("Role assigned successfully");
            form.reset();
        },
        onError: (err) => {
            toast.error("Failed to assign role");
            console.error(err);
        },
    });

    const revokeRoleMutation = useMutation({
        mutationFn: (roleId: string) => rbacApi.revokeRoleFromUser(userId, roleId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["user-roles", userId] });
            queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
            toast.success("Role revoked");
        },
        onError: (err) => {
            toast.error("Failed to revoke role");
            console.error(err);
        },
    });

    // --- Form ---
    const form = useForm<AssignRoleValues>({
        resolver: zodResolver(assignRoleSchema),
    });

    const onSubmit = (values: AssignRoleValues) => {
        assignRoleMutation.mutate(values);
    };

    const isLoading = loadingRoles || loadingPerms;

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
                <p className="text-muted-foreground font-mono text-sm mt-1">User ID: {userId}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* --- Assigned Roles --- */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle>Assigned Roles</CardTitle>
                            <CardDescription>Roles currently granted to this user.</CardDescription>
                        </div>
                        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Assign Role
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Assign Role</DialogTitle>
                                    <DialogDescription>Select a role to grant to this user.</DialogDescription>
                                </DialogHeader>
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="roleId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Role</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select a role" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {availableRoles.length === 0 ? (
                                                                <SelectItem value="none" disabled>No roles available</SelectItem>
                                                            ) : (
                                                                availableRoles.map(role => (
                                                                    <SelectItem key={role.id} value={role.id}>
                                                                        {role.name}
                                                                    </SelectItem>
                                                                ))
                                                            )}
                                                        </SelectContent>
                                                    </Select>
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
                            </DialogContent>
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
                                                if (confirm(`Revoke role "${role.name}"?`)) {
                                                    revokeRoleMutation.mutate(role.id);
                                                }
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
                            Computed permissions from all roles and direct grants.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Permission</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead>Scope</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!effectivePerms?.permissions || effectivePerms.permissions.length === 0 ? (
                                        <TableRow key="no-perms">
                                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                                No permissions found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        effectivePerms.permissions.map((perm, idx) => (
                                            <TableRow key={`${perm.name}-${idx}`}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <Check className="h-3 w-3 text-green-500" />
                                                        {perm.name}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={perm.source === "role" ? "secondary" : "default"}>
                                                        {perm.source === "role" ? `Role: ${perm.role_name}` : "Direct"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs font-mono text-muted-foreground">
                                                    {perm.scope ? JSON.stringify(perm.scope) : "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

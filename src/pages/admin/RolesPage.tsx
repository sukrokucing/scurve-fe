import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Loader2, Shield, Settings, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
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
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog";
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


import { rbacApi, type Role } from "@/api/rbac";

// --- Schemas ---
const roleSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    description: z.string().optional(),
});

type RoleFormValues = z.infer<typeof roleSchema>;

const assignPermSchema = z.object({
    permissionId: z.string().min(1, "Select a permission"),
});

type AssignPermValues = z.infer<typeof assignPermSchema>;

// --- Components ---

const RoleDetailsDialog = ({ role, open, onOpenChange }: { role: Role | null; open: boolean; onOpenChange: (open: boolean) => void }) => {
    const queryClient = useQueryClient();

    // Fetch role permissions
    const { data: rolePerms, isLoading: loadingPerms } = useQuery({
        queryKey: ["role-permissions", role?.id],
        queryFn: () => role ? rbacApi.getRolePermissions(role.id) : Promise.resolve([]),
        enabled: !!role && open,
    });

    // Fetch all permissions for selection
    const { data: allPerms } = useQuery({
        queryKey: ["permissions"],
        queryFn: rbacApi.listPermissions,
        enabled: open,
    });

    const assignMutation = useMutation({
        mutationFn: (values: AssignPermValues) =>
            role ? rbacApi.assignPermissionToRole(role.id, { permission_id: values.permissionId }) : Promise.resolve(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["role-permissions", role?.id] });
            toast.success("Permission assigned");
            form.reset();
        },
        onError: (err) => {
            toast.error("Failed to assign permission");
            console.error(err);
        }
    });

    const form = useForm<AssignPermValues>({
        resolver: zodResolver(assignPermSchema),
    });

    if (!role) return null;

    // Filter available perms
    const assignedIds = new Set(rolePerms?.map(p => p.id));
    const availablePerms = allPerms?.filter(p => !assignedIds.has(p.id)) || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <AppDialogContent
                className="max-w-2xl"
                title={(
                    <span className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {role.name}
                    </span>
                )}
                description={role.description || "No role description provided."}
            >

                <div className="grid gap-6 py-4">
                    {/* Assign Form */}
                    <div className="flex items-end gap-2 p-4 bg-muted/50 rounded-lg">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit((v) => assignMutation.mutate(v))} className="flex-1 flex gap-2">
                                <FormField
                                    control={form.control}
                                    name="permissionId"
                                    render={({ field }) => (
                                        <FormItem className="flex-1 space-y-0">
                                            <Combobox
                                                options={availablePerms.map(p => ({ value: p.id, label: p.name }))}
                                                value={field.value}
                                                onChange={field.onChange}
                                                placeholder="Add Permission..."
                                                searchPlaceholder="Search permissions..."
                                                emptyText={availablePerms.length === 0 ? "No unassigned permissions" : "No permission found."}
                                            />
                                        </FormItem>
                                    )}
                                />
                                <Button
                                    type="submit"
                                    disabled={assignMutation.isPending}
                                    size="icon"
                                    aria-label="Assign selected permission"
                                    title="Assign selected permission"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </form>
                        </Form>
                    </div>

                    {/* Permissions List */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium leading-none">Assigned Permissions</h3>
                        <ScrollArea className="h-[200px] rounded-md border p-4">
                            {loadingPerms ? (
                                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                            ) : !rolePerms || rolePerms.length === 0 ? (
                                <p className="py-4 text-sm text-muted-foreground">No permissions assigned.</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {rolePerms.map(perm => (
                                        <div key={perm.id} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/40">
                                            <Check className="h-3 w-3 text-success" />
                                            <span className="font-mono">{perm.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>
            </AppDialogContent>
        </Dialog>
    );
};

export const RolesPage = () => {
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // --- Queries ---
    const { data: roles, isLoading } = useQuery({
        queryKey: ["roles"],
        queryFn: rbacApi.listRoles,
    });

    // --- Mutations ---
    const createMutation = useMutation({
        mutationFn: rbacApi.createRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            setCreateOpen(false);
            toast.success("Role created successfully");
            form.reset();
        },
        onError: (err) => {
            toast.error("Failed to create role");
            console.error(err);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: rbacApi.deleteRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            toast.success("Role deleted");
        },
        onError: (err) => {
            toast.error("Failed to delete role");
            console.error(err);
        },
    });

    // --- Form ---
    const form = useForm<RoleFormValues>({
        resolver: zodResolver(roleSchema),
        defaultValues: {
            name: "",
            description: "",
        },
    });

    const onSubmit = (values: RoleFormValues) => {
        createMutation.mutate(values);
    };

    if (isLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Shield className="h-6 w-6 text-primary" />
                        Roles
                    </h1>
                    <p className="text-muted-foreground">Manage system roles and permissions.</p>
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
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!roles || roles.length === 0 ? (
                            <TableRow key="no-roles">
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    No roles found. Create one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            roles.map((role: Role) => (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">
                                        <Button
                                            variant="link"
                                            className="p-0 h-auto font-semibold"
                                            data-testid="roles-row-name-button"
                                            onClick={() => {
                                                setSelectedRole(role);
                                                setDetailsOpen(true);
                                            }}
                                        >
                                            {role.name}
                                        </Button>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{role.description || "—"}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {format(new Date(role.created_at), "MMM d, yyyy")}
                                    </TableCell>
                                    <TableCell>
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
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <RoleDetailsDialog
                role={selectedRole}
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
            />
            <Dialog
                open={deleteConfirmOpen}
                onOpenChange={(open) => {
                    if (!open) setRoleToDelete(null);
                    setDeleteConfirmOpen(open);
                }}
            >
                <AppDialogContent
                    title="Delete role"
                    description={`Delete role "${roleToDelete?.name ?? ""}"? This action cannot be undone.`}
                >
                    <div className="flex justify-end gap-2 mt-4">
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
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                if (!roleToDelete) return;
                                deleteMutation.mutate(roleToDelete.id);
                                setDeleteConfirmOpen(false);
                                setRoleToDelete(null);
                            }}
                            disabled={deleteMutation.isPending || !roleToDelete}
                            data-testid="roles-delete-confirm-button"
                        >
                            {deleteMutation.isPending ? "Deleting..." : "Delete"}
                        </Button>
                    </div>
                    <DialogFooter />
                </AppDialogContent>
            </Dialog>
        </div>
    );
};

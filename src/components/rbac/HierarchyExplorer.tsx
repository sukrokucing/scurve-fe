import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, User as UserIcon, Shield, Check, Lock, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import { usersApi, type User } from "@/api/users";
import { type Role } from "@/api/rbac";

export const HierarchyExplorer = () => {
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);

    // --- Column 1: Users ---
    const { data: users, isLoading: loadingUsers } = useQuery({
        queryKey: ["users"],
        queryFn: usersApi.listUsers,
    });

    // --- Column 2: User Roles ---
    const { data: userRoles, isLoading: loadingUserRoles } = useQuery({
        queryKey: ["user-roles", selectedUser?.id],
        // Use mock API because users are mocks
        queryFn: () => selectedUser ? usersApi.getMockUserRoles(selectedUser.id) : Promise.resolve([]),
        enabled: !!selectedUser,
    });

    // --- Column 3: Role Permissions ---
    const { data: rolePermissions, isLoading: loadingRolePerms } = useQuery({
        queryKey: ["role-permissions", selectedRole?.id],
        // Use mock API because roles are mocks
        queryFn: () => selectedRole ? usersApi.getMockRolePermissions(selectedRole.id) : Promise.resolve([]),
        enabled: !!selectedRole,
    });

    // Helper for Column Loading State
    const ColumnLoading = () => (
        <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );

    // Helper for Empty State
    const ColumnEmpty = ({ msg }: { msg: string }) => (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground p-4 text-center">
            <span className="text-sm">{msg}</span>
        </div>
    );

    return (
        <div className="rounded-lg border bg-card shadow-sm h-[600px] flex overflow-hidden flex-col md:flex-row text-foreground">
            {/* Disclaimer */}
            <div className="md:hidden p-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs text-center border-b">
                Best viewed on desktop
            </div>

            {/* --- Column 1: Users --- */}
            <div className="flex-1 min-w-[300px] border-r flex flex-col bg-card">
                <div className="p-3 border-b bg-muted/20 font-medium flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    Users
                </div>
                <ScrollArea className="flex-1">
                    {loadingUsers ? <ColumnLoading /> : (
                        <div className="p-2 space-y-1">
                            {!users || users.length === 0 ? <ColumnEmpty msg="No users found" /> : (
                                users.map(user => (
                                    <button
                                        key={user.id}
                                        onClick={() => {
                                            setSelectedUser(user);
                                            setSelectedRole(null); // Reset downstream selection
                                        }}
                                        className={clsx(
                                            "w-full text-left p-3 rounded-md flex items-center justify-between transition-colors text-sm",
                                            selectedUser?.id === user.id
                                                ? "bg-primary text-primary-foreground"
                                                : "hover:bg-muted"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={clsx(
                                                "h-8 w-8 rounded-full flex items-center justify-center",
                                                selectedUser?.id === user.id ? "bg-primary-foreground/20" : "bg-muted"
                                            )}>
                                                <span className="font-semibold text-xs">{user.name.substring(0, 2).toUpperCase()}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{user.name}</span>
                                                <span className={clsx("text-xs opacity-70", selectedUser?.id === user.id ? "text-primary-foreground" : "text-muted-foreground")}>
                                                    {user.email}
                                                </span>
                                            </div>
                                        </div>
                                        {selectedUser?.id === user.id && <ChevronRight className="h-4 w-4 opacity-50" />}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </ScrollArea>
                {/* Note about Mock Data */}
                <div className="p-2 text-[10px] text-muted-foreground text-center border-t bg-muted/10">
                    Preview Mode (Using Mock Data)
                </div>
            </div>

            {/* --- Column 2: Roles --- */}
            <div className="flex-1 min-w-[300px] border-r flex flex-col bg-card/50">
                <div className="p-3 border-b bg-muted/20 font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Assigned Roles
                </div>
                {!selectedUser ? (
                    <ColumnEmpty msg="Select a user to view roles" />
                ) : (
                    <ScrollArea className="flex-1">
                        {loadingUserRoles ? <ColumnLoading /> : (
                            <div className="p-2 space-y-1">
                                {!userRoles || userRoles.length === 0 ? (
                                    <ColumnEmpty msg={`${selectedUser.name} has no roles assigned.`} />
                                ) : (
                                    userRoles.map(role => (
                                        <button
                                            key={role.id}
                                            onClick={() => setSelectedRole(role)}
                                            className={clsx(
                                                "w-full text-left p-3 rounded-md flex items-center justify-between transition-colors text-sm",
                                                selectedRole?.id === role.id
                                                    ? "bg-secondary text-secondary-foreground"
                                                    : "hover:bg-muted/60"
                                            )}
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium">{role.name}</span>
                                                {role.description && <span className="text-xs opacity-70 truncate max-w-[200px]">{role.description}</span>}
                                            </div>
                                            {selectedRole?.id === role.id && <ChevronRight className="h-4 w-4 opacity-50" />}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </ScrollArea>
                )}
            </div>

            {/* --- Column 3: Permissions --- */}
            <div className="flex-1 min-w-[300px] flex flex-col bg-card/30">
                <div className="p-3 border-b bg-muted/20 font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Role Permissions
                </div>
                {!selectedRole ? (
                    <ColumnEmpty msg="Select a role to view permissions" />
                ) : (
                    <ScrollArea className="flex-1">
                        {loadingRolePerms ? <ColumnLoading /> : (
                            <div className="p-2 space-y-1">
                                {!rolePermissions || rolePermissions.length === 0 ? (
                                    <ColumnEmpty msg={`Role "${selectedRole.name}" has no permissions.`} />
                                ) : (
                                    rolePermissions.map(perm => (
                                        <div
                                            key={perm.id}
                                            className="p-3 rounded-md border bg-background flex items-center gap-3 text-sm animate-in fade-in slide-in-from-left-2 duration-300"
                                        >
                                            <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                                                <Check className="h-3 w-3 text-green-600" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-mono font-medium">{perm.name}</span>
                                                {perm.description && (
                                                    <span className="text-xs text-muted-foreground">{perm.description}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </ScrollArea>
                )}
            </div>
        </div>
    );
};

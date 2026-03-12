import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, User as UserIcon, Shield, Check, Lock, Loader2, ShieldCheck } from "lucide-react";
import clsx from "clsx";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";

import { useRolePermissionsQuery, useUserRolesQuery } from "@/api/queries/rbac";
import { useUsersListQuery } from "@/api/queries/users";
import type { User } from "@/api/users";
import type { Role } from "@/api/rbac";

const EMPTY_USERS: User[] = [];

export const HierarchyExplorer = () => {
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const navigate = useNavigate();

    // --- Column 1: Users (from real backend) ---
    const { data: usersData, isLoading: loadingUsers } = useUsersListQuery({ q: searchQuery || undefined });

    const users = usersData?.users ?? EMPTY_USERS;
    const userOptions = useMemo(() => {
        const mapped = users.map((user) => ({
            value: user.id,
            label: `${user.name} (${user.email})`,
        }));

        if (!selectedUser || mapped.some((option) => option.value === selectedUser.id)) {
            return mapped;
        }

        return [
            { value: selectedUser.id, label: `${selectedUser.name} (${selectedUser.email})` },
            ...mapped,
        ];
    }, [users, selectedUser]);

    // --- Column 2: User Roles (from real RBAC API) ---
    const { data: userRoles, isLoading: loadingUserRoles } = useUserRolesQuery(selectedUser?.id);

    // --- Column 3: Role Permissions (from real RBAC API) ---
    const { data: rolePermissions, isLoading: loadingRolePerms } = useRolePermissionsQuery(selectedRole?.id);

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
        <div className="rounded-lg border bg-card shadow-sm h-auto md:h-[600px] flex overflow-hidden flex-col md:flex-row text-foreground">
            {/* --- Column 1: Users --- */}
            <div className="flex flex-col bg-card border-b md:border-b-0 md:flex-1 md:min-w-[300px] md:border-r">
                <div className="p-3 border-b bg-muted/20 font-medium flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    Users
                </div>
                {/* Search Input */}
                <div className="p-2 border-b">
                    <Combobox
                        value={selectedUser?.id}
                        options={userOptions}
                        onChange={(userId) => {
                            const nextUser = users.find((user) => user.id === userId)
                                ?? (selectedUser?.id === userId ? selectedUser : null);
                            if (!nextUser) return;
                            setSelectedUser(nextUser);
                            setSelectedRole(null);
                        }}
                        onSearchChange={setSearchQuery}
                        shouldFilterClientSide={false}
                        searchDebounceMs={300}
                        minSearchLength={0}
                        isLoading={loadingUsers}
                        placeholder="Search users..."
                        searchPlaceholder="Type name or email..."
                        emptyText="No users found"
                        loadingText="Searching users..."
                        className="h-11 text-sm"
                        triggerAriaLabel="Search and select user"
                        triggerTestId="access-flow-user-search-combobox"
                    />
                </div>
                <ScrollArea className="max-h-[260px] md:max-h-none md:flex-1">
                    {loadingUsers ? <ColumnLoading /> : (
                        <div className="p-2 space-y-1">
                            {users.length === 0 ? <ColumnEmpty msg="No users found" /> : (
                                users.map(user => (
                                    <div
                                        key={user.id}
                                        data-testid="access-flow-user-item"
                                        onClick={() => {
                                            setSelectedUser(user);
                                            setSelectedRole(null); // Reset downstream selection
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setSelectedUser(user);
                                                setSelectedRole(null); // Reset downstream selection
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={selectedUser?.id === user.id}
                                        aria-label={`Select user ${user.name}`}
                                        className={clsx(
                                            "w-full text-left p-3 rounded-md flex items-center justify-between transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2",
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
                                        <div className="flex items-center gap-1">
                                            {selectedUser?.id === user.id && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    data-testid="access-flow-manage-access-button"
                                                    className={clsx(
                                                        "h-9 w-9 rounded-sm transition-colors",
                                                        selectedUser?.id === user.id ? "hover:bg-primary-foreground/20 text-primary-foreground" : "hover:bg-muted"
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/settings/users/${user.id}`);
                                                    }}
                                                    title="Manage Access"
                                                    aria-label={`Manage access for ${user.name}`}
                                                >
                                                    <ShieldCheck className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {selectedUser?.id === user.id && <ChevronRight className="h-4 w-4 opacity-50" />}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </ScrollArea>
                {/* User count */}
                <div className="p-2 text-[10px] text-muted-foreground text-center border-t bg-muted/10">
                    {usersData?.total ?? 0} users found
                </div>
            </div>

            {/* --- Column 2: Roles --- */}
            <div className="flex flex-col bg-card/50 border-b md:border-b-0 md:flex-1 md:min-w-[300px] md:border-r">
                <div className="p-3 border-b bg-muted/20 font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Assigned Roles
                </div>
                {!selectedUser ? (
                    <ColumnEmpty msg="Select a user to view roles" />
                ) : (
                    <ScrollArea className="max-h-[220px] md:max-h-none md:flex-1">
                        {loadingUserRoles ? <ColumnLoading /> : (
                            <div className="p-2 space-y-1">
                                {!userRoles || userRoles.length === 0 ? (
                                    <ColumnEmpty msg={`${selectedUser.name} has no roles assigned.`} />
                                ) : (
                                    userRoles.map(role => (
                                        <button
                                            key={role.id}
                                            type="button"
                                            onClick={() => setSelectedRole(role)}
                                            aria-pressed={selectedRole?.id === role.id}
                                            className={clsx(
                                                "w-full text-left p-3 rounded-md flex items-center justify-between transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2",
                                                selectedRole?.id === role.id
                                                    ? "bg-secondary text-secondary-foreground"
                                                    : "hover:bg-muted/60"
                                            )}
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium">{role.name}</span>
                                                {role.description && (
                                                    <span className="text-xs opacity-70 truncate max-w-[200px]" title={role.description}>
                                                        {role.description}
                                                    </span>
                                                )}
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
            <div className="flex flex-col bg-card/30 md:flex-1 md:min-w-[300px]">
                <div className="p-3 border-b bg-muted/20 font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Role Permissions
                </div>
                {!selectedRole ? (
                    <ColumnEmpty msg="Select a role to view permissions" />
                ) : (
                    <ScrollArea className="max-h-[220px] md:max-h-none md:flex-1">
                        {loadingRolePerms ? <ColumnLoading /> : (
                            <div className="p-2 space-y-1">
                                {!rolePermissions || rolePermissions.length === 0 ? (
                                    <ColumnEmpty msg={`Role "${selectedRole.name}" has no permissions.`} />
                                ) : (
                                    rolePermissions.map(perm => (
                                        <div
                                            key={perm.id}
                                            className="p-3 rounded-md border bg-background flex items-center gap-3 text-sm motion-static-list animate-in fade-in slide-in-from-left-2"
                                        >
                                            <div className="h-6 w-6 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                                                <Check className="h-3 w-3 text-success" />
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

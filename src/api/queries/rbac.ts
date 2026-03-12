import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
    rbacApi,
    type AuditLogResponse,
    type EffectivePermissionsResponse,
    type Permission,
    type Role,
} from "@/api/rbac";

export type RoleWithPermissions = {
    role: Role;
    permissions: Permission[];
};

const RBAC_QUERY_KEY = ["rbac"] as const;

export const rbacKeys = {
    all: RBAC_QUERY_KEY,
    roles: [...RBAC_QUERY_KEY, "roles"] as const,
    permissions: [...RBAC_QUERY_KEY, "permissions"] as const,
    rolePermissions: (roleId: string) => [...RBAC_QUERY_KEY, "role-permissions", roleId] as const,
    rolesWithPermissions: [...RBAC_QUERY_KEY, "roles-with-permissions"] as const,
    userRoles: (userId: string) => [...RBAC_QUERY_KEY, "user-roles", userId] as const,
    userPermissions: (userId: string) => [...RBAC_QUERY_KEY, "user-permissions", userId] as const,
    auditLogs: (page: number, actionFilter: string) =>
        [...RBAC_QUERY_KEY, "audit-logs", { page, actionFilter }] as const,
};

export function useRolesQuery(options?: { enabled?: boolean }) {
    return useQuery<Role[]>({
        queryKey: rbacKeys.roles,
        queryFn: rbacApi.listRoles,
        enabled: options?.enabled ?? true,
    });
}

export function usePermissionsQuery(options?: { enabled?: boolean }) {
    return useQuery<Permission[]>({
        queryKey: rbacKeys.permissions,
        queryFn: rbacApi.listPermissions,
        enabled: options?.enabled ?? true,
    });
}

export function useRolesWithPermissionsQuery(options?: { enabled?: boolean }) {
    return useQuery<RoleWithPermissions[]>({
        queryKey: rbacKeys.rolesWithPermissions,
        queryFn: async () => {
            const roles = await rbacApi.listRoles();
            const enriched = await Promise.all(
                roles.map(async (role) => {
                    try {
                        const permissions = await rbacApi.getRolePermissions(role.id);
                        return { role, permissions };
                    } catch (error) {
                        console.warn(`Failed to fetch permissions for role ${role.id}`, error);
                        return { role, permissions: [] };
                    }
                }),
            );
            return enriched;
        },
        enabled: options?.enabled ?? true,
    });
}

export function useRolePermissionsQuery(roleId?: string, options?: { enabled?: boolean }) {
    return useQuery<Permission[]>({
        queryKey: rbacKeys.rolePermissions(roleId ?? ""),
        queryFn: () => (roleId ? rbacApi.getRolePermissions(roleId) : Promise.resolve([])),
        enabled: Boolean(roleId) && (options?.enabled ?? true),
    });
}

export function useUserRolesQuery(userId?: string, options?: { enabled?: boolean }) {
    return useQuery<Role[]>({
        queryKey: rbacKeys.userRoles(userId ?? ""),
        queryFn: () => (userId ? rbacApi.getUserRoles(userId) : Promise.resolve([])),
        enabled: Boolean(userId) && (options?.enabled ?? true),
    });
}

export function useUserEffectivePermissionsQuery(userId?: string, options?: { enabled?: boolean }) {
    return useQuery<EffectivePermissionsResponse>({
        queryKey: rbacKeys.userPermissions(userId ?? ""),
        queryFn: () => (userId ? rbacApi.getUserEffectivePermissions(userId) : Promise.resolve({ user_id: "", roles: [], permissions: [] })),
        enabled: Boolean(userId) && (options?.enabled ?? true),
    });
}

export function useAuditLogsQuery(
    params: { page: number; actionFilter: string },
    options?: { enabled?: boolean },
) {
    return useQuery<AuditLogResponse>({
        queryKey: rbacKeys.auditLogs(params.page, params.actionFilter),
        queryFn: () =>
            rbacApi.listAuditLogs({
                page: params.page,
                per_page: 20,
                action: params.actionFilter === "all" ? undefined : params.actionFilter,
            }),
        enabled: options?.enabled ?? true,
    });
}

export function useCreateRoleMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: rbacApi.createRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: rbacKeys.roles });
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolesWithPermissions });
        },
    });
}

export function useDeleteRoleMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: rbacApi.deleteRole,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: rbacKeys.roles });
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolesWithPermissions });
        },
    });
}

export function useAssignPermissionToRoleMutation(roleId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (permissionId: string) => {
            if (!roleId) throw new Error("roleId is required");
            return rbacApi.assignPermissionToRole(roleId, { permission_id: permissionId });
        },
        onSuccess: () => {
            if (!roleId) return;
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolePermissions(roleId) });
            queryClient.invalidateQueries({ queryKey: rbacKeys.rolesWithPermissions });
        },
    });
}

export function useAssignRoleToUserMutation(userId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (roleId: string) => {
            if (!userId) throw new Error("userId is required");
            return rbacApi.assignRoleToUser(userId, { role_id: roleId });
        },
        onSuccess: () => {
            if (!userId) return;
            queryClient.invalidateQueries({ queryKey: rbacKeys.userRoles(userId) });
            queryClient.invalidateQueries({ queryKey: rbacKeys.userPermissions(userId) });
        },
    });
}

export function useRevokeRoleFromUserMutation(userId?: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (roleId: string) => {
            if (!userId) throw new Error("userId is required");
            return rbacApi.revokeRoleFromUser(userId, roleId);
        },
        onSuccess: () => {
            if (!userId) return;
            queryClient.invalidateQueries({ queryKey: rbacKeys.userRoles(userId) });
            queryClient.invalidateQueries({ queryKey: rbacKeys.userPermissions(userId) });
        },
    });
}

import { api } from "@/api/client";
import type { components } from "@/types/api";

// Types
export type Role = components["schemas"]["Role"];
export type RoleCreateRequest = components["schemas"]["RoleCreateRequest"];
export type RolePermission = components["schemas"]["RolePermission"];
export type Permission = components["schemas"]["Permission"];
export type EffectivePermission = components["schemas"]["EffectivePermission"];
export type EffectivePermissionsResponse = components["schemas"]["EffectivePermissions"];
export type AssignRoleRequest = components["schemas"]["AssignRoleRequest"];
export type AssignPermissionToRoleRequest = components["schemas"]["AssignPermissionToRoleRequest"];

export const rbacApi = {
    // Roles
    async listRoles(): Promise<Role[]> {
        const { data } = await api.get<Role[]>("/rbac/roles");
        return data;
    },

    async createRole(payload: RoleCreateRequest): Promise<Role> {
        const { data } = await api.post<Role>("/rbac/roles", payload);
        return data;
    },

    async getRole(id: string): Promise<Role> {
        const { data } = await api.get<Role>(`/rbac/roles/${id}`);
        return data;
    },

    async deleteRole(id: string): Promise<void> {
        await api.delete(`/rbac/roles/${id}`);
    },

    async assignPermissionToRole(roleId: string, payload: AssignPermissionToRoleRequest): Promise<void> {
        await api.post(`/rbac/roles/${roleId}/permissions`, payload);
    },

    async revokePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
        await api.delete(`/rbac/roles/${roleId}/permissions/${permissionId}`);
    },

    async getRolePermissions(roleId: string): Promise<Permission[]> {
        const { data } = await api.get<Permission[]>(`/rbac/roles/${roleId}/permissions`);
        return data;
    },

    // Permissions
    async listPermissions(): Promise<Permission[]> {
        const { data } = await api.get<Permission[]>("/rbac/permissions");
        return data;
    },

    // User Access
    async getUserEffectivePermissions(userId: string): Promise<EffectivePermissionsResponse> {
        const { data } = await api.get<EffectivePermissionsResponse>(`/rbac/users/${userId}/effective-permissions`);
        return data;
    },

    async getUserRoles(userId: string): Promise<Role[]> {
        const { data } = await api.get<Role[]>(`/rbac/users/${userId}/roles`);
        return data;
    },

    async assignRoleToUser(userId: string, payload: AssignRoleRequest): Promise<void> {
        await api.post(`/rbac/users/${userId}/roles`, payload);
    },

    async revokeRoleFromUser(userId: string, roleId: string): Promise<void> {
        await api.delete(`/rbac/users/${userId}/roles/${roleId}`);
    }
};

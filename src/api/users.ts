import { api } from "@/api/client";
import { normalizeApiSearchQuery } from "@/lib/apiSearch";
import type { components } from "@/types/api";

// Re-using the User type from components
export type User = components["schemas"]["User"];

export interface ListUsersParams {
    q?: string;
    page?: number;
    per_page?: number;
}

export interface ListUsersResponse {
    users: User[];
    total: number;
}

export const usersApi = {
    /**
     * Fetches users from the backend with optional search and pagination.
     * Returns an object with users array and total count from X-Total-Count header.
     */
    async listUsers(params?: ListUsersParams): Promise<ListUsersResponse> {
        const normalizedParams = params
            ? {
                ...params,
                ...(params.q !== undefined ? { q: normalizeApiSearchQuery(params.q) } : {}),
            }
            : undefined;
        const response = await api.get<User[]>("/users", { params: normalizedParams });
        const users = Array.isArray(response.data) ? response.data : [];
        const headerValue = response.headers["x-total-count"] || response.headers["X-Total-Count"];
        const parsedTotal = Number.parseInt(String(headerValue ?? ""), 10);
        return {
            users,
            total: Number.isFinite(parsedTotal) ? parsedTotal : users.length,
        };
    },

    /**
     * Simple list that just returns the users array (for backward compatibility).
     */
    async listUsersSimple(): Promise<User[]> {
        const { users } = await this.listUsers();
        return users;
    }
};

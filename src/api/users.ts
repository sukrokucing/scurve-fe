import { api } from "@/api/client";
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
        const response = await api.get<User[]>("/users", { params });
        const total = parseInt(response.headers["x-total-count"] || "0", 10);
        return {
            users: response.data,
            total
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

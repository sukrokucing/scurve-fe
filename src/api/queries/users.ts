import { useQuery } from "@tanstack/react-query";

import { usersApi, type ListUsersParams, type ListUsersResponse } from "@/api/users";
import { normalizeApiSearchQuery } from "@/lib/apiSearch";

const USERS_QUERY_KEY = ["users"] as const;

export const usersKeys = {
    all: USERS_QUERY_KEY,
    list: (params: ListUsersParams) => [...USERS_QUERY_KEY, "list", params] as const,
    lookup: [...USERS_QUERY_KEY, "lookup"] as const,
};

function normalizeUsersParams(params: ListUsersParams): ListUsersParams {
    const normalizedQuery = normalizeApiSearchQuery(params.q);
    return {
        ...(normalizedQuery ? { q: normalizedQuery } : {}),
        ...(params.page ? { page: params.page } : {}),
        ...(params.per_page ? { per_page: params.per_page } : {}),
    };
}

export function useUsersListQuery(params: ListUsersParams, options?: { enabled?: boolean }) {
    const normalizedParams = normalizeUsersParams(params);
    return useQuery<ListUsersResponse>({
        queryKey: usersKeys.list(normalizedParams),
        queryFn: () => usersApi.listUsers(normalizedParams),
        enabled: options?.enabled ?? true,
        placeholderData: (previous) => previous,
    });
}

export function useUsersLookupQuery(options?: { enabled?: boolean }) {
    return useQuery<ListUsersResponse>({
        queryKey: usersKeys.lookup,
        queryFn: () => usersApi.listUsers({ page: 1, per_page: 500 }),
        enabled: options?.enabled ?? true,
        staleTime: 5 * 60 * 1000,
    });
}

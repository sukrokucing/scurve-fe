import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { openapi } from "@/api/openapiClient";
import type {
    ApiNotification,
    ApiNotificationUnreadCountResponse,
    ApiNotificationsReadResponse,
} from "@/api/openapiClient";

const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;

export const notificationsKeys = {
    all: NOTIFICATIONS_QUERY_KEY,
    list: () => [...NOTIFICATIONS_QUERY_KEY, "list"] as const,
    unreadCount: () => [...NOTIFICATIONS_QUERY_KEY, "unread-count"] as const,
};

export function useNotificationsQuery(options?: { enabled?: boolean }) {
    return useQuery<ApiNotification[]>({
        queryKey: notificationsKeys.list(),
        queryFn: async () => {
            const rows = await openapi.listNotifications();
            return [...rows].sort((left, right) => (
                new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()
            ));
        },
        enabled: options?.enabled ?? true,
    });
}

export function useUnreadNotificationCountQuery(options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
}) {
    return useQuery<ApiNotificationUnreadCountResponse>({
        queryKey: notificationsKeys.unreadCount(),
        queryFn: () => openapi.getUnreadNotificationCount(),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval,
    });
}

export function useMarkNotificationsReadMutation() {
    const queryClient = useQueryClient();

    return useMutation<ApiNotificationsReadResponse, unknown, string[]>({
        mutationFn: async (ids) => openapi.markNotificationsRead({ ids }),
        onSuccess: (data, ids) => {
            queryClient.setQueryData(notificationsKeys.unreadCount(), data);
            queryClient.invalidateQueries({ queryKey: notificationsKeys.list(), refetchType: "none" });

            queryClient.setQueryData<ApiNotification[] | undefined>(
                notificationsKeys.list(),
                (current) => current?.map((notification) => (
                    ids.includes(notification.id)
                        ? {
                            ...notification,
                            unread: false,
                            read_at: notification.read_at ?? new Date().toISOString(),
                        }
                        : notification
                )),
            );
        },
    });
}

export function useMarkAllNotificationsReadMutation() {
    const queryClient = useQueryClient();

    return useMutation<ApiNotificationsReadResponse>({
        mutationFn: () => openapi.markNotificationsReadAll(),
        onSuccess: (data) => {
            queryClient.setQueryData(notificationsKeys.unreadCount(), data);
            queryClient.setQueryData<ApiNotification[] | undefined>(
                notificationsKeys.list(),
                (current) => current?.map((notification) => ({
                    ...notification,
                    unread: false,
                    read_at: notification.read_at ?? new Date().toISOString(),
                })),
            );
            queryClient.invalidateQueries({ queryKey: notificationsKeys.list(), refetchType: "none" });
        },
    });
}

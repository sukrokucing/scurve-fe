import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell, CheckCheck, Loader2, Radio } from "lucide-react";

import {
    useMarkAllNotificationsReadMutation,
    useMarkNotificationsReadMutation,
    useNotificationsQuery,
    useUnreadNotificationCountQuery,
} from "@/api/queries/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getRealtimeRouteLabel } from "@/lib/realtimePresentation";
import { cn } from "@/lib/utils";
import { useRealtimeStore } from "@/store/realtimeStore";
import { toast } from "sonner";

import type { ApiNotification } from "@/api/openapiClient";

function getNotificationRoute(notification: ApiNotification) {
    if (notification.route?.trim()) return notification.route;

    const projectId = notification.project_id;
    if (!projectId) return "/";
    return `/tasks?project=${projectId}`;
}

function getSeverityBadgeVariant(notification: ApiNotification) {
    if (notification.severity === "critical") return "destructive";
    if (notification.severity === "important") return "default";
    return "outline";
}

function NotificationList({
    connectionStatus,
    currentRoute,
    isLoading,
    items,
    onMarkAllRead,
    onSelect,
    unreadCount,
}: {
    connectionStatus: string;
    currentRoute: string;
    isLoading: boolean;
    items: ApiNotification[];
    onMarkAllRead: () => void;
    onSelect: (notification: ApiNotification) => void;
    unreadCount: number;
}) {
    const criticalUnreadCount = items.filter((item) => item.unread && item.severity === "critical").length;
    const importantUnreadCount = items.filter((item) => item.unread && item.severity === "important").length;

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 px-4 py-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
                        <Badge variant="outline">{unreadCount} unread</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Project-scoped updates that your current RBAC visibility allows you to see.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {criticalUnreadCount > 0 ? (
                            <Badge variant="destructive">{criticalUnreadCount} critical</Badge>
                        ) : null}
                        {importantUnreadCount > 0 ? (
                            <Badge variant="warning">{importantUnreadCount} important</Badge>
                        ) : null}
                        {criticalUnreadCount === 0 && importantUnreadCount === 0 && unreadCount > 0 ? (
                            <Badge variant="outline">All unread items are low-noise</Badge>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge
                        variant="outline"
                        className={cn(
                            "gap-1 text-xs",
                            connectionStatus === "connected"
                                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                : connectionStatus === "connecting"
                                    ? "border-amber-500/40 text-amber-800 dark:text-amber-300"
                                    : "text-muted-foreground",
                        )}
                    >
                        <Radio className={cn(
                            "h-3 w-3",
                            connectionStatus === "connected" ? "text-emerald-500" : "text-muted-foreground",
                        )} />
                        {connectionStatus === "connected"
                            ? "Live"
                            : connectionStatus === "connecting"
                                ? "Connecting"
                                : "REST fallback"}
                    </Badge>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3"
                        onClick={onMarkAllRead}
                        disabled={unreadCount === 0}
                        data-testid="notifications-mark-all-read-button"
                    >
                        <CheckCheck className="h-4 w-4" />
                        Mark all read
                    </Button>
                </div>
            </div>
            <Separator />
            <ScrollArea className="h-[min(70vh,28rem)]">
                {isLoading ? (
                    <div className="space-y-3 p-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ) : items.length > 0 ? (
                    <div className="divide-y">
                        {items.map((notification) => {
                            const targetRoute = getNotificationRoute(notification);
                            const isCurrentTarget = targetRoute === currentRoute;
                            const routeLabel = getRealtimeRouteLabel(targetRoute);

                            return (
                                <button
                                    key={notification.id}
                                    type="button"
                                    className={cn(
                                        "flex w-full flex-col gap-1 border-l-2 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2",
                                        notification.unread ? "bg-primary/5" : "bg-background",
                                        notification.severity === "critical"
                                            ? "border-l-destructive/70"
                                            : notification.severity === "important"
                                                ? "border-l-warning/70"
                                                : "border-l-transparent",
                                    )}
                                    onClick={() => onSelect(notification)}
                                    data-testid="notification-item"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium text-foreground">
                                                    {notification.title}
                                                </span>
                                                {notification.unread ? (
                                                    <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                                                        New
                                                    </Badge>
                                                ) : null}
                                                {notification.project_name ? (
                                                    <Badge variant="outline">{notification.project_name}</Badge>
                                                ) : null}
                                                {notification.severity !== "noise" ? (
                                                    <Badge variant={getSeverityBadgeVariant(notification)}>
                                                        {notification.severity === "critical" ? "Critical" : "Important"}
                                                    </Badge>
                                                ) : null}
                                                {routeLabel ? (
                                                    <Badge variant="secondary">Open {routeLabel}</Badge>
                                                ) : null}
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {notification.message}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {formatDistanceToNowStrict(new Date(notification.occurred_at), { addSuffix: true })}
                                        </span>
                                    </div>
                                    {isCurrentTarget ? (
                                        <span className="text-xs text-muted-foreground">
                                            You are already on the most likely destination. This will still mark the update as read.
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-2 px-4 py-10 text-center">
                        <p className="text-sm font-medium text-foreground">No notifications yet</p>
                        <p className="text-sm text-muted-foreground">
                            New task and project changes will appear here when backend visibility allows them.
                        </p>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}

export function NotificationIndicator() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isDesktopOpen, setIsDesktopOpen] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const connectionStatus = useRealtimeStore((state) => state.connectionStatus);

    const listEnabled = isDesktopOpen || isMobileOpen;
    const { data: unreadCountPayload, isLoading: isUnreadCountLoading } = useUnreadNotificationCountQuery({
        refetchInterval: connectionStatus === "connected" ? false : 60000,
    });
    const { data: notifications = [], isLoading: isNotificationsLoading } = useNotificationsQuery({
        enabled: listEnabled,
    });
    const markNotificationsReadMutation = useMarkNotificationsReadMutation();
    const markAllNotificationsReadMutation = useMarkAllNotificationsReadMutation();

    useEffect(() => {
        setIsDesktopOpen(false);
        setIsMobileOpen(false);
    }, [location.pathname, location.search]);

    const unreadCount = unreadCountPayload?.unread_count ?? 0;
    const currentRoute = useMemo(
        () => `${location.pathname}${location.search}`,
        [location.pathname, location.search],
    );

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsReadMutation.mutateAsync();
        } catch {
            toast.error("Could not mark notifications as read.");
        }
    };

    const handleSelect = async (notification: ApiNotification) => {
        if (notification.unread) {
            try {
                await markNotificationsReadMutation.mutateAsync([notification.id]);
            } catch {
                toast.error("Could not mark this notification as read.");
            }
        }

        const targetRoute = getNotificationRoute(notification);
        setIsDesktopOpen(false);
        setIsMobileOpen(false);
        navigate(targetRoute);
    };

    const trigger = (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative h-11 w-11 rounded-full border-border/70 bg-background/80 shadow-sm"
            aria-label={`Open notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            data-testid="notification-indicator-trigger"
        >
            <Bell className="h-5 w-5" />
            {isUnreadCountLoading ? (
                <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin rounded-full bg-background p-0.5 text-muted-foreground" />
            ) : null}
            {unreadCount > 0 ? (
                <span
                    className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                    data-testid="notification-unread-count-badge"
                >
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            ) : null}
            <span
                className={cn(
                    "absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-background",
                    connectionStatus === "connected"
                        ? "bg-emerald-500"
                        : connectionStatus === "connecting"
                            ? "bg-amber-500"
                            : "bg-muted-foreground/40",
                )}
                aria-hidden="true"
            />
        </Button>
    );

    return (
        <>
            <div className="hidden md:block">
                <Popover open={isDesktopOpen} onOpenChange={setIsDesktopOpen}>
                    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                    <PopoverContent
                        align="end"
                        className="w-[min(92vw,26rem)] p-0"
                        data-testid="notifications-popover"
                    >
                        <NotificationList
                            connectionStatus={connectionStatus}
                            currentRoute={currentRoute}
                            isLoading={isNotificationsLoading}
                            items={notifications}
                            onMarkAllRead={handleMarkAllRead}
                            onSelect={handleSelect}
                            unreadCount={unreadCount}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            <div className="md:hidden">
                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                    <SheetTrigger asChild>{trigger}</SheetTrigger>
                    <SheetContent
                        side="right"
                        className="w-[min(100vw,28rem)] p-0"
                        data-testid="notifications-sheet"
                    >
                        <SheetHeader className="px-4 pt-4 text-left">
                            <SheetTitle>Notifications</SheetTitle>
                            <SheetDescription>
                                Project updates your current RBAC visibility allows you to receive.
                            </SheetDescription>
                        </SheetHeader>
                        <Separator className="mt-4" />
                        <NotificationList
                            connectionStatus={connectionStatus}
                            currentRoute={currentRoute}
                            isLoading={isNotificationsLoading}
                            items={notifications}
                            onMarkAllRead={handleMarkAllRead}
                            onSelect={handleSelect}
                            unreadCount={unreadCount}
                        />
                    </SheetContent>
                </Sheet>
            </div>
        </>
    );
}

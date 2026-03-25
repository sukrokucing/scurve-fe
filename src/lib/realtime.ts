import { notificationsKeys } from "@/api/queries/notifications";
import { projectsKeys } from "@/api/queries/projects";
import { tasksKeys } from "@/api/queries/tasks";
import { queryClient } from "@/lib/queryClient";
import { useRealtimeStore } from "@/store/realtimeStore";

import type { components } from "@/types/api";

type RealtimeClientCommand = components["schemas"]["RealtimeClientCommand"];
type RealtimeErrorMessage = components["schemas"]["RealtimeErrorMessage"];
type RealtimeEvent = components["schemas"]["RealtimeEvent"];
type RealtimePresenceMetadata = components["schemas"]["RealtimePresenceMetadata"];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isRealtimeActor(value: unknown): value is RealtimeEvent["actor"] {
    return isRecord(value)
        && typeof value.id === "string"
        && typeof value.name === "string";
}

function isRealtimeEventMessage(value: unknown): value is RealtimeEvent {
    return isRecord(value)
        && typeof value.event_id === "string"
        && typeof value.family === "string"
        && typeof value.entity_type === "string"
        && typeof value.change_type === "string"
        && typeof value.occurred_at === "string"
        && isRealtimeActor(value.actor);
}

function isRealtimeErrorMessage(value: unknown): value is RealtimeErrorMessage {
    return isRecord(value)
        && typeof value.error === "string"
        && typeof value.message === "string";
}

function uniqSorted(values: string[]) {
    return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function safeParseSocketPayload(payload: string) {
    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

function isPresenceMetadata(value: RealtimeEvent["metadata"]): value is RealtimePresenceMetadata {
    return Boolean(value && typeof value === "object" && "user_id" in value && "status" in value && "last_seen_at" in value);
}

const DISCONNECT_GRACE_MS = 150;

export function buildRealtimeWebSocketUrl(token: string) {
    if (typeof window === "undefined") return null;

    const rawBaseUrl = import.meta.env.DEV
        ? window.location.origin
        : (import.meta.env.VITE_API_URL || window.location.origin);

    const url = new URL(rawBaseUrl, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/realtime/ws";
    url.search = "";
    url.searchParams.set("token", token);
    return url.toString();
}

function applyRealtimeEventSideEffects(event: RealtimeEvent) {
    if (event.family === "notification") {
        queryClient.invalidateQueries({ queryKey: notificationsKeys.list(), refetchType: "none" });

        if (typeof event.unread_count === "number") {
            queryClient.setQueryData(notificationsKeys.unreadCount(), {
                unread_count: event.unread_count,
            });
        } else {
            queryClient.invalidateQueries({ queryKey: notificationsKeys.unreadCount(), refetchType: "none" });
        }
    }

    if (event.family === "data_changed" && event.project_id) {
        queryClient.invalidateQueries({ queryKey: tasksKeys.projectScope(event.project_id), exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.detail(event.project_id), exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.dashboard(event.project_id, "progress"), exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.resourceRoleRates(event.project_id), exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.members(event.project_id), exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.taskHealthRules(event.project_id), exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.all, exact: false, refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: projectsKeys.myScopes, exact: false, refetchType: "none" });
    }
}

class RealtimeClient {
    private activeProjectIds = new Set<string>();
    private disconnectTimer: ReturnType<typeof window.setTimeout> | null = null;
    private manualDisconnect = false;
    private pingTimer: ReturnType<typeof window.setInterval> | null = null;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof window.setTimeout> | null = null;
    private socket: WebSocket | null = null;
    private socketUrl: string | null = null;
    private token: string | null = null;
    private desiredProjectIds: string[] = [];
    private desiredRoute: string | null = null;
    private lastSubscribedRoute: string | null = null;

    connect(token: string, projectIds: string[], route: string | null) {
        this.clearDisconnectTimer();
        this.token = token;
        this.desiredProjectIds = uniqSorted(projectIds);
        this.desiredRoute = route ?? null;
        useRealtimeStore.getState().setEligibleProjectIds(this.desiredProjectIds);

        const nextSocketUrl = buildRealtimeWebSocketUrl(token);
        if (!nextSocketUrl) return;

        this.manualDisconnect = false;

        const shouldReconnect = !this.socket
            || this.socket.readyState === WebSocket.CLOSED
            || this.socket.readyState === WebSocket.CLOSING
            || this.socketUrl !== nextSocketUrl;

        if (shouldReconnect) {
            this.teardownSocket();
            this.open(nextSocketUrl);
            return;
        }

        const activeSocket = this.socket;
        if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
            useRealtimeStore.getState().setConnectionStatus("connected");
            this.syncSubscriptions();
            return;
        }

        if (activeSocket && activeSocket.readyState === WebSocket.CONNECTING) {
            useRealtimeStore.getState().setConnectionStatus("connecting");
        }
    }

    disconnect() {
        this.manualDisconnect = true;
        this.clearDisconnectTimer();
        this.clearReconnectTimer();
        this.stopPing();
        this.activeProjectIds.clear();
        this.lastSubscribedRoute = null;
        useRealtimeStore.getState().clearConnectionState();

        this.disconnectTimer = window.setTimeout(() => {
            this.disconnectTimer = null;
            if (this.socket) {
                this.socket.close(1000, "client-disconnect");
            }
            this.teardownSocket();
        }, DISCONNECT_GRACE_MS);
    }

    private clearDisconnectTimer() {
        if (this.disconnectTimer) {
            window.clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
        }
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private handleRealtimeError(errorMessage: RealtimeErrorMessage) {
        // Permission-related subscription denials are expected under RBAC.
        if (/permission|forbidden|not allowed|project\.view/i.test(`${errorMessage.error} ${errorMessage.message}`)) {
            useRealtimeStore.getState().setConnectionStatus("connected", errorMessage.message);
            return;
        }

        useRealtimeStore.getState().setConnectionStatus("error", errorMessage.message);
    }

    private handleRealtimeEvent(event: RealtimeEvent) {
        if (event.family === "presence" && isPresenceMetadata(event.metadata) && event.metadata.route) {
            this.lastSubscribedRoute = event.metadata.route;
        }
        useRealtimeStore.getState().applyEvent(event);
        applyRealtimeEventSideEffects(event);
    }

    private open(socketUrl: string) {
        this.clearReconnectTimer();
        this.socketUrl = socketUrl;
        useRealtimeStore.getState().setConnectionStatus("connecting");

        const socket = new WebSocket(socketUrl);
        this.socket = socket;

        socket.addEventListener("open", () => {
            if (this.socket !== socket) return;

            this.reconnectAttempt = 0;
            this.activeProjectIds.clear();
            this.lastSubscribedRoute = null;
            useRealtimeStore.getState().setConnectionStatus("connected");
            queryClient.invalidateQueries({ queryKey: notificationsKeys.unreadCount() });
            this.startPing();
            this.syncSubscriptions();
        });

        socket.addEventListener("message", (messageEvent) => {
            const parsed = safeParseSocketPayload(typeof messageEvent.data === "string" ? messageEvent.data : "");
            if (!parsed) return;

            if (isRealtimeEventMessage(parsed)) {
                this.handleRealtimeEvent(parsed);
                return;
            }

            if (isRealtimeErrorMessage(parsed)) {
                this.handleRealtimeError(parsed);
            }
        });

        socket.addEventListener("error", () => {
            if (this.socket !== socket) return;
            useRealtimeStore.getState().setConnectionStatus("error", "Live updates are temporarily unavailable.");
        });

        socket.addEventListener("close", (closeEvent) => {
            if (this.socket !== socket) return;

            this.stopPing();
            this.activeProjectIds.clear();
            this.lastSubscribedRoute = null;
            useRealtimeStore.getState().setSubscribedProjectIds([]);

            this.socket = null;
            this.socketUrl = null;

            if (this.manualDisconnect || !this.token) {
                useRealtimeStore.getState().clearConnectionState();
                return;
            }

            const closeReason = closeEvent.reason || `Live updates disconnected (${closeEvent.code})`;
            useRealtimeStore.getState().setConnectionStatus("error", closeReason);
            this.scheduleReconnect();
        });
    }

    private scheduleReconnect() {
        this.clearReconnectTimer();
        if (!this.token) return;

        const delayMs = Math.min(10000, 1000 * 2 ** this.reconnectAttempt);
        this.reconnectAttempt += 1;

        this.reconnectTimer = window.setTimeout(() => {
            if (!this.token) return;

            const nextSocketUrl = buildRealtimeWebSocketUrl(this.token);
            if (!nextSocketUrl) return;

            this.open(nextSocketUrl);
        }, delayMs);
    }

    private sendCommand(command: RealtimeClientCommand) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify(command));
    }

    private startPing() {
        this.stopPing();
        this.pingTimer = window.setInterval(() => {
            this.sendCommand({ type: "ping" });
        }, 30000);
    }

    private stopPing() {
        if (this.pingTimer) {
            window.clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private syncSubscriptions() {
        const desired = new Set(this.desiredProjectIds);
        const active = this.activeProjectIds;
        const routeChanged = this.lastSubscribedRoute !== this.desiredRoute;

        const projectIdsToSubscribe = [...desired].filter((projectId) => !active.has(projectId));
        const projectIdsToUnsubscribe = [...active].filter((projectId) => !desired.has(projectId));

        if (projectIdsToSubscribe.length > 0) {
            this.sendCommand({
                type: "subscribe",
                project_ids: projectIdsToSubscribe,
                route: this.desiredRoute,
            });
            projectIdsToSubscribe.forEach((projectId) => active.add(projectId));
            this.lastSubscribedRoute = this.desiredRoute;
        } else if (routeChanged && desired.size > 0) {
            this.sendCommand({
                type: "subscribe",
                project_ids: [...desired],
                route: this.desiredRoute,
            });
            this.lastSubscribedRoute = this.desiredRoute;
        }

        if (projectIdsToUnsubscribe.length > 0) {
            this.sendCommand({
                type: "unsubscribe",
                project_ids: projectIdsToUnsubscribe,
            });
            projectIdsToUnsubscribe.forEach((projectId) => active.delete(projectId));
        }

        useRealtimeStore.getState().setSubscribedProjectIds([...active]);
    }

    private teardownSocket() {
        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;
        }
        this.socket = null;
        this.socketUrl = null;
    }
}

export const realtimeClient = new RealtimeClient();

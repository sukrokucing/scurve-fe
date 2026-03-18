import { create } from "zustand";

import type { components } from "@/types/api";

type RealtimeEvent = components["schemas"]["RealtimeEvent"];
type RealtimePresenceMetadata = components["schemas"]["RealtimePresenceMetadata"];
type RealtimePresenceUser = components["schemas"]["RealtimePresenceUser"];

export type RealtimeConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type RemoteChangeSignal = {
    actorName: string;
    changeType: string;
    entityType: string;
    eventId: string;
    occurredAt: string;
    projectId: string;
    summary: string;
};

type RealtimeState = {
    connectionStatus: RealtimeConnectionStatus;
    eligibleProjectIds: string[];
    lastError: string | null;
    lastPresenceEventAtByProjectId: Record<string, string>;
    recentEventIds: string[];
    remoteChangesByProjectId: Record<string, RemoteChangeSignal>;
    presenceByProjectId: Record<string, RealtimePresenceUser[]>;
    subscribedProjectIds: string[];
    applyEvent: (event: RealtimeEvent) => void;
    clearAllRemoteChanges: () => void;
    clearConnectionState: () => void;
    clearProjectRemoteChange: (projectId: string) => void;
    reset: () => void;
    setConnectionStatus: (status: RealtimeConnectionStatus, error?: string | null) => void;
    setEligibleProjectIds: (projectIds: string[]) => void;
    setSubscribedProjectIds: (projectIds: string[]) => void;
};

const MAX_RECENT_EVENT_IDS = 100;

function humanizeToken(value: string) {
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeRealtimeEvent(event: RealtimeEvent) {
    const actorName = event.actor?.name?.trim() || "A teammate";
    const entityLabel = humanizeToken(event.entity_type || "update").toLowerCase();
    const changeLabel = humanizeToken(event.change_type || "changed").toLowerCase();
    return `${actorName} ${changeLabel} ${entityLabel}`;
}

function uniqSorted(values: string[]) {
    return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function isPresenceMetadata(value: RealtimeEvent["metadata"]): value is RealtimePresenceMetadata {
    return Boolean(value && typeof value === "object" && "user_id" in value && "status" in value && "last_seen_at" in value);
}

function mergePresenceUsers(
    currentUsers: RealtimePresenceUser[],
    incomingUser: RealtimePresenceUser,
) {
    const nextUsers = currentUsers.filter((user) => user.user_id !== incomingUser.user_id);
    nextUsers.push(incomingUser);
    return nextUsers.sort((left, right) => left.name.localeCompare(right.name));
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
    connectionStatus: "idle",
    eligibleProjectIds: [],
    lastError: null,
    lastPresenceEventAtByProjectId: {},
    presenceByProjectId: {},
    recentEventIds: [],
    remoteChangesByProjectId: {},
    subscribedProjectIds: [],
    applyEvent: (event) => {
        set((state) => {
            if (state.recentEventIds.includes(event.event_id)) {
                return state;
            }

            const recentEventIds = [...state.recentEventIds, event.event_id].slice(-MAX_RECENT_EVENT_IDS);
            const nextState: Partial<RealtimeState> = { recentEventIds };

            if (event.family === "presence" && event.project_id) {
                nextState.lastPresenceEventAtByProjectId = {
                    ...state.lastPresenceEventAtByProjectId,
                    [event.project_id]: event.occurred_at,
                };

                const metadata = event.metadata;
                if (isPresenceMetadata(metadata)) {
                    if (event.change_type === "snapshot" && Array.isArray(metadata.project_snapshot)) {
                        nextState.presenceByProjectId = {
                            ...state.presenceByProjectId,
                            [event.project_id]: [...metadata.project_snapshot].sort((left, right) => left.name.localeCompare(right.name)),
                        };
                    } else {
                        const currentUsers = state.presenceByProjectId[event.project_id] ?? [];
                        const incomingName = currentUsers.find((user) => user.user_id === metadata.user_id)?.name
                            ?? event.actor?.name
                            ?? "Teammate";
                        const incomingUser: RealtimePresenceUser = {
                            user_id: metadata.user_id,
                            name: incomingName,
                            status: metadata.status,
                            last_seen_at: metadata.last_seen_at,
                            route: metadata.route ?? null,
                        };

                        nextState.presenceByProjectId = {
                            ...state.presenceByProjectId,
                            [event.project_id]: mergePresenceUsers(currentUsers, incomingUser),
                        };
                    }
                }
            }

            if (event.family === "data_changed" && event.project_id) {
                nextState.remoteChangesByProjectId = {
                    ...state.remoteChangesByProjectId,
                    [event.project_id]: {
                        actorName: event.actor?.name?.trim() || "A teammate",
                        changeType: event.change_type,
                        entityType: event.entity_type,
                        eventId: event.event_id,
                        occurredAt: event.occurred_at,
                        projectId: event.project_id,
                        summary: summarizeRealtimeEvent(event),
                    },
                };
            }

            return nextState;
        });
    },
    clearAllRemoteChanges: () => {
        set({ remoteChangesByProjectId: {} });
    },
    clearConnectionState: () => {
        set({
            connectionStatus: "idle",
            lastError: null,
            presenceByProjectId: {},
            subscribedProjectIds: [],
        });
    },
    clearProjectRemoteChange: (projectId) => {
        set((state) => {
            if (!state.remoteChangesByProjectId[projectId]) return state;

            const nextRemoteChanges = { ...state.remoteChangesByProjectId };
            delete nextRemoteChanges[projectId];

            return {
                remoteChangesByProjectId: nextRemoteChanges,
            };
        });
    },
    reset: () => {
        set({
            connectionStatus: "idle",
            eligibleProjectIds: [],
            lastError: null,
            lastPresenceEventAtByProjectId: {},
            presenceByProjectId: {},
            recentEventIds: [],
            remoteChangesByProjectId: {},
            subscribedProjectIds: [],
        });
    },
    setConnectionStatus: (status, error = null) => {
        set({
            connectionStatus: status,
            lastError: error,
        });
    },
    setEligibleProjectIds: (projectIds) => {
        set({ eligibleProjectIds: uniqSorted(projectIds) });
    },
    setSubscribedProjectIds: (projectIds) => {
        set({ subscribedProjectIds: uniqSorted(projectIds) });
    },
}));

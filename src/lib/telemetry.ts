type TelemetryPrimitive = string | number | boolean | null;

type TelemetryInputMetadata = Record<string, TelemetryPrimitive>;
type TelemetryMetadata = Record<string, never>;

export type TelemetryEventPayload = {
    eventId?: string;
    eventName: string;
    occurredAt?: string;
    sessionId?: string;
    route?: string;
    userId?: string;
    projectId?: string;
    view?: string;
    outcome?: string;
    reason?: string;
    durationMs?: number;
    intentToCompleteMs?: number;
    metadata?: TelemetryInputMetadata;
};

type TelemetryEvent = {
    event_id: string;
    event_name: string;
    occurred_at: string;
    session_id?: string;
    route?: string;
    user_id?: string;
    project_id?: string;
    view?: string;
    outcome?: string;
    reason?: string;
    duration_ms?: number;
    intent_to_complete_ms?: number;
    metadata?: TelemetryMetadata;
};

const MAX_QUEUE_SIZE = 50;
const MAX_BATCH_SIZE = 20;
const DEFAULT_FLUSH_MS = 2000;
const DEFAULT_ENDPOINT = "/api/telemetry/events";
const RETRY_BACKOFF_MS = 6000;
const EMPTY_TELEMETRY_METADATA = Object.freeze({}) as TelemetryMetadata;

const TELEMETRY_ENDPOINT = resolveEndpoint();
const TELEMETRY_ENABLED = parseBoolean(import.meta.env.VITE_TELEMETRY_ENABLED, false);
const TELEMETRY_SAMPLE_RATE = clampNumber(parseNumber(import.meta.env.VITE_TELEMETRY_SAMPLE_RATE, 1), 0, 1);
const TELEMETRY_FLUSH_MS = Math.max(250, parseNumber(import.meta.env.VITE_TELEMETRY_FLUSH_MS, DEFAULT_FLUSH_MS));

let queue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let lifecycleBound = false;

function hasWindow() {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function parseBoolean(value: unknown, fallback: boolean) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function parseNumber(value: unknown, fallback: number) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string" || value.trim().length === 0) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function generateEventId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveEndpoint() {
    const configured = import.meta.env.VITE_TELEMETRY_ENDPOINT;
    if (typeof configured === "string" && configured.trim().length > 0) {
        return configured.trim();
    }
    return DEFAULT_ENDPOINT;
}

function getAuthToken() {
    if (!hasWindow()) return null;
    return window.localStorage.getItem("token");
}

function withDefinedValues<T extends Record<string, unknown>>(input: T): T {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    return Object.fromEntries(entries) as T;
}

function toEvent(payload: TelemetryEventPayload): TelemetryEvent {
    // The live backend contract currently requires a metadata object but rejects
    // ad-hoc keys, so we send a stable empty object until typed metadata returns.
    return withDefinedValues({
        event_id: payload.eventId ?? generateEventId(),
        event_name: payload.eventName,
        occurred_at: payload.occurredAt ?? new Date().toISOString(),
        session_id: payload.sessionId,
        route: payload.route,
        user_id: payload.userId,
        project_id: payload.projectId,
        view: payload.view,
        outcome: payload.outcome,
        reason: payload.reason,
        duration_ms: payload.durationMs,
        intent_to_complete_ms: payload.intentToCompleteMs,
        metadata: EMPTY_TELEMETRY_METADATA,
    });
}

function scheduleFlush(delay = TELEMETRY_FLUSH_MS) {
    if (!TELEMETRY_ENABLED) return;
    if (flushTimer || !hasWindow()) return;
    flushTimer = window.setTimeout(() => {
        flushTimer = null;
        void flushTelemetryQueue();
    }, delay);
}

function scheduleRetry() {
    if (retryTimer || !hasWindow() || !TELEMETRY_ENABLED) return;
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void flushTelemetryQueue();
    }, RETRY_BACKOFF_MS);
}

function cancelRetry() {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
}

function dequeueBatch() {
    return queue.splice(0, Math.min(MAX_BATCH_SIZE, queue.length));
}

function enqueueBatch(batch: TelemetryEvent[]) {
    if (batch.length === 0) return;
    queue = [...batch, ...queue].slice(-MAX_QUEUE_SIZE);
}

function resetTelemetryQueueForUser(userId?: string) {
    if (!userId) return;
    const hasQueuedEventsForAnotherUser = queue.some((event) => (
        typeof event.user_id === "string"
        && event.user_id.length > 0
        && event.user_id !== userId
    ));

    if (!hasQueuedEventsForAnotherUser) return;

    queue = [];
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    cancelRetry();
}

function bindLifecycleHooks() {
    if (!hasWindow() || lifecycleBound) return;

    const flushOnHide = () => {
        void flushTelemetryQueue({ preferBeacon: true });
    };

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flushOnHide();
        }
    });
    window.addEventListener("pagehide", flushOnHide);
    lifecycleBound = true;
}

function sendWithBeacon(batch: TelemetryEvent[]) {
    if (!hasWindow() || typeof navigator.sendBeacon !== "function") return false;
    if (getAuthToken()) return false;
    const blob = new Blob([JSON.stringify({ events: batch })], {
        type: "application/json",
    });
    return navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
}

async function sendWithFetch(batch: TelemetryEvent[]) {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ events: batch }),
        keepalive: true,
    });

    if (!response.ok) {
        let detail = "";
        try {
            const body = await response.json() as { error?: string; message?: string };
            detail = body.message ?? body.error ?? "";
        } catch {
            // non-JSON body
        }
        throw new Error(`telemetry_http_${response.status}${detail ? `: ${detail}` : ""}`);
    }
}

export function isTelemetryEnabled() {
    return TELEMETRY_ENABLED;
}

export function emitTelemetryEvent(payload: TelemetryEventPayload) {
    if (!TELEMETRY_ENABLED) return;
    if (Math.random() > TELEMETRY_SAMPLE_RATE) return;

    bindLifecycleHooks();
    resetTelemetryQueueForUser(payload.userId);
    cancelRetry();
    queue.push(toEvent(payload));
    if (queue.length > MAX_QUEUE_SIZE) {
        queue = queue.slice(-MAX_QUEUE_SIZE);
    }
    scheduleFlush();
}

export async function flushTelemetryQueue(options?: { preferBeacon?: boolean }) {
    if (!TELEMETRY_ENABLED || isFlushing || queue.length === 0) return;
    isFlushing = true;

    try {
        while (queue.length > 0) {
            const batch = dequeueBatch();
            if (batch.length === 0) break;

            try {
                if (options?.preferBeacon) {
                    const sent = sendWithBeacon(batch);
                    if (!sent) {
                        await sendWithFetch(batch);
                    }
                } else {
                    await sendWithFetch(batch);
                }
            } catch {
                enqueueBatch(batch);
                scheduleRetry();
                break;
            }
        }
    } finally {
        isFlushing = false;
    }
}

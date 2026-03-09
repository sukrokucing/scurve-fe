import { emitTelemetryEvent } from "@/lib/telemetry";

type TimeToTaskView = "list" | "gantt" | "kanban";

type TimeToTaskSession = {
    id: string;
    route: string;
    startedAt: number;
    intentAt?: number;
    userId?: string;
    projectId?: string;
    view?: TimeToTaskView;
};

type TimeToTaskOutcome = "completed" | "abandoned";

export type TimeToTaskRecord = {
    id: string;
    route: string;
    startedAt: number;
    intentAt?: number;
    completedAt: number;
    durationMs: number;
    intentToCompleteMs?: number;
    userId?: string;
    projectId?: string;
    view?: TimeToTaskView;
    outcome: TimeToTaskOutcome;
    reason?: string;
};

export type TimeToTaskSummary = {
    completedCount: number;
    abandonedCount: number;
    intentCompletedCount: number;
    intentAbandonedCount: number;
    intentSampleCount: number;
    passiveExitCount: number;
    trackedSessionCount: number;
    intentCompletionRate: number;
    passiveExitRate: number;
    // Legacy alias retained for compatibility in existing UI call sites.
    completionRate: number;
    lastMs: number | null;
    p50Ms: number | null;
    p90Ms: number | null;
    averageMs: number | null;
    fastestMs: number | null;
    slowestMs: number | null;
    lastUpdatedAt: number | null;
};

type SessionContext = {
    route?: string;
    userId?: string;
    projectId?: string;
    view?: TimeToTaskView;
};

type FinalizeContext = {
    projectId?: string;
    view?: TimeToTaskView;
    reason?: string;
};

const RECORDS_KEY = "scurve.time_to_task.records.v1";
const ACTIVE_SESSION_KEY = "scurve.time_to_task.active.v1";
const MAX_RECORDS = 300;

function hasStorage() {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function readRecords(): TimeToTaskRecord[] {
    if (!hasStorage()) return [];
    return safeParse<TimeToTaskRecord[]>(window.localStorage.getItem(RECORDS_KEY), []);
}

function writeRecords(records: TimeToTaskRecord[]) {
    if (!hasStorage()) return;
    const trimmed = records.slice(-MAX_RECORDS);
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(trimmed));
}

function readActiveSession(): TimeToTaskSession | null {
    if (!hasStorage()) return null;
    return safeParse<TimeToTaskSession | null>(window.localStorage.getItem(ACTIVE_SESSION_KEY), null);
}

function writeActiveSession(session: TimeToTaskSession | null) {
    if (!hasStorage()) return;
    if (!session) {
        window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        return;
    }
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
}

function appendRecord(record: TimeToTaskRecord) {
    const existing = readRecords();
    writeRecords([...existing, record]);
}

function generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

function finalizeSession(
    session: TimeToTaskSession,
    outcome: TimeToTaskOutcome,
    context?: FinalizeContext,
): TimeToTaskRecord {
    const completedAt = Date.now();
    const intentToCompleteMs = typeof session.intentAt === "number"
        ? Math.max(0, completedAt - session.intentAt)
        : undefined;

    return {
        id: session.id,
        route: session.route,
        startedAt: session.startedAt,
        intentAt: session.intentAt,
        completedAt,
        durationMs: Math.max(0, completedAt - session.startedAt),
        intentToCompleteMs,
        userId: session.userId,
        projectId: context?.projectId ?? session.projectId,
        view: context?.view ?? session.view,
        outcome,
        reason: context?.reason,
    };
}

function emitSessionStarted(session: TimeToTaskSession) {
    emitTelemetryEvent({
        eventId: `time-to-task-start-${session.id}`,
        eventName: "time_to_task.session_started",
        occurredAt: new Date(session.startedAt).toISOString(),
        sessionId: session.id,
        route: session.route,
        userId: session.userId,
        projectId: session.projectId,
        view: session.view,
    });
}

function emitIntentMarked(session: TimeToTaskSession, intentAt: number) {
    emitTelemetryEvent({
        eventId: `time-to-task-intent-${session.id}-${intentAt}`,
        eventName: "time_to_task.intent_marked",
        occurredAt: new Date(intentAt).toISOString(),
        sessionId: session.id,
        route: session.route,
        userId: session.userId,
        projectId: session.projectId,
        view: session.view,
    });
}

function emitSessionFinalized(record: TimeToTaskRecord) {
    const isIntentQualified = typeof record.intentAt === "number";
    const isPassiveExit = record.outcome === "abandoned" && !isIntentQualified;

    emitTelemetryEvent({
        eventId: `time-to-task-${record.outcome}-${record.id}-${record.completedAt}`,
        eventName: record.outcome === "completed"
            ? "time_to_task.completed"
            : "time_to_task.abandoned",
        occurredAt: new Date(record.completedAt).toISOString(),
        sessionId: record.id,
        route: record.route,
        userId: record.userId,
        projectId: record.projectId,
        view: record.view,
        outcome: record.outcome,
        reason: record.reason,
        durationMs: record.durationMs,
        intentToCompleteMs: record.intentToCompleteMs,
        metadata: {
            intent_qualified: isIntentQualified,
            passive_exit: isPassiveExit,
        },
    });
}

export function startTimeToTaskSession(context?: SessionContext): string {
    const current = readActiveSession();
    if (current) {
        const restartedRecord = finalizeSession(current, "abandoned", { reason: "restarted-session" });
        appendRecord(restartedRecord);
        emitSessionFinalized(restartedRecord);
    }

    const session: TimeToTaskSession = {
        id: generateId(),
        route: context?.route ?? "/tasks",
        startedAt: Date.now(),
        userId: context?.userId,
        projectId: context?.projectId,
        view: context?.view,
    };

    writeActiveSession(session);
    emitSessionStarted(session);
    return session.id;
}

export function markTimeToTaskIntent(sessionId: string, context?: SessionContext): boolean {
    const active = readActiveSession();
    if (!active || active.id !== sessionId) return false;
    const intentAt = active.intentAt ?? Date.now();
    const next: TimeToTaskSession = {
        ...active,
        intentAt,
        projectId: context?.projectId ?? active.projectId,
        view: context?.view ?? active.view,
    };
    writeActiveSession(next);
    if (active.intentAt === undefined) {
        emitIntentMarked(next, intentAt);
    }
    return true;
}

export function completeTimeToTaskSession(sessionId: string, context?: FinalizeContext): TimeToTaskRecord | null {
    const active = readActiveSession();
    if (!active || active.id !== sessionId) return null;

    const completedRecord = finalizeSession(active, "completed", context);
    appendRecord(completedRecord);
    writeActiveSession(null);
    emitSessionFinalized(completedRecord);
    return completedRecord;
}

export function abandonTimeToTaskSession(sessionId: string, context?: FinalizeContext): TimeToTaskRecord | null {
    const active = readActiveSession();
    if (!active || active.id !== sessionId) return null;

    const abandonedRecord = finalizeSession(active, "abandoned", context ?? { reason: "abandoned" });
    appendRecord(abandonedRecord);
    writeActiveSession(null);
    emitSessionFinalized(abandonedRecord);
    return abandonedRecord;
}

export function clearTimeToTaskRecords(userId?: string) {
    if (!hasStorage()) return;

    if (!userId) {
        window.localStorage.removeItem(RECORDS_KEY);
        window.localStorage.removeItem(ACTIVE_SESSION_KEY);
        return;
    }

    const filtered = readRecords().filter((record) => record.userId !== userId);
    writeRecords(filtered);

    const active = readActiveSession();
    if (active?.userId === userId) {
        writeActiveSession(null);
    }
}

export function getTimeToTaskRecords(userId?: string): TimeToTaskRecord[] {
    const records = readRecords();
    const scoped = userId
        ? records.filter((record) => record.userId === userId)
        : records;

    return [...scoped].sort((a, b) => b.completedAt - a.completedAt);
}

export function getTimeToTaskSummary(userId?: string): TimeToTaskSummary {
    const scoped = getTimeToTaskRecords(userId);
    const hasIntent = (record: TimeToTaskRecord) => typeof record.intentAt === "number";

    const completed = scoped.filter((record) => record.outcome === "completed");
    const abandoned = scoped.filter((record) => record.outcome === "abandoned");
    const intentCompleted = completed.filter(hasIntent);
    const intentAbandoned = abandoned.filter(hasIntent);
    const passiveExits = abandoned.filter((record) => !hasIntent(record));

    const intentCompletedCount = intentCompleted.length;
    const intentAbandonedCount = intentAbandoned.length;
    const intentSampleCount = intentCompletedCount + intentAbandonedCount;
    const trackedSessionCount = scoped.length;
    const durations = completed.map((record) => record.durationMs);

    const completedCount = completed.length;
    const abandonedCount = abandoned.length;
    const intentCompletionRate = intentSampleCount === 0 ? 0 : intentCompletedCount / intentSampleCount;
    const passiveExitRate = trackedSessionCount === 0 ? 0 : passiveExits.length / trackedSessionCount;

    const averageMs = durations.length === 0
        ? null
        : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);

    return {
        completedCount,
        abandonedCount,
        intentCompletedCount,
        intentAbandonedCount,
        intentSampleCount,
        passiveExitCount: passiveExits.length,
        trackedSessionCount,
        intentCompletionRate,
        passiveExitRate,
        completionRate: intentCompletionRate,
        lastMs: completed[0]?.durationMs ?? null,
        p50Ms: percentile(durations, 50),
        p90Ms: percentile(durations, 90),
        averageMs,
        fastestMs: durations.length === 0 ? null : Math.min(...durations),
        slowestMs: durations.length === 0 ? null : Math.max(...durations),
        lastUpdatedAt: scoped[0]?.completedAt ?? null,
    };
}

export function formatDurationMs(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return "—";
    if (value < 1000) return `${Math.round(value)}ms`;

    const totalSeconds = Math.round(value / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

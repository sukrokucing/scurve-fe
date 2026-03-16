import type { Task, TaskStatus } from "@/types/domain";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type TaskHealthState =
    | "ahead"
    | "on_track"
    | "at_risk"
    | "critical"
    | "needs_plan";

export type TaskScurveSnapshot = {
    expected: number | null;
    actual: number;
    variance: number | null;
    health: TaskHealthState;
};

function clampPercent(value: number) {
    return Math.min(100, Math.max(0, value));
}

function parseDate(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function resolvePlannedEnd(task: Pick<Task, "startDate" | "endDate" | "dueDate" | "durationDays">) {
    const dueDate = parseDate(task.dueDate);
    if (dueDate) return dueDate;

    const endDate = parseDate(task.endDate);
    if (endDate) return endDate;

    const startDate = parseDate(task.startDate);
    if (!startDate) return null;

    if (typeof task.durationDays === "number" && Number.isFinite(task.durationDays) && task.durationDays > 0) {
        return new Date(startDate.getTime() + (task.durationDays * DAY_IN_MS));
    }

    return null;
}

export function getTaskStatusLabel(status: TaskStatus) {
    switch (status) {
        case "todo":
            return "Not Started";
        case "in_progress":
            return "In Progress";
        case "blocked":
            return "Blocked";
        case "done":
            return "Completed";
        default:
            return status;
    }
}

export function getTaskExpectedProgress(task: Pick<Task, "startDate" | "endDate" | "dueDate" | "durationDays">, now = new Date()) {
    const startDate = parseDate(task.startDate);
    const plannedEnd = resolvePlannedEnd(task);

    if (!startDate || !plannedEnd) return null;

    const totalDuration = plannedEnd.getTime() - startDate.getTime();
    if (totalDuration <= 0) return null;

    if (now.getTime() <= startDate.getTime()) return 0;
    if (now.getTime() >= plannedEnd.getTime()) return 100;

    return clampPercent(((now.getTime() - startDate.getTime()) / totalDuration) * 100);
}

export function getTaskActualProgress(task: Pick<Task, "progress" | "status">) {
    if (typeof task.progress === "number" && Number.isFinite(task.progress)) {
        return clampPercent(task.progress);
    }

    if (task.status === "done") return 100;
    return 0;
}

export function getTaskVariance(expected: number | null, actual: number) {
    if (expected === null) return null;
    return actual - expected;
}

export function getTaskHealthState(variance: number | null, expected: number | null): TaskHealthState {
    if (expected === null || variance === null) return "needs_plan";
    if (variance >= 10) return "ahead";
    if (variance <= -25) return "critical";
    if (variance <= -10) return "at_risk";
    return "on_track";
}

export function getTaskHealthLabel(health: TaskHealthState) {
    switch (health) {
        case "ahead":
            return "Ahead";
        case "on_track":
            return "On Track";
        case "at_risk":
            return "At Risk";
        case "critical":
            return "Critical";
        case "needs_plan":
        default:
            return "Needs Plan";
    }
}

export function getTaskHealthVariant(health: TaskHealthState): "success" | "info" | "warning" | "error" | "outline" {
    switch (health) {
        case "ahead":
            return "success";
        case "on_track":
            return "info";
        case "at_risk":
            return "warning";
        case "critical":
            return "error";
        case "needs_plan":
        default:
            return "outline";
    }
}

export function formatTaskPercent(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "—";
    return `${Math.round(value)}%`;
}

export function formatTaskVariance(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "—";
    const rounded = Math.round(value);
    return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function getTaskScurveSnapshot(task: Pick<Task, "startDate" | "endDate" | "dueDate" | "durationDays" | "progress" | "status">, now = new Date()): TaskScurveSnapshot {
    const expected = getTaskExpectedProgress(task, now);
    const actual = getTaskActualProgress(task);
    const variance = getTaskVariance(expected, actual);
    const health = getTaskHealthState(variance, expected);

    return {
        expected,
        actual,
        variance,
        health,
    };
}

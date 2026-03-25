import { formatDistanceToNowStrict } from "date-fns";

type PresenceLike = {
    last_seen_at?: string | null;
    route?: string | null;
    status?: string | null;
};

function parseRelativeRoute(rawRoute?: string | null) {
    if (!rawRoute?.trim()) return null;

    try {
        return new URL(rawRoute, "https://scurve.local");
    } catch {
        return null;
    }
}

function humanizeSegment(segment: string) {
    return segment
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getRealtimeRouteLabel(rawRoute?: string | null) {
    const parsed = parseRelativeRoute(rawRoute);
    if (!parsed) return null;

    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/") return "Dashboard";
    if (pathname === "/tasks") {
        const view = parsed.searchParams.get("view");
        if (view === "gantt") return "Gantt";
        if (view === "kanban") return "Kanban board";
        return "Tasks";
    }
    if (pathname === "/projects") return "Projects";
    if (/^\/projects\/[^/]+\/dashboard$/.test(pathname)) return "Project dashboard";
    if (/^\/projects\/[^/]+\/settings$/.test(pathname)) return "Project settings";
    if (pathname === "/settings/users") return "Settings / Users";
    if (pathname === "/settings/roles") return "Settings / Roles";
    if (pathname === "/settings/policy") return "Settings / Policy";
    if (pathname === "/settings/flow") return "Settings / Flow";
    if (pathname === "/login") return "Login";
    if (pathname === "/register") return "Register";

    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return "Dashboard";
    return segments.map(humanizeSegment).join(" / ");
}

export function getPresenceStatusLabel(presence?: PresenceLike | null) {
    if (!presence) return "Offline";

    const routeLabel = getRealtimeRouteLabel(presence.route);
    if (presence.status === "online") {
        return routeLabel ? `Online in ${routeLabel}` : "Online now";
    }

    if (presence.last_seen_at) {
        const parsedDate = new Date(presence.last_seen_at);
        if (!Number.isNaN(parsedDate.getTime())) {
            return `Active ${formatDistanceToNowStrict(parsedDate, { addSuffix: true })}`;
        }
    }

    return "Offline";
}

export function isPresenceRecentlyActive(presence?: PresenceLike | null, thresholdMinutes = 15) {
    if (!presence?.last_seen_at || presence.status === "online") return false;
    const parsedDate = new Date(presence.last_seen_at);
    if (Number.isNaN(parsedDate.getTime())) return false;
    return Date.now() - parsedDate.getTime() <= thresholdMinutes * 60_000;
}

export function summarizePresenceRoutes(users: Array<PresenceLike | null | undefined>) {
    const routeCounts = new Map<string, number>();
    users.forEach((user) => {
        if (user?.status !== "online") return;
        const routeLabel = getRealtimeRouteLabel(user.route);
        if (!routeLabel) return;
        routeCounts.set(routeLabel, (routeCounts.get(routeLabel) ?? 0) + 1);
    });

    return Array.from(routeCounts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([label, count]) => ({ count, label }));
}

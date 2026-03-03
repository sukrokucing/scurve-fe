export type UiAuditTheme = "light" | "dark" | "glass";
export type UiAuditViewport = "mobile" | "tablet" | "desktop";
export type UiAuditState = "default" | "hover-focus" | "loading" | "empty" | "error";

export type UiAuditRoute = {
    path: string;
    label: string;
    requiresAuth: boolean;
};

export type UiAuditViewportSize = {
    width: number;
    height: number;
};

export const UI_AUDIT_CONFIG = {
    routes: [
        { path: "/", label: "dashboard", requiresAuth: true },
        { path: "/projects", label: "projects", requiresAuth: true },
        { path: "/tasks", label: "tasks", requiresAuth: true },
        { path: "/settings/users", label: "settings-users", requiresAuth: true },
        { path: "/settings/roles", label: "settings-roles", requiresAuth: true },
        { path: "/settings/policy", label: "settings-policy", requiresAuth: true },
        { path: "/settings/flow", label: "settings-flow", requiresAuth: true },
        { path: "/login", label: "login", requiresAuth: false },
        { path: "/register", label: "register", requiresAuth: false },
    ] as UiAuditRoute[],
    themes: ["light", "dark", "glass"] as UiAuditTheme[],
    viewports: {
        mobile: { width: 390, height: 844 },
        tablet: { width: 768, height: 1024 },
        desktop: { width: 1440, height: 900 },
    } as Record<UiAuditViewport, UiAuditViewportSize>,
    states: ["default", "hover-focus", "loading", "empty", "error"] as UiAuditState[],
    thresholds: {
        contrast: {
            normalText: 4.5,
            largeText: 3,
        },
        targetSize: {
            mobile: 44,
            desktop: 36,
        },
        maxLineLengthCh: 80,
    },
};

export function getViewportTargetSize(viewport: UiAuditViewport): number {
    return viewport === "desktop"
        ? UI_AUDIT_CONFIG.thresholds.targetSize.desktop
        : UI_AUDIT_CONFIG.thresholds.targetSize.mobile;
}

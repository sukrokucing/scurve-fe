export const auditConfig = {
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
    ],
    themes: ["light", "dark", "glass"],
    viewports: {
        mobile: { width: 390, height: 844 },
        tablet: { width: 768, height: 1024 },
        desktop: { width: 1440, height: 900 },
    },
    states: ["default", "hover-focus", "loading", "empty", "error"],
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

export function getViewportTargetSize(viewportName) {
    return viewportName === "mobile"
        ? auditConfig.thresholds.targetSize.mobile
        : auditConfig.thresholds.targetSize.desktop;
}

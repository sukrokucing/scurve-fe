import type { LucideIcon } from "lucide-react";
import {
    FolderKanban,
    GitMerge,
    LayoutDashboard,
    ListTodo,
    Lock,
    Settings,
    Shield,
    Users,
} from "lucide-react";

export type MenuSurface = "sidebar" | "bottom-nav" | "settings-nav" | "search";
export type MenuSection = "main" | "settings";

export type MenuEntry = {
    id: string;
    label: string;
    to: string;
    section: MenuSection;
    keywords: string[];
    priority: number;
    surfaces: MenuSurface[];
    icon: LucideIcon;
    hidden?: boolean;
    disabled?: boolean;
};

const MENU_ENTRIES: MenuEntry[] = [
    {
        id: "dashboard",
        label: "Dashboard",
        to: "/",
        section: "main",
        keywords: ["home", "overview", "summary"],
        priority: 10,
        surfaces: ["sidebar", "bottom-nav", "search"],
        icon: LayoutDashboard,
    },
    {
        id: "projects",
        label: "Projects",
        to: "/projects",
        section: "main",
        keywords: ["portfolio", "delivery", "roadmap"],
        priority: 20,
        surfaces: ["sidebar", "bottom-nav", "search"],
        icon: FolderKanban,
    },
    {
        id: "tasks",
        label: "Tasks",
        to: "/tasks",
        section: "main",
        keywords: ["todo", "work items", "execution"],
        priority: 30,
        surfaces: ["sidebar", "bottom-nav", "search"],
        icon: ListTodo,
    },
    {
        id: "settings",
        label: "Settings",
        to: "/settings",
        section: "settings",
        keywords: ["admin", "configuration", "workspace"],
        priority: 90,
        surfaces: ["sidebar", "bottom-nav", "search"],
        icon: Settings,
    },
    {
        id: "settings-users",
        label: "Users",
        to: "/settings/users",
        section: "settings",
        keywords: ["members", "accounts", "people"],
        priority: 40,
        surfaces: ["settings-nav", "search"],
        icon: Users,
    },
    {
        id: "settings-roles",
        label: "Roles",
        to: "/settings/roles",
        section: "settings",
        keywords: ["rbac", "permissions", "access control"],
        priority: 41,
        surfaces: ["settings-nav", "search"],
        icon: Shield,
    },
    {
        id: "settings-policy",
        label: "Policy",
        to: "/settings/policy",
        section: "settings",
        keywords: ["rules", "governance", "authorization"],
        priority: 42,
        surfaces: ["settings-nav", "search"],
        icon: Lock,
    },
    {
        id: "settings-flow",
        label: "Access Flow",
        to: "/settings/flow",
        section: "settings",
        keywords: ["inheritance", "hierarchy", "relationship flow"],
        priority: 43,
        surfaces: ["settings-nav", "search"],
        icon: GitMerge,
    },
];

const sortByPriorityAndLabel = (a: MenuEntry, b: MenuEntry) =>
    a.priority - b.priority || a.label.localeCompare(b.label);

const bySurface = (surface: MenuSurface) =>
    MENU_ENTRIES.filter((entry) => entry.surfaces.includes(surface)).sort(sortByPriorityAndLabel);

export const SIDEBAR_MENU_ENTRIES = bySurface("sidebar");
export const BOTTOM_NAV_MENU_ENTRIES = bySurface("bottom-nav");
export const SETTINGS_NAV_MENU_ENTRIES = bySurface("settings-nav");
export const SEARCH_MENU_ENTRIES = MENU_ENTRIES
    .filter((entry) => entry.surfaces.includes("search") && !entry.hidden && !entry.disabled)
    .sort(sortByPriorityAndLabel);


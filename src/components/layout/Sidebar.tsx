import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard,
    FolderKanban,
    ListTodo,
    LogOut,
    Settings
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/useAuth";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/tasks", label: "Tasks", icon: ListTodo },
];

const ADMIN_NAV_ITEMS = [
    { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(true); // Default to collapsed Rail
    const { logout, user } = useAuth();
    const { pathname } = useLocation();

    // Settings is active if we are on any /settings/* route
    const isSettingsActive = pathname.startsWith("/settings");

    const sidebarWidth = isCollapsed ? "w-[72px]" : "w-[260px]";

    return (
        <motion.aside
            className={cn(
                "relative flex flex-col border-r bg-card text-card-foreground h-screen transition-all duration-300 ease-in-out z-20 hidden md:flex shrink-0 overflow-hidden",
                sidebarWidth
            )}
            initial={false}
            animate={{ width: isCollapsed ? 72 : 260 }}
            onMouseEnter={() => setIsCollapsed(false)}
            onMouseLeave={() => setIsCollapsed(true)}
        >
            {/* Logo Section */}
            <div className="flex h-16 items-center px-6 border-b shrink-0">
                <AnimatePresence mode="wait">
                    {!isCollapsed ? (
                        <motion.div
                            key="full-logo"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="font-bold text-xl tracking-tight text-primary truncate"
                        >
                            {import.meta.env.VITE_APP_NAME ?? "S-Curve"}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="mini-logo"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full flex justify-center font-bold text-xl text-primary"
                        >
                            S
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 space-y-2 p-3 overflow-y-auto overflow-x-hidden pt-6">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group",
                                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                isCollapsed && "justify-center px-0"
                            )
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon className={cn("h-5 w-5 shrink-0 transition-transform group-hover:scale-110", isCollapsed ? "mr-0" : "")} />
                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="truncate"
                            >
                                {item.label}
                            </motion.span>
                        )}
                    </NavLink>
                ))}

                <Separator className="my-4" />

                {ADMIN_NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={() =>
                            cn(
                                "flex items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group",
                                isSettingsActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                isCollapsed && "justify-center px-0"
                            )
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon className={cn("h-5 w-5 shrink-0 transition-transform group-hover:scale-110", isCollapsed ? "mr-0" : "")} />
                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="truncate"
                            >
                                {item.label}
                            </motion.span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Footer / User Section */}
            <div className="p-3 border-t space-y-3 shrink-0">
                <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between px-2")}>
                    {!isCollapsed && <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Theme</span>}
                    <ThemeToggle />
                </div>

                <Separator />

                <div className={cn("flex items-center gap-3", isCollapsed ? "justify-center" : "px-2")}>
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                        {user?.name?.[0]?.toUpperCase() ?? "U"}
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold truncate leading-none">{user?.name ?? "User"}</span>
                            <span className="text-[10px] text-muted-foreground truncate mt-1">{user?.email}</span>
                        </div>
                    )}
                </div>

                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-10 transition-colors",
                        isCollapsed ? "justify-center px-0" : "px-3"
                    )}
                    onClick={logout}
                    title="Sign out"
                >
                    <LogOut className="h-4 w-4 shrink-0" />
                    {!isCollapsed && <span className="ml-4">Sign out</span>}
                </Button>
            </div>
        </motion.aside>
    );
}

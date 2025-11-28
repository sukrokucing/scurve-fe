
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard,
    FolderKanban,
    ListTodo,
    ChevronLeft,
    ChevronRight,
    LogOut
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

export function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { logout, user } = useAuth();

    const sidebarWidth = isCollapsed ? "w-[80px]" : "w-[280px]";

    return (
        <motion.aside
            className={cn(
                "relative flex flex-col border-r bg-card text-card-foreground h-screen transition-all duration-300 ease-in-out z-20 hidden md:flex",
                sidebarWidth
            )}
            initial={false}
            animate={{ width: isCollapsed ? 80 : 280 }}
        >
            {/* Logo Section */}
            <div className="flex h-16 items-center justify-between px-6 border-b">
                <AnimatePresence mode="wait">
                    {!isCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="font-bold text-xl tracking-tight text-primary truncate"
                        >
                            {import.meta.env.VITE_APP_NAME ?? "S-Curve"}
                        </motion.div>
                    )}
                </AnimatePresence>
                {isCollapsed && (
                    <div className="w-full flex justify-center font-bold text-xl text-primary">S</div>
                )}
            </div>

            {/* Toggle Button */}
            <Button
                variant="ghost"
                size="icon"
                className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-md z-30 hover:bg-accent"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            </Button>

            {/* Navigation Links */}
            <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                                isActive ? "bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground",
                                isCollapsed && "justify-center px-2"
                            )
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon className={cn("h-5 w-5 flex-shrink-0", isCollapsed ? "mr-0" : "")} />
                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.1 }}
                            >
                                {item.label}
                            </motion.span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Footer / User Section */}
            <div className="p-4 border-t space-y-4">
                <div className={cn("flex items-center gap-2", isCollapsed ? "justify-center flex-col" : "justify-between")}>
                    <ThemeToggle />
                    {!isCollapsed && <span className="text-xs text-muted-foreground">Theme</span>}
                </div>

                <Separator />

                <div className={cn("flex items-center gap-3", isCollapsed ? "justify-center" : "")}>
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                        {user?.name?.[0]?.toUpperCase() ?? "U"}
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-medium truncate">{user?.name ?? "User"}</span>
                            <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                        </div>
                    )}
                </div>

                <Button
                    variant="ghost"
                    className={cn("w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10", isCollapsed ? "justify-center px-0" : "")}
                    onClick={logout}
                    title="Sign out"
                >
                    <LogOut className="h-4 w-4 mr-2" />
                    {!isCollapsed && "Sign out"}
                </Button>
            </div>
        </motion.aside>
    );
}

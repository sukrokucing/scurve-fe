import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut, Pin, PinOff, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/useAuth";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { Separator } from "@/components/ui/separator";
import { SIDEBAR_MENU_ENTRIES } from "@/navigation/menuCatalog";
import { openGlobalMenuSearch } from "@/navigation/menuSearchEvents";
import { useLocalStorage } from "@/hooks/vendor/reactUse";

const MAIN_NAV_ITEMS = SIDEBAR_MENU_ENTRIES.filter((entry) => entry.section === "main");
const SETTINGS_NAV_ITEMS = SIDEBAR_MENU_ENTRIES.filter((entry) => entry.section === "settings");
const SIDEBAR_PIN_STORAGE_KEY = "sidebar-pinned";

export function Sidebar() {
    const [storedPinned, setStoredPinned] = useLocalStorage<boolean>(SIDEBAR_PIN_STORAGE_KEY, false);
    const isPinned = storedPinned ?? false;
    const [isCollapsed, setIsCollapsed] = useState(!isPinned);
    const { logout, user } = useAuth();
    const { pathname } = useLocation();

    // Settings is active if we are on any /settings/* route
    const isSettingsActive = pathname.startsWith("/settings");
    const searchShortcutLabel = useMemo(
        () => (typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘K" : "Ctrl+K"),
        []
    );

    const sidebarWidth = isCollapsed ? "w-[72px]" : "w-[260px]";
    const pinLabel = isPinned ? "Unpin sidebar" : "Pin sidebar";

    useEffect(() => {
        setIsCollapsed(!isPinned);
    }, [isPinned]);

    const togglePinned = () => {
        const nextPinned = !isPinned;
        setStoredPinned(nextPinned);
        setIsCollapsed(!nextPinned);
    };

    return (
        <motion.aside
            className={cn(
                "relative flex flex-col border-r bg-card text-card-foreground h-screen transition-all duration-300 ease-in-out z-20 hidden md:flex shrink-0 overflow-hidden",
                sidebarWidth
            )}
            initial={false}
            animate={{ width: isCollapsed ? 72 : 260 }}
            onMouseEnter={() => {
                if (!isPinned) {
                    setIsCollapsed(false);
                }
            }}
            onMouseLeave={() => {
                if (!isPinned) {
                    setIsCollapsed(true);
                }
            }}
        >
            {/* Logo Section */}
            <div
                className={cn(
                    "flex h-16 items-center border-b shrink-0",
                    isCollapsed ? "justify-center px-2" : "justify-between px-4"
                )}
            >
                {!isCollapsed ? (
                    <div
                        className="font-bold text-xl tracking-tight text-foreground truncate"
                        title={import.meta.env.VITE_APP_NAME ?? "S-Curve"}
                    >
                        {import.meta.env.VITE_APP_NAME ?? "S-Curve"}
                    </div>
                ) : (
                    <div className="w-full flex justify-center font-bold text-xl text-foreground">
                        S
                    </div>
                )}

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground transition-opacity duration-150",
                        !isPinned && isCollapsed ? "pointer-events-none opacity-0" : "opacity-100",
                        isCollapsed ? "absolute right-2 top-4" : ""
                    )}
                    onClick={togglePinned}
                    aria-label={pinLabel}
                    aria-pressed={isPinned}
                    data-testid="sidebar-pin-toggle"
                    title={pinLabel}
                >
                    {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 space-y-2 p-3 overflow-y-auto overflow-x-hidden pt-6">
                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                        "mb-3 h-11 w-full text-muted-foreground hover:text-foreground",
                        isCollapsed ? "justify-center px-0" : "justify-between"
                    )}
                    onClick={openGlobalMenuSearch}
                    data-testid="global-menu-search-trigger"
                    aria-label="Open global menu search"
                    title={isCollapsed ? "Search menu" : undefined}
                >
                    <span className={cn("flex items-center gap-2", isCollapsed ? "justify-center" : "")}>
                        <Search className="h-4 w-4 shrink-0" />
                        {!isCollapsed ? <span className="text-sm">Search menu</span> : null}
                    </span>
                    {!isCollapsed ? (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {searchShortcutLabel}
                        </span>
                    ) : null}
                </Button>

                {MAIN_NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex min-h-11 items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-foreground/80 dark:text-foreground/90 hover:bg-accent hover:text-foreground",
                                isCollapsed && "justify-center px-0"
                            )
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon className={cn("h-5 w-5 shrink-0 transition-transform group-hover:scale-110", isCollapsed ? "mr-0" : "")} />
                        {!isCollapsed && (
                            <span className="truncate" title={item.label}>
                                {item.label}
                            </span>
                        )}
                    </NavLink>
                ))}

                <Separator className="my-4" />

                {SETTINGS_NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={() =>
                            cn(
                                "flex min-h-11 items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group",
                                isSettingsActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-foreground/80 dark:text-foreground/90 hover:bg-accent hover:text-foreground",
                                isCollapsed && "justify-center px-0"
                            )
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <item.icon className={cn("h-5 w-5 shrink-0 transition-transform group-hover:scale-110", isCollapsed ? "mr-0" : "")} />
                        {!isCollapsed && (
                            <span className="truncate" title={item.label}>
                                {item.label}
                            </span>
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
                            <span className="text-sm font-semibold truncate leading-none" title={user?.name ?? "User"}>{user?.name ?? "User"}</span>
                            <span className="text-[10px] text-muted-foreground truncate mt-1" title={user?.email ?? ""}>{user?.email}</span>
                        </div>
                    )}
                </div>

                <Button
                    variant="ghost"
                    className={cn(
                        "h-11 w-full justify-start text-foreground/80 dark:text-foreground/90 hover:bg-destructive hover:text-destructive-foreground active:bg-destructive/90 active:text-destructive-foreground transition-colors",
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

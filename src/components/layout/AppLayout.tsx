import { Menu } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { OfflineBanner } from "@/components/OfflineBanner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/auth/useAuth";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { Sidebar } from "./Sidebar";

const NAV_ITEMS = [
    { to: "/", label: "Dashboard" },
    { to: "/projects", label: "Projects" },
    { to: "/tasks", label: "Tasks" },
];

export function AppLayout() {
    const [open, setOpen] = useState(false);
    const { logout, user } = useAuth();

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <OfflineBanner />
            {/* Skip link for keyboard users */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-md focus:bg-primary-dark focus:px-4 focus:py-2 focus:text-primary-foreground focus:ring-2 focus:ring-ring"
            >
                Skip to main content
            </a>

            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Mobile Header */}
                <header className="md:hidden border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                            <Sheet open={open} onOpenChange={setOpen}>
                                <SheetTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="md:hidden"
                                        aria-expanded={open}
                                        aria-controls="mobile-menu"
                                        aria-label="Toggle navigation"
                                    >
                                        <Menu className="h-5 w-5" />
                                        <span className="sr-only">Toggle navigation</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-72 p-0" aria-label="Primary navigation">
                                    <div className="flex flex-col h-full">
                                        <div className="p-6 border-b">
                                            <span className="font-bold text-xl tracking-tight text-primary">
                                                {import.meta.env.VITE_APP_NAME ?? "S-Curve"}
                                            </span>
                                        </div>
                                        <nav id="mobile-menu" role="navigation" aria-label="Primary" className="flex-1 flex flex-col gap-2 p-4">
                                            {NAV_ITEMS.map((item) => (
                                                <NavLink
                                                    key={item.to}
                                                    to={item.to}
                                                    className={({ isActive }) =>
                                                        cn(
                                                            "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                                            isActive
                                                                ? "bg-primary/10 text-primary"
                                                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                                        )
                                                    }
                                                    onClick={() => setOpen(false)}
                                                    end={item.to === "/"}
                                                >
                                                    {item.label}
                                                </NavLink>
                                            ))}
                                        </nav>
                                        <div className="p-4 border-t space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium">{user?.name}</span>
                                                <ThemeToggle />
                                            </div>
                                            <Button variant="outline" className="w-full" onClick={logout}>
                                                Sign out
                                            </Button>
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                            <span className="font-semibold tracking-tight md:hidden">
                                {import.meta.env.VITE_APP_NAME ?? "S-Curve"}
                            </span>
                        </div>
                    </div>
                </header>

                <main id="main-content" className="flex-1 overflow-y-auto bg-background/50">
                    <div className="mx-auto w-full max-w-full px-4 py-6 md:px-8 md:py-8">
                        {/* Provide a top-level heading for accessibility/screen readers */}
                        <h1 className="sr-only">{import.meta.env.VITE_APP_NAME ?? "S-Curve"}</h1>
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}

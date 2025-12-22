import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, ListTodo, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/tasks", label: "Tasks", icon: ListTodo },
    { to: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border px-6 pb-safe pt-2">
            <div className="flex items-center justify-between pointer-events-auto">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex flex-col items-center gap-1 min-w-[64px] transition-colors",
                                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                            )
                        }
                    >
                        <item.icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}

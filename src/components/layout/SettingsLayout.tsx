import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SETTINGS_NAV_MENU_ENTRIES } from "@/navigation/menuCatalog";

export function SettingsLayout() {
    return (
        <div className="flex flex-col h-full bg-background space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground text-sm">Manage your workspace configuration and security policies.</p>
                </div>
            </header>

            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <aside className="lg:w-1/5 overflow-x-auto lg:overflow-visible scrollbar-hide">
                    <nav className="flex lg:flex-col gap-2 p-1 lg:p-0 whitespace-nowrap lg:whitespace-normal">
                        {SETTINGS_NAV_MENU_ENTRIES.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all group",
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )
                                }
                            >
                                <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </aside>
                <main className="flex-1 min-w-0">
                    <div className="mx-auto max-w-full">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}

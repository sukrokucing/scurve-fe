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
                    <nav className="flex lg:flex-col gap-2 p-2 whitespace-nowrap lg:whitespace-normal">
                        {SETTINGS_NAV_MENU_ENTRIES.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-start gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all group",
                                        "min-h-11 lg:min-h-[58px]",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2",
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-foreground/80 hover:bg-muted hover:text-foreground"
                                    )
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110 mt-0.5" />
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span>{item.label}</span>
                                            {item.description ? (
                                                <span
                                                    className={cn(
                                                        "hidden text-xs font-normal lg:block",
                                                        isActive ? "text-primary-foreground" : "text-muted-foreground",
                                                    )}
                                                >
                                                    {item.description}
                                                </span>
                                            ) : null}
                                        </span>
                                    </>
                                )}
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

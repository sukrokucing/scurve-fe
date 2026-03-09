import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_MENU_ENTRIES } from "@/navigation/menuCatalog";
import { MenuSearchPanel } from "@/components/navigation/MenuSearchPanel";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";

export function BottomNav() {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const { pathname } = useLocation();

    useEffect(() => {
        setIsSearchOpen(false);
    }, [pathname]);

    return (
        <>
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border px-2 pb-safe pt-2">
                <div className="grid grid-cols-5 items-stretch pointer-events-auto">
                    {BOTTOM_NAV_MENU_ENTRIES.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                cn(
                                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2",
                                    isActive
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                )
                            }
                        >
                            <item.icon className="h-5 w-5" />
                            <span className="text-xs font-medium">{item.label}</span>
                        </NavLink>
                    ))}

                    <button
                        type="button"
                        aria-label="Open menu search"
                        data-testid="bottom-nav-search-trigger"
                        className={cn(
                            "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-strong focus-visible:ring-offset-2",
                            isSearchOpen
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                        onClick={() => setIsSearchOpen(true)}
                    >
                        <Search className="h-5 w-5" />
                        <span className="text-xs font-medium">Search</span>
                    </button>
                </div>
            </nav>

            <Sheet open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <SheetContent
                    side="bottom"
                    className="inset-0 h-screen w-screen max-w-none rounded-none border-0 p-0"
                    data-testid="mobile-menu-search-sheet"
                >
                    <div className="flex h-full flex-col pt-8">
                        <SheetHeader className="px-4 pb-2 text-left">
                            <SheetTitle>Search menu</SheetTitle>
                            <SheetDescription>
                                Find a menu and press Enter to open the first result.
                            </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 overflow-y-auto px-4 pb-4">
                            <MenuSearchPanel
                                autoFocus
                                testIdPrefix="mobile"
                                onNavigate={() => setIsSearchOpen(false)}
                            />
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

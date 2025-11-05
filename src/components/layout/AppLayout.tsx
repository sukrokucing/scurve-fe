import { Menu } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/auth/useAuth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/projects", label: "Projects" },
  { to: "/tasks", label: "Tasks" },
];

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { logout, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle navigation</span>
                  </Button>
                </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <nav className="flex flex-col gap-2 p-4">
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
                      onMouseEnter={() => {
                        // Prefetch the page bundle when user hovers the nav item to improve perceived load
                        if (item.to === "/projects") import("@/pages/projects/ProjectsPage");
                        if (item.to === "/tasks") import("@/pages/tasks/TasksPage");
                        if (item.to === "/") import("@/pages/dashboard/DashboardPage");
                      }}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <Link to="/" className="font-semibold tracking-tight">
              {import.meta.env.VITE_APP_NAME ?? "S-Curve"}
            </Link>
          </div>
          <nav className="hidden items-center gap-2 md:flex">
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
                end={item.to === "/"}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {user ? <span className="hidden text-sm text-muted-foreground md:inline">{user.email}</span> : null}
            <Button variant="outline" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { Outlet } from "react-router-dom";
import { OfflineBanner } from "@/components/OfflineBanner";
import { GlobalMenuSearchDialog } from "@/components/navigation/GlobalMenuSearchDialog";
import { RealtimeBootstrap } from "@/components/realtime/RealtimeBootstrap";
import { NotificationIndicator } from "./NotificationIndicator";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <OfflineBanner />
            <RealtimeBootstrap />
            {/* Skip link for keyboard users */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:min-h-11 focus:rounded-md focus:bg-primary-dark focus:px-4 focus:py-3 focus:text-primary-foreground focus:ring-2 focus:ring-ring-strong focus:ring-offset-2"
            >
                Skip to main content
            </a>

            {/* Desktop Sidebar (Renders as Rail on medium/small screens) */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <main id="main-content" className="flex-1 overflow-y-auto bg-background/50 pb-20 md:pb-0">
                    <div className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8">
                        <div className="mx-auto flex w-full max-w-7xl justify-end">
                            <NotificationIndicator />
                        </div>
                    </div>
                    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
                        {/* Provide a top-level heading for accessibility/screen readers */}
                        <h1 className="sr-only">{import.meta.env.VITE_APP_NAME ?? "S-Curve"}</h1>
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Mobile Bottom Navigation */}
            <BottomNav />
            <GlobalMenuSearchDialog />
        </div>
    );
}

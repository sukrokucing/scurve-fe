import { Outlet } from "react-router-dom";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
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

            {/* Desktop Sidebar (Renders as Rail on medium/small screens) */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <main id="main-content" className="flex-1 overflow-y-auto bg-background/50 pb-20 md:pb-0">
                    <div className="mx-auto w-full max-w-full px-4 py-6 md:px-8 md:py-8">
                        {/* Provide a top-level heading for accessibility/screen readers */}
                        <h1 className="sr-only">{import.meta.env.VITE_APP_NAME ?? "S-Curve"}</h1>
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Mobile Bottom Navigation */}
            <BottomNav />
        </div>
    );
}

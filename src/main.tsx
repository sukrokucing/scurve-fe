import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/store/authStore";
import { usePermissionStore } from "@/store/permissionStore";

import App from "./App.tsx";
import "./index.css";


// Import Inter font weights
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

function renderApp() {
    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </StrictMode>,
    );
}

// Bootstrapping: ensure any persisted token is set on the auth store and
// attempt to fetch the current user before rendering so initial data
// requests include the Authorization header. This avoids a race where
// components trigger queries before the auth store is hydrated.
async function bootstrap() {
    // Strict bootstrap: set token (if present) then wait for a /api/auth/me
    // round-trip so initial queries run with user context. If the fetch
    // fails, we still render but we've attempted to populate the auth store.
    try {
        if (typeof window !== "undefined") {
            const token = window.localStorage.getItem("token");
            if (token) {
                // Check if we are already hydrated from localStorage (offline-first startup)
                // This prevents "reload storms" from hitting 429s on strict backends.
                const { user } = useAuthStore.getState();
                const { permissions } = usePermissionStore.getState();

                if (user && permissions && permissions.length > 0) {
                    console.debug("[bootstrap] Hydrated from storage, skipping network");
                    renderApp();
                    return;
                }

                useAuthStore.getState().setToken(token);
                // Build the auth URL. In dev we proxy API requests under /api.
                const apiBase = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_URL ?? "");
                try {
                    const res = await fetch(`${apiBase.replace(/\/$/, "")}/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        useAuthStore.getState().setUser(data);

                        // Fetch permissions
                        try {
                            const permRes = await fetch(`${apiBase.replace(/\/$/, "")}/rbac/users/${data.id}/effective-permissions`, {
                                headers: { Authorization: `Bearer ${token}` },
                            });
                            if (permRes.ok) {
                                const permData = await permRes.json();
                                // API returns: { user_id, roles, permissions: [...] }
                                if (permData.permissions) {
                                    usePermissionStore.getState().setPermissions(permData.permissions);
                                }
                            }
                        } catch (e) {
                            console.warn("Failed to fetch permissions", e);
                        }
                    } else if (res.status === 401) {
                        // token invalid/expired
                        useAuthStore.getState().reset();
                    }
                } catch (e) {
                    // network error; leave auth as-is and let UI show offline state
                    // console.debug('bootstrap fetchMe error', e);
                }
            }
        }
    } catch (err) {
        // ignore
    }

    renderApp();
}

// Show a tiny loading splash while bootstrap runs to avoid UI flash.
const root = document.getElementById("root");
if (root) {
    root.innerHTML = '<div class="min-h-screen flex items-center justify-center">Initializing…</div>';
}

bootstrap();

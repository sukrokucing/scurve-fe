import { create } from "zustand";

type NetworkState = {
    isOffline: boolean;
    isRateLimited: boolean; // New state for 429s
    reason?: string | null;
    setOffline: (isOffline: boolean, reason?: string | null) => void;
    setRateLimited: (isRateLimited: boolean) => void; // Action
    registerRequest: (id: string, controller: AbortController) => void;
    unregisterRequest: (id: string) => void;
    abortAllRequests: (reason?: string) => void;
};

export const useNetworkStore = create<NetworkState>((set) => {
    const pending = new Map<string, AbortController>();
    let rateLimitTimer: ReturnType<typeof setTimeout> | null = null; // internal timer

    return {
        isOffline: false,
        isRateLimited: false,
        reason: null,
        setOffline: (isOffline: boolean, reason?: string | null) => {
            if (isOffline) {
                try {
                    pending.forEach((c) => {
                        try {
                            c.abort();
                        } catch {
                            /* ignore */
                        }
                    });
                } finally {
                    pending.clear();
                }
            }
            set({ isOffline, reason: reason ?? null });
        },
        setRateLimited: (isRateLimited) => {
            if (rateLimitTimer) clearTimeout(rateLimitTimer);

            if (isRateLimited) {
                // Auto-clear after 60 seconds (cool down)
                rateLimitTimer = setTimeout(() => {
                    set({ isRateLimited: false });
                }, 60000);
            }
            set({ isRateLimited });
        },
        registerRequest: (id: string, controller: AbortController) => {
            pending.set(id, controller);
        },
        unregisterRequest: (id: string) => {
            pending.delete(id);
        },
        abortAllRequests: (reason?: string) => {
            pending.forEach((c) => {
                try {
                    c.abort();
                } catch {
                    /* ignore */
                }
            });
            pending.clear();
            set({ isOffline: true, reason: reason ?? null });
        },
    };
});

export default useNetworkStore;

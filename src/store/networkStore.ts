import { create } from "zustand";

type NetworkState = {
  isOffline: boolean;
  reason?: string | null;
  setOffline: (isOffline: boolean, reason?: string | null) => void;
  // Register an AbortController for an in-flight request so it can be
  // aborted if we detect the app is offline.
  registerRequest: (id: string, controller: AbortController) => void;
  unregisterRequest: (id: string) => void;
  // Abort all registered in-flight requests (used when flipping offline)
  abortAllRequests: (reason?: string) => void;
};

export const useNetworkStore = create<NetworkState>((set) => {
  // keep pending controllers in closure (not in Zustand state)
  const pending = new Map<string, AbortController>();

  return {
    isOffline: false,
    reason: null,
    setOffline: (isOffline: boolean, reason?: string | null) => {
      // when marking offline, abort any in-flight requests to avoid floods
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

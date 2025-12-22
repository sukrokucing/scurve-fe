import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useNetworkStore } from "@/store/networkStore";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
                // If we know the app is offline, don't attempt retries.
                if (useNetworkStore.getState().isOffline) return false;

                if (import.meta.env.DEV) return false;
                if (failureCount >= 2) return false;

                if (isAxiosError(error)) {
                    // Don't retry on 401s (auth issue), 403s (permission), 404s (not found), or 429s (rate limit)
                    const status = error.response?.status;
                    if (status && [401, 403, 404, 429].includes(status)) return false;
                }

                return true;
            },
        },
    },
});

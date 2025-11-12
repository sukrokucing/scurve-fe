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
        if (isAxiosError(error) && error.response?.status === 401) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

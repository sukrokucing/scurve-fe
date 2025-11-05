import axios, { isAxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { useNetworkStore } from "@/store/networkStore";

export const api = axios.create({
  // Default to the backend API host used when we fetched the OpenAPI spec.
  baseURL: import.meta.env.VITE_API_URL ?? "https://localhost:8800",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAxiosError(error)) {
      // Connection/network-level errors (no response) — show a friendly toast
      if (!error.response) {
          let code: string | undefined | number;
          if (typeof error === "object" && error !== null) {
            const e = error as { code?: string | number };
            code = e.code;
          }
        // Common Node/axios network error codes
        const networkCodes = ["ECONNREFUSED", "ECONNRESET", "ERR_CONNECTION_CLOSED", "ERR_NETWORK", "ENOTFOUND"];
          if (code && typeof code === "string" && networkCodes.includes(code)) {
            useNetworkStore.getState().setOffline(true, code);
            toast.error("Network error: Unable to reach the API. Check the backend or your network connection.");
        } else if (typeof navigator !== "undefined" && !navigator.onLine) {
          useNetworkStore.getState().setOffline(true, "browser_offline");
          toast.error("You appear to be offline. Check your internet connection.");
        } else {
          // Generic network error
          useNetworkStore.getState().setOffline(true, "network_error");
          toast.error("Network error: Failed to contact the API.");
        }
      }

      if (error.response?.status === 401) {
        useAuthStore.getState().reset();
      }
    }

    return Promise.reject(error);
  },
);

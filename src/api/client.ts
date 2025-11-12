import axios, { isAxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { useNetworkStore } from "@/store/networkStore";
import { checkBackendAvailable } from "@/lib/backendCheck";

export const api = axios.create({
  // Default to the backend API host used when we fetched the OpenAPI spec.
  // In dev, prefer a relative base so the Vite proxy can forward requests and
  // avoid CORS. If VITE_API_URL is set, it will be used (for production or
  // explicit overrides).
  baseURL: import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_URL ?? "",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  // Before sending, check whether the backend is reachable. This uses a
  // caching/deduplicated probe (`checkBackendAvailable`) so repeated calls
  // are cheap. If unreachable, short-circuit and mark as offline.
  const ok = await checkBackendAvailable();
  if (!ok) {
    // Create an Axios-like error object so the response error interceptor
    // treats this short-circuit the same as a network-level Axios error
    // (axios.isAxiosError checks for `isAxiosError === true`).
    const err = new Error("offline") as Error & {
      isOffline?: boolean;
      isAxiosError?: boolean;
      code?: string;
      config?: Record<string, unknown> | undefined;
    };
    err.isOffline = true;
    err.isAxiosError = true;
    err.code = "ERR_OFFLINE";
    // Note: we don't attach `config` here because the request was never sent.
    // The response interceptor handles missing config safely.
    // Ensure network store is set (backendCheck already sets it, but be explicit)
    try {
      useNetworkStore.getState().setOffline(true, "api_unreachable");
    } catch {
      /* ignore */
    }
    return Promise.reject(err);
  }

  // Create an AbortController for this request so it can be cancelled if we
  // later detect the app is offline. Register it with the network store so
  // setOffline()/abortAllRequests() can abort it.
  const controller = new AbortController();
  // Attach the signal to axios config (axios respects `signal` in modern versions)
  const cfg = config as unknown as Record<string, unknown>;
  cfg.signal = controller.signal;

  // Create a small request id and store it on the config so response/error
  // interceptors can unregister the controller when the request finishes.
  const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  cfg.__reqId = reqId;
  useNetworkStore.getState().registerRequest(reqId, controller);

  // Prefer the token from the auth store, but fall back to localStorage if the
  // store hasn't been hydrated yet. This makes the Authorization header more
  // robust during app boot where components may fire requests before the
  // zustand store is fully initialized.
  const tokenFromStore = useAuthStore.getState().token;
  const tokenFromStorage = typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
  const finalToken = tokenFromStore ?? tokenFromStorage;
  if (finalToken) {
    config.headers.Authorization = `Bearer ${finalToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    // Unregister request controller if present
    try {
      const id = (response.config as unknown as Record<string, unknown>)?.__reqId as string | undefined;
      if (id) useNetworkStore.getState().unregisterRequest(id);
    } catch {
      // ignore
    }
    return response;
  },
  (error) => {
    // If the request had a registered controller, unregister it
    try {
      const id = (error.config as unknown as Record<string, unknown>)?.__reqId as string | undefined;
      if (id) useNetworkStore.getState().unregisterRequest(id);
    } catch {
      // ignore
    }

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
            console.debug("[api] offline detected (network code)", { code });
            useNetworkStore.getState().setOffline(true, code);
            toast.error("Network error: Unable to reach the API. Check the backend or your network connection.");
        } else if (typeof navigator !== "undefined" && !navigator.onLine) {
          console.debug("[api] offline detected (browser offline)");
          useNetworkStore.getState().setOffline(true, "browser_offline");
          toast.error("You appear to be offline. Check your internet connection.");
        } else {
          // Generic network error
          console.debug("[api] offline detected (generic network error)", { code });
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

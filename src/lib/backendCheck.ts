import { useNetworkStore } from "@/store/networkStore";

// Simple deduplicated backend availability checker with short TTL.
// Exports a function that returns a promise resolving to boolean availability.

let cached: { ok: boolean; ts: number } | null = null;
let pending: Promise<boolean> | null = null;

const TTL = 30 * 1000; // 30 seconds cache

export async function checkBackendAvailable(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && cached && now - cached.ts < TTL) {
    return cached.ok;
  }

  if (pending) return pending;

  pending = (async () => {
      try {
        // Lightweight probe using the Fetch API to avoid axios interceptors.
        // Use a configurable health path and handle the case where
        // `VITE_API_URL` is the empty string (dev proxy / relative requests).
        const apiEnv = import.meta.env.VITE_API_URL;
        const healthPath = (import.meta.env.VITE_API_HEALTH_PATH as string | undefined) ?? "/api/health";

        // Build probe URL.
        // In DEV we always use the relative health path so the Vite dev server
        // proxy can forward requests and handle self-signed certs (secure:false).
        let probeUrl: string;
        if (import.meta.env.DEV) {
          probeUrl = healthPath;
        } else if (apiEnv === undefined) {
          probeUrl = `https://localhost:8800${healthPath}`;
        } else if (apiEnv === "") {
          probeUrl = healthPath;
        } else {
          // ensure we don't duplicate slashes
          probeUrl = apiEnv.endsWith("/") ? `${apiEnv.replace(/\/+$/, "")}${healthPath}` : `${apiEnv}${healthPath}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          try {
            await fetch(probeUrl, { method: "GET", signal: controller.signal });
            // treat any resolved response as reachable (status may be 200 or redirect)
            cached = { ok: true, ts: Date.now() };
            useNetworkStore.getState().setOffline(false, null);
            return true;
          } catch (firstErr) {
            // If the probe failed and the target is localhost over HTTPS, try HTTP
            // This helps local dev when the backend uses a self-signed cert
            // that the browser rejects. Fall back only for localhost/127.0.0.1.
            try {
              const isLocalHttps = probeUrl.startsWith("https://localhost") || probeUrl.startsWith("https://127.0.0.1");
              if (isLocalHttps) {
                const alt = probeUrl.replace(/^https:/, "http:");
                await fetch(alt, { method: "GET", signal: controller.signal });
                cached = { ok: true, ts: Date.now() };
                useNetworkStore.getState().setOffline(false, null);
                return true;
              }
            } catch (secondErr) {
              // swallow - we'll fall through to the outer catch below
            }
            // rethrow the original error so outer catch records offline state
            throw firstErr;
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (err: unknown) {
      cached = { ok: false, ts: Date.now() };
      // set offline state with optional code if it's an Axios error
      let codeStr: string | null = null;
      try {
        if (typeof err === "object" && err !== null) {
          const e = err as { name?: string; message?: string };
          if (e.name) codeStr = e.name;
          else if (e.message) codeStr = e.message;
        }
      } catch {
        /* ignore */
      }

      useNetworkStore.getState().setOffline(true, codeStr ?? "api_unreachable");
      return false;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export function clearBackendCache() {
  cached = null;
}

export default checkBackendAvailable;

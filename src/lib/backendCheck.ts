import { api } from "@/api/client";
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
      // lightweight GET to root (assumes server responds to /)
      await api.get("/");
      cached = { ok: true, ts: Date.now() };
      useNetworkStore.getState().setOffline(false, null);
      return true;
    } catch (err: unknown) {
      cached = { ok: false, ts: Date.now() };
      // set offline state with optional code if it's an Axios error
      let codeStr: string | null = null;
      if (typeof err === "object" && err !== null) {
        const e = err as { code?: string | number; response?: { status?: number } };
        if (typeof e.code === "string") codeStr = e.code;
        else if (typeof e.code === "number") codeStr = String(e.code);
        else if (e.response && typeof e.response.status !== "undefined") codeStr = String(e.response.status);
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

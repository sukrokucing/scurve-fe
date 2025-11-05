import { XCircle } from "lucide-react";
import { useEffect } from "react";
import { useNetworkStore } from "@/store/networkStore";
import { Button } from "@/components/ui/button";
import { checkBackendAvailable } from "@/lib/backendCheck";

export function OfflineBanner() {
  const { isOffline, reason, setOffline } = useNetworkStore();

  useEffect(() => {
    function onOnline() {
      // when browser regains network, attempt a lightweight ping to API and clear state if ok
      checkBackendAvailable(true).then((ok) => {
        if (ok) setOffline(false, null);
        else setOffline(true, "api_unreachable");
      });
    }

    function onOffline() {
      setOffline(true, "browser_offline");
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setOffline]);

  if (!isOffline) return null;

  const message = reason === "browser_offline" ? "You appear to be offline." : "Unable to reach the backend API.";

  return (
    <div className="bg-destructive/95 text-destructive-foreground fixed top-4 left-1/2 z-50 w-[min(980px,calc(100%-2rem))] -translate-x-1/2 rounded-md border p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <XCircle className="h-5 w-5" />
        <div className="flex-1 text-sm">
          <div className="font-medium">{message}</div>
          <div className="text-xs opacity-80">{reason ?? "Network connection to API failed."}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
          <Button size="sm" onClick={() => {
            // attempt a manual ping using deduped checker
            checkBackendAvailable(true).then((ok) => {
              if (ok) setOffline(false, null);
              else setOffline(true, "api_unreachable");
            });
          }}>Retry</Button>
        </div>
      </div>
    </div>
  );
}

export default OfflineBanner;

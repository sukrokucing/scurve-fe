import { Outlet } from "react-router-dom";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Toaster as SonnerToaster } from "sonner";
import sonnerConfig from "@/lib/sonnerConfig";

export function RootLayout() {
  return (
    <div>
      <OfflineBanner />
      <Outlet />
  {/* Mount Sonner's Toaster once at root with app-wide configuration (shadcn-ui recommended) */}
  <SonnerToaster position={sonnerConfig.position} duration={sonnerConfig.duration} />
    </div>
  );
}

export default RootLayout;

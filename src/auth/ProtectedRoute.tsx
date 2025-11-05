import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "@/store/authStore";

export function ProtectedRoute() {
  const location = useLocation();
  const isAuthenticated = Boolean(useAuthStore((state) => state.token));

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

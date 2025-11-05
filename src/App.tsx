import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { router } from "@/routes";

function App() {
  const { fetchMe, token } = useAuth();

  useEffect(() => {
    if (!token) return;
    fetchMe().catch((error) => {
      console.error("Failed to fetch authenticated user", error);
    });
  }, [fetchMe, token]);

  return (
    <>
  <RouterProvider router={router} />
    </>
  );
}

export default App;

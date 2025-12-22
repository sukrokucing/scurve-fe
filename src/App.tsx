import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { router } from "@/routes";

function App() {
    const { fetchMe, token, user } = useAuth();

    useEffect(() => {
        // If we have a token but no user data (unexpected after bootstrap), fetch it.
        // If we already have user data (from bootstrap), skip the fetch.
        if (!token || user) return;

        fetchMe().catch((error) => {
            console.error("Failed to fetch authenticated user", error);
        });
    }, [fetchMe, token, user]);

    return (
        <>
            <RouterProvider router={router} />
        </>
    );
}

export default App;

import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useMyProjectScopesQuery } from "@/api/queries/projects";
import { realtimeClient } from "@/lib/realtime";
import { useAuthStore } from "@/store/authStore";
import { useNetworkStore } from "@/store/networkStore";
import { useRealtimeStore } from "@/store/realtimeStore";

export function RealtimeBootstrap() {
    const location = useLocation();
    const token = useAuthStore((state) => state.token);
    const isOffline = useNetworkStore((state) => state.isOffline);
    const resetRealtimeState = useRealtimeStore((state) => state.reset);
    const setEligibleProjectIds = useRealtimeStore((state) => state.setEligibleProjectIds);
    const { data: projectScopes = [] } = useMyProjectScopesQuery({
        enabled: Boolean(token),
    });

    const eligibleProjectIds = useMemo(
        () => projectScopes
            .filter((scope) => scope.permissions.includes("project.view"))
            .map((scope) => scope.project_id),
        [projectScopes],
    );
    const routeContext = `${location.pathname}${location.search}`;

    useEffect(() => {
        return () => {
            realtimeClient.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!token) {
            realtimeClient.disconnect();
            resetRealtimeState();
            return;
        }

        if (isOffline) {
            realtimeClient.disconnect();
            setEligibleProjectIds([]);
            return;
        }

        realtimeClient.connect(token, eligibleProjectIds, routeContext);
    }, [eligibleProjectIds, isOffline, resetRealtimeState, routeContext, setEligibleProjectIds, token]);

    return null;
}

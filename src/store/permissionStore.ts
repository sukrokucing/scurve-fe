import { create } from 'zustand';
import type { components } from '@/types/api';

export type EffectivePermission = components['schemas']['EffectivePermission'];

interface PermissionState {
    permissions: EffectivePermission[];
    isLoading: boolean;
    setPermissions: (permissions: EffectivePermission[]) => void;
    setIsLoading: (isLoading: boolean) => void;
    hasPermission: (name: string, scope?: Record<string, any>) => boolean;
    reset: () => void;
}

// Helper to load permissions
const getInitialPermissions = (): EffectivePermission[] => {
    if (typeof window === "undefined") return [];
    try {
        const stored = window.localStorage.getItem("permissions");
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn("Failed to read permissions from storage", error);
        return [];
    }
};

export const usePermissionStore = create<PermissionState>((set, get) => ({
    permissions: getInitialPermissions(),
    isLoading: false,
    setPermissions: (permissions) => {
        if (typeof window !== "undefined") {
            try {
                // Persist to local storage
                window.localStorage.setItem("permissions", JSON.stringify(permissions));
            } catch (error) {
                console.warn("Failed to persist permissions", error);
            }
        }
        set({ permissions });
    },
    setIsLoading: (isLoading) => set({ isLoading }),
    hasPermission: (name, scope) => {
        const { permissions } = get();
        // 1. Find permission by name
        const permission = permissions.find((p) => p.name === name);
        if (!permission) return false;

        // 2. If scope is provided, verify it matches
        if (scope && permission.scope) {
            const scopeKeys = Object.keys(scope);
            for (const key of scopeKeys) {
                if (permission.scope[key] !== scope[key]) {
                    return false;
                }
            }
        }

        return true;
    },
    reset: () => {
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("permissions");
            } catch (error) {
                // ignore
            }
        }
        set({ permissions: [], isLoading: false });
    },
}));

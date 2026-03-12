import { create } from 'zustand';
import type { components } from '@/types/api';

export type EffectivePermission = components['schemas']['EffectivePermission'];

interface PermissionState {
    permissions: EffectivePermission[];
    isLoading: boolean;
    setPermissions: (permissions: EffectivePermission[]) => void;
    setIsLoading: (isLoading: boolean) => void;
    hasPermission: (name: string, scope?: Record<string, unknown>) => boolean;
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
        const namedPermissions = permissions.filter((permission) => permission.name === name);
        if (namedPermissions.length === 0) return false;
        if (!scope) return true;

        const scopeEntries = Object.entries(scope);
        return namedPermissions.some((permission) => {
            // Global permission without scope matches any scoped check.
            if (!permission.scope) return true;
            return scopeEntries.every(([key, value]) => permission.scope?.[key] === value);
        });
    },
    reset: () => {
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("permissions");
            } catch {
                // ignore
            }
        }
        set({ permissions: [], isLoading: false });
    },
}));

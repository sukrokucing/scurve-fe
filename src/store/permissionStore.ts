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

export const usePermissionStore = create<PermissionState>((set, get) => ({
    permissions: [],
    isLoading: false,
    setPermissions: (permissions) => set({ permissions }),
    setIsLoading: (isLoading) => set({ isLoading }),
    hasPermission: (name, scope) => {
        const { permissions } = get();
        // 1. Find permission by name
        const permission = permissions.find((p) => p.name === name);
        if (!permission) return false;

        // 2. If scope is provided, verify it matches
        // Note: This is a basic scope match. Real implementation might need deep comparison
        // or specific logic depending on how your backend returns scopes.
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
    reset: () => set({ permissions: [], isLoading: false }),
}));

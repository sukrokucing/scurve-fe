import { create } from "zustand";

import type { User } from "@/types/domain";

type AuthState = {
    user: User | null;
    token: string | null;
    setUser: (user: User | null) => void;
    setToken: (token: string | null) => void;
    reset: () => void;
};

const getInitialToken = () => {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        return window.localStorage.getItem("token");
    } catch (error) {
        console.warn("Failed to read auth token from storage", error);
        return null;
    }
};

const getInitialUser = () => {
    if (typeof window === "undefined") return null;
    try {
        const stored = window.localStorage.getItem("user");
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        console.warn("Failed to read user from storage", error);
        return null;
    }
};

export const useAuthStore = create<AuthState>((set) => ({
    user: getInitialUser(),
    token: getInitialToken(),
    setUser: (user) => {
        if (typeof window !== "undefined") {
            try {
                if (user) {
                    window.localStorage.setItem("user", JSON.stringify(user));
                } else {
                    window.localStorage.removeItem("user");
                }
            } catch (error) {
                console.warn("Failed to persist user", error);
            }
        }
        set({ user });
    },
    setToken: (token) => {
        if (typeof window !== "undefined") {
            try {
                if (token) {
                    window.localStorage.setItem("token", token);
                } else {
                    window.localStorage.removeItem("token");
                }
            } catch (error) {
                console.warn("Failed to persist auth token", error);
            }
        }
        set({ token });
    },
    reset: () => {
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("token");
                window.localStorage.removeItem("user");
                window.localStorage.removeItem("permissions");
            } catch (error) {
                console.warn("Failed to clear auth storage", error);
            }
        }
        set({ user: null, token: null });
    },
}));

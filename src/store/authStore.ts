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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getInitialToken(),
  setUser: (user) => set({ user }),
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
      } catch (error) {
        console.warn("Failed to clear auth token", error);
      }
    }
    set({ user: null, token: null });
  },
}));

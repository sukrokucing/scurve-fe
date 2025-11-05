import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { api } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types/domain";

export type Credentials = {
  email: string;
  password: string;
};

type AuthResponse = {
  token: string;
  user: User;
};

export function useAuth() {
  const queryClient = useQueryClient();
  const { user, token, setToken, setUser, reset } = useAuthStore();

  const login = useCallback(
    async (credentials: Credentials) => {
      const { data } = await api.post<AuthResponse>("/auth/login", credentials);
      setToken(data.token);
      setUser(data.user);
      await queryClient.invalidateQueries();
    },
    [queryClient, setToken, setUser],
  );

  const registerUser = useCallback(
    async (payload: Credentials & { name: string }) => {
      const { data } = await api.post<AuthResponse>("/auth/register", payload);
      setToken(data.token);
      setUser(data.user);
      await queryClient.invalidateQueries();
    },
    [queryClient, setToken, setUser],
  );

  const logout = useCallback(() => {
    reset();
    queryClient.clear();
  }, [queryClient, reset]);

  const fetchMe = useCallback(async () => {
    if (!token) return null;
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
      return data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        reset();
      }
      throw error;
    }
  }, [reset, setUser, token]);

  return {
    user,
    token,
    isAuthenticated: Boolean(token),
    login,
    register: registerUser,
    logout,
    fetchMe,
  };
}

import axios, { isAxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";

export const api = axios.create({
  // Default to the backend API host used when we fetched the OpenAPI spec.
  baseURL: import.meta.env.VITE_API_URL ?? "https://localhost:8800",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      useAuthStore.getState().reset();
    }
    return Promise.reject(error);
  },
);

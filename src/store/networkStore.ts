import { create } from "zustand";

type NetworkState = {
  isOffline: boolean;
  reason?: string | null;
  setOffline: (isOffline: boolean, reason?: string | null) => void;
};

export const useNetworkStore = create<NetworkState>((set) => ({
  isOffline: false,
  reason: null,
  setOffline: (isOffline: boolean, reason?: string | null) => set({ isOffline, reason: reason ?? null }),
}));

export default useNetworkStore;

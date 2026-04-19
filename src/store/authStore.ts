import { create } from "zustand";
import { api, UserInfo } from "../api/commands";

interface AuthState {
  isLoggedIn: boolean;
  user: UserInfo | null;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  login: (homeserver: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  recoverEncryption: (recoveryKey: string) => Promise<string>;
  updateAvatarUrl: (url: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  user: null,
  isLoading: false,
  isRestoring: true, // starts true — we check for saved session on launch
  error: null,

  restoreSession: async () => {
    set({ isRestoring: true });
    try {
      const user = await api.restoreSession();
      set({ isLoggedIn: true, user, isRestoring: false });
      return true;
    } catch {
      set({ isRestoring: false });
      return false;
    }
  },

  login: async (homeserver, username, password) => {
    set({ isLoading: true, error: null });
    try {
      const user = await api.login({ homeserver, username, password });
      set({ isLoggedIn: true, user, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ isLoggedIn: false, user: null });
    }
  },

  recoverEncryption: async (recoveryKey: string) => {
    return await api.recoverEncryption(recoveryKey);
  },

  updateAvatarUrl: (url: string) => set((s) => ({
    user: s.user ? { ...s.user, avatar_url: url } : null,
  })),
}));

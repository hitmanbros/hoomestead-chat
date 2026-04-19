import { create } from "zustand";

type HomeView = "friends" | "dms" | "discover";
type SettingsPage = "profile" | "appearance" | "voice" | null;

interface UIState {
  showMemberSidebar: boolean;
  homeView: HomeView;
  settingsPage: SettingsPage;
  toggleMemberSidebar: () => void;
  setHomeView: (view: HomeView) => void;
  openSettings: (page?: SettingsPage) => void;
  closeSettings: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  showMemberSidebar: true,
  homeView: "friends",
  settingsPage: null,
  toggleMemberSidebar: () => set((s) => ({ showMemberSidebar: !s.showMemberSidebar })),
  setHomeView: (view) => set({ homeView: view }),
  openSettings: (page = "profile") => set({ settingsPage: page }),
  closeSettings: () => set({ settingsPage: null }),
}));

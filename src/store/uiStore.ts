import { create } from "zustand";

type HomeView = "friends" | "dms" | "discover";
type SettingsPage = "profile" | "appearance" | "voice" | null;
type MobileView = "servers" | "channels" | "chat" | "settings";

interface UIState {
  showMemberSidebar: boolean;
  homeView: HomeView;
  settingsPage: SettingsPage;
  mobileView: MobileView;
  toggleMemberSidebar: () => void;
  setShowMemberSidebar: (show: boolean) => void;
  setHomeView: (view: HomeView) => void;
  openSettings: (page?: SettingsPage) => void;
  closeSettings: () => void;
  setMobileView: (view: MobileView) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showMemberSidebar: true,
  homeView: "friends",
  settingsPage: null,
  mobileView: "chat",
  toggleMemberSidebar: () => set((s) => ({ showMemberSidebar: !s.showMemberSidebar })),
  setShowMemberSidebar: (show) => set({ showMemberSidebar: show }),
  setHomeView: (view) => set({ homeView: view }),
  openSettings: (page = "profile") => set({ settingsPage: page }),
  closeSettings: () => set({ settingsPage: null }),
  setMobileView: (view) => set({ mobileView: view }),
}));

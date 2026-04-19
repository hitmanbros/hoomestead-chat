import { create } from "zustand";
import { api, SpaceInfo } from "../api/commands";

interface SpaceState {
  spaces: SpaceInfo[];
  selectedSpaceId: string | null;
  isLoading: boolean;
  fetchSpaces: () => Promise<void>;
  selectSpace: (spaceId: string | null) => void;
}

export const useSpaceStore = create<SpaceState>((set) => ({
  spaces: [],
  selectedSpaceId: null,
  isLoading: false,

  fetchSpaces: async () => {
    set({ isLoading: true });
    try {
      const spaces = await api.getSpaces();
      set({ spaces, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  selectSpace: (spaceId) => set({ selectedSpaceId: spaceId }),
}));

import { create } from "zustand";
import { api, RoomInfo } from "../api/commands";

interface RoomState {
  rooms: RoomInfo[];
  dmRooms: RoomInfo[];
  selectedRoomId: string | null;
  isLoading: boolean;
  /** Maps spaceId -> total unread count across its rooms */
  spaceUnreadCounts: Record<string, number>;
  fetchRooms: (spaceId: string) => Promise<void>;
  fetchDmRooms: () => Promise<void>;
  selectRoom: (roomId: string | null) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  dmRooms: [],
  selectedRoomId: null,
  isLoading: false,
  spaceUnreadCounts: {},

  fetchRooms: async (spaceId) => {
    set({ isLoading: true });
    try {
      const rooms = await api.getSpaceRooms(spaceId);
      const totalUnread = rooms.reduce((sum, r) => sum + r.unread_count, 0);
      set((s) => ({
        rooms,
        isLoading: false,
        spaceUnreadCounts: { ...s.spaceUnreadCounts, [spaceId]: totalUnread },
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  fetchDmRooms: async () => {
    try {
      const dmRooms = await api.getDirectRooms();
      set({ dmRooms });
    } catch {
      // silent
    }
  },

  selectRoom: (roomId) => set({ selectedRoomId: roomId }),
}));

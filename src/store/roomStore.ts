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
  markRoomRead: (roomId: string) => void;
  incrementRoomUnread: (roomId: string) => void;
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

  markRoomRead: (roomId) =>
    set((s) => {
      const room = s.rooms.find((r) => r.room_id === roomId);
      const dm = s.dmRooms.find((r) => r.room_id === roomId);
      const delta = (room?.unread_count ?? 0) || (dm?.unread_count ?? 0);
      if (delta === 0) return {};
      const updated = s.rooms.map((r) =>
        r.room_id === roomId ? { ...r, unread_count: 0 } : r,
      );
      const updatedDms = s.dmRooms.map((r) =>
        r.room_id === roomId ? { ...r, unread_count: 0 } : r,
      );
      const spaceCounts = { ...s.spaceUnreadCounts };
      for (const [spaceId, total] of Object.entries(spaceCounts)) {
        if (total > 0) {
          const next = Math.max(0, total - delta);
          spaceCounts[spaceId] = next;
        }
      }
      return { rooms: updated, dmRooms: updatedDms, spaceUnreadCounts: spaceCounts };
    }),

  incrementRoomUnread: (roomId) =>
    set((s) => {
      if (s.selectedRoomId === roomId) return {};
      const roomIdx = s.rooms.findIndex((r) => r.room_id === roomId);
      const dmIdx = s.dmRooms.findIndex((r) => r.room_id === roomId);
      if (roomIdx === -1 && dmIdx === -1) return {};
      const rooms =
        roomIdx >= 0
          ? s.rooms.map((r, i) =>
              i === roomIdx ? { ...r, unread_count: r.unread_count + 1 } : r,
            )
          : s.rooms;
      const dmRooms =
        dmIdx >= 0
          ? s.dmRooms.map((r, i) =>
              i === dmIdx ? { ...r, unread_count: r.unread_count + 1 } : r,
            )
          : s.dmRooms;
      return { rooms, dmRooms };
    }),
}));

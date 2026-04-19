import { create } from "zustand";
import { api, MemberInfo } from "../api/commands";

interface MemberState {
  members: MemberInfo[];
  isLoading: boolean;
  typingUsers: string[];
  fetchMembers: (roomId: string) => Promise<void>;
  setTypingUsers: (userIds: string[]) => void;
  updatePresence: (userId: string, presence: string) => void;
}

export const useMemberStore = create<MemberState>((set) => ({
  members: [],
  isLoading: false,
  typingUsers: [],

  fetchMembers: async (roomId) => {
    set({ isLoading: true });
    try {
      const members = await api.getRoomMembers(roomId);
      set({ members, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setTypingUsers: (userIds) => set({ typingUsers: userIds }),

  updatePresence: (userId, presence) => {
    set((state) => ({
      members: state.members.map((m) =>
        m.user_id === userId ? { ...m, presence } : m,
      ),
    }));
  },
}));

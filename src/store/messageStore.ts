import { create } from "zustand";
import { api, MessageInfo } from "../api/commands";

export interface Reaction {
  eventId: string;
  sender: string;
  key: string;
}

interface PaginationState {
  endToken: string | null;
  hasMore: boolean;
}

interface MessageState {
  messagesByRoom: Record<string, MessageInfo[]>;
  reactionsByRoom: Record<string, Record<string, Reaction[]>>; // roomId -> messageEventId -> reactions
  paginationByRoom: Record<string, PaginationState>;
  currentRoomId: string | null;
  isLoading: boolean;
  isLoadingOlder: boolean;
  messages: MessageInfo[];
  reactions: Record<string, Reaction[]>; // current room's reactions by message event_id
  fetchMessages: (roomId: string, limit?: number) => Promise<void>;
  fetchOlderMessages: (roomId: string) => Promise<void>;
  addMessage: (roomId: string, message: MessageInfo) => void;
  addReaction: (roomId: string, relatesToEventId: string, reaction: Reaction) => void;
  removeReaction: (roomId: string, relatesToEventId: string, reactionEventId: string) => void;
  removeMessage: (roomId: string, eventId: string) => void;
  sendMessage: (roomId: string, body: string, replyTo?: string) => Promise<void>;
  setCurrentRoom: (roomId: string | null) => void;
  clearCache: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByRoom: {},
  reactionsByRoom: {},
  paginationByRoom: {},
  currentRoomId: null,
  isLoading: false,
  isLoadingOlder: false,
  messages: [],
  reactions: {},

  setCurrentRoom: (roomId) => {
    const cached = roomId ? get().messagesByRoom[roomId] || [] : [];
    const reactions = roomId ? get().reactionsByRoom[roomId] || {} : {};
    set({ currentRoomId: roomId, messages: cached, reactions });
  },

  fetchMessages: async (roomId, limit) => {
    const cached = get().messagesByRoom[roomId];
    if (cached && cached.length > 0) {
      const reactions = get().reactionsByRoom[roomId] || {};
      set({ messages: cached, reactions, isLoading: false, currentRoomId: roomId });
      return;
    }

    set({ isLoading: true, currentRoomId: roomId });
    try {
      const response = await api.getMessages(roomId, limit);
      const reactions = get().reactionsByRoom[roomId] || {};
      set((state) => ({
        messages: response.messages,
        reactions,
        isLoading: false,
        messagesByRoom: { ...state.messagesByRoom, [roomId]: response.messages },
        paginationByRoom: {
          ...state.paginationByRoom,
          [roomId]: { endToken: response.end, hasMore: response.has_more },
        },
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  fetchOlderMessages: async (roomId) => {
    const pagination = get().paginationByRoom[roomId];
    if (!pagination?.hasMore || !pagination.endToken || get().isLoadingOlder) return;

    set({ isLoadingOlder: true });
    try {
      const response = await api.getMessages(roomId, 50, pagination.endToken);
      set((state) => {
        const existing = state.messagesByRoom[roomId] || [];
        // Prepend older messages, deduplicate
        const existingIds = new Set(existing.map((m) => m.event_id));
        const newMessages = response.messages.filter((m) => !existingIds.has(m.event_id));
        const merged = [...newMessages, ...existing];
        return {
          isLoadingOlder: false,
          messagesByRoom: { ...state.messagesByRoom, [roomId]: merged },
          messages: roomId === state.currentRoomId ? merged : state.messages,
          paginationByRoom: {
            ...state.paginationByRoom,
            [roomId]: { endToken: response.end, hasMore: response.has_more },
          },
        };
      });
    } catch {
      set({ isLoadingOlder: false });
    }
  },

  addMessage: (roomId, message) => {
    set((state) => {
      const existing = state.messagesByRoom[roomId] || [];
      if (existing.some((m) => m.event_id === message.event_id)) {
        return state;
      }
      const updated = [...existing, message];
      const newByRoom = { ...state.messagesByRoom, [roomId]: updated };
      if (roomId === state.currentRoomId) {
        return { messagesByRoom: newByRoom, messages: updated };
      }
      return { messagesByRoom: newByRoom };
    });
  },

  removeMessage: (roomId, eventId) => {
    set((state) => {
      const existing = state.messagesByRoom[roomId] || [];
      const updated = existing.filter((m) => m.event_id !== eventId);
      const newByRoom = { ...state.messagesByRoom, [roomId]: updated };
      if (roomId === state.currentRoomId) {
        return { messagesByRoom: newByRoom, messages: updated };
      }
      return { messagesByRoom: newByRoom };
    });
  },

  addReaction: (roomId, relatesToEventId, reaction) => {
    set((state) => {
      const roomReactions = { ...(state.reactionsByRoom[roomId] || {}) };
      const existing = roomReactions[relatesToEventId] || [];
      // Deduplicate
      if (existing.some((r) => r.eventId === reaction.eventId)) return state;
      roomReactions[relatesToEventId] = [...existing, reaction];
      const newByRoom = { ...state.reactionsByRoom, [roomId]: roomReactions };
      if (roomId === state.currentRoomId) {
        return { reactionsByRoom: newByRoom, reactions: roomReactions };
      }
      return { reactionsByRoom: newByRoom };
    });
  },

  removeReaction: (roomId, relatesToEventId, reactionEventId) => {
    set((state) => {
      const roomReactions = { ...(state.reactionsByRoom[roomId] || {}) };
      const existing = roomReactions[relatesToEventId] || [];
      roomReactions[relatesToEventId] = existing.filter((r) => r.eventId !== reactionEventId);
      const newByRoom = { ...state.reactionsByRoom, [roomId]: roomReactions };
      if (roomId === state.currentRoomId) {
        return { reactionsByRoom: newByRoom, reactions: roomReactions };
      }
      return { reactionsByRoom: newByRoom };
    });
  },

  sendMessage: async (roomId, body, replyTo) => {
    await api.sendMessage(roomId, body, replyTo);
  },

  clearCache: () => {
    const currentRoom = get().currentRoomId;
    set({
      messagesByRoom: {},
      paginationByRoom: {},
      reactionsByRoom: {},
      messages: [],
      reactions: {},
    });
    // Re-fetch current room so user sees decrypted messages immediately
    if (currentRoom) {
      get().fetchMessages(currentRoom);
    }
  },
}));

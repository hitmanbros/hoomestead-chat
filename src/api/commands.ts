import { apiFetch, apiUpload } from "./transport";

export interface LoginRequest {
  homeserver: string;
  username: string;
  password: string;
}

export interface UserInfo {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SpaceInfo {
  room_id: string;
  name: string | null;
  avatar_url: string | null;
  topic: string | null;
}

export interface RoomInfo {
  room_id: string;
  name: string | null;
  topic: string | null;
  is_direct: boolean;
  unread_count: number;
  avatar_url: string | null;
  other_user_id?: string;
  channel_type: string;
}

export interface MessageInfo {
  event_id: string;
  sender: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  body: string;
  formatted_body: string | null;
  timestamp: number;
  msg_type: string;
  reply_to: string | null;
  media_url: string | null;
}

export interface MessagesResponse {
  messages: MessageInfo[];
  end: string | null;
  has_more: boolean;
}

export interface MemberInfo {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  presence: string;
  power_level: number;
  is_server_admin: boolean;
}

export interface FriendInfo {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  presence: string;
  room_id: string;
}

export interface ReactionGroup {
  key: string;
  count: number;
  senders: string[];
}

export interface PublicSpaceInfo {
  room_id: string;
  name: string | null;
  topic: string | null;
  avatar_url: string | null;
  num_joined_members: number;
  join_rule: string;
  is_invited: boolean;
}

export interface LiveKitToken {
  url: string;
  token: string;
}

export interface TurnServer {
  uris: string[];
  username: string;
  password: string;
  ttl: number;
}

export const api = {
  login: (request: LoginRequest) =>
    apiFetch<UserInfo>("/api/login", { method: "POST", body: JSON.stringify(request) }),

  logout: () =>
    apiFetch<void>("/api/logout", { method: "POST" }),

  restoreSession: () =>
    apiFetch<UserInfo>("/api/restore-session", { method: "POST" }),

  recoverEncryption: (recoveryKey: string) =>
    apiFetch<string>("/api/recover-encryption", {
      method: "POST",
      body: JSON.stringify({ recovery_key: recoveryKey }),
    }),

  getSpaces: () =>
    apiFetch<SpaceInfo[]>("/api/spaces"),

  createSpace: (name: string, topic?: string, isPublic: boolean = true) =>
    apiFetch<SpaceInfo>("/api/spaces", {
      method: "POST",
      body: JSON.stringify({ name, topic, public: isPublic }),
    }),

  getSpaceRooms: (spaceId: string) =>
    apiFetch<RoomInfo[]>(`/api/spaces/${encodeURIComponent(spaceId)}/rooms`),

  getDirectRooms: () =>
    apiFetch<RoomInfo[]>("/api/direct-rooms"),

  createRoom: (
    name: string,
    topic?: string,
    spaceId?: string,
    encrypted: boolean = true,
    channelType: string = "text",
  ) =>
    apiFetch<RoomInfo>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name,
        topic,
        space_id: spaceId,
        encrypted,
        channel_type: channelType,
      }),
    }),

  createDm: (userId: string) =>
    apiFetch<RoomInfo>("/api/dm", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),

  joinRoom: (roomId: string) =>
    apiFetch<void>("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ room_id: roomId }),
    }),

  leaveRoom: (roomId: string) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/leave`, { method: "POST" }),

  deleteRoom: (roomId: string, spaceId?: string) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/delete`, {
      method: "POST",
      body: JSON.stringify({ space_id: spaceId }),
    }),

  getMessages: (roomId: string, limit?: number, from?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (from) params.set("from", from);
    const qs = params.toString();
    return apiFetch<MessagesResponse>(
      `/api/rooms/${encodeURIComponent(roomId)}/messages${qs ? `?${qs}` : ""}`,
    );
  },

  sendMessage: (roomId: string, body: string, replyTo?: string) =>
    apiFetch<string>(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, reply_to: replyTo }),
    }),

  getRoomMembers: (roomId: string) =>
    apiFetch<MemberInfo[]>(`/api/rooms/${encodeURIComponent(roomId)}/members`),

  getMediaUrl: (mxcUrl: string) =>
    apiFetch<string>(`/api/media?mxc=${encodeURIComponent(mxcUrl)}`),

  uploadFile: (roomId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload<string>(`/api/rooms/${encodeURIComponent(roomId)}/upload`, formData);
  },

  sendTyping: (roomId: string, typing: boolean) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/typing`, {
      method: "POST",
      body: JSON.stringify({ typing }),
    }),

  sendReaction: (roomId: string, eventId: string, key: string) =>
    apiFetch<string>(`/api/rooms/${encodeURIComponent(roomId)}/reactions`, {
      method: "POST",
      body: JSON.stringify({ event_id: eventId, key }),
    }),

  redactEvent: (roomId: string, eventId: string, reason?: string) =>
    apiFetch<void>(
      `/api/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),

  sendReadReceipt: (roomId: string, eventId: string) =>
    apiFetch<void>(
      `/api/rooms/${encodeURIComponent(roomId)}/read-receipt/${encodeURIComponent(eventId)}`,
      { method: "POST" },
    ),

  kickMember: (roomId: string, userId: string, reason?: string) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/kick`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, reason }),
    }),

  banMember: (roomId: string, userId: string, reason?: string) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/ban`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, reason }),
    }),

  setServerAdminStatus: (isAdmin: boolean) =>
    apiFetch<void>("/api/server-admin-status", {
      method: "POST",
      body: JSON.stringify({ is_admin: isAdmin }),
    }),

  setPowerLevel: (roomId: string, userId: string, powerLevel: number) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/power-level`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, power_level: powerLevel }),
    }),

  getFriends: () =>
    apiFetch<FriendInfo[]>("/api/friends"),

  setAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload<string>("/api/avatar", formData);
  },

  getAllJoinedRooms: () =>
    apiFetch<RoomInfo[]>("/api/rooms/all"),

  getPublicSpaces: () =>
    apiFetch<PublicSpaceInfo[]>("/api/spaces/public"),

  addRoomToSpace: (spaceId: string, roomId: string) =>
    apiFetch<void>(`/api/spaces/${encodeURIComponent(spaceId)}/add-room`, {
      method: "POST",
      body: JSON.stringify({ room_id: roomId }),
    }),

  // Voice/Video
  joinVoiceChannel: (roomId: string) =>
    apiFetch<LiveKitToken>(`/api/rooms/${encodeURIComponent(roomId)}/voice/join`, {
      method: "POST",
    }),

  leaveVoiceChannel: (roomId: string) =>
    apiFetch<void>(`/api/rooms/${encodeURIComponent(roomId)}/voice/leave`, {
      method: "POST",
    }),

  getTurnServer: () =>
    apiFetch<TurnServer>("/api/turn-server"),
};

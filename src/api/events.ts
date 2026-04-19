import { getBackendUrl } from "./transport";
import type { MessageInfo } from "./commands";

export interface NewMessageEvent {
  room_id: string;
  message: MessageInfo;
}

export interface TypingEvent {
  room_id: string;
  user_ids: string[];
}

export interface PresenceEvent {
  user_id: string;
  presence: string;
}

export interface ReactionEvent {
  room_id: string;
  event_id: string;
  relates_to: string;
  sender: string;
  key: string;
}

export interface MemberChangeEvent {
  room_id: string;
  user_id: string;
  membership: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CallMemberEvent {
  room_id: string;
  user_id: string;
  device_id: string;
  action: string; // "join" or "leave"
}

export interface ClientUpdateEvent {
  sender: string;
  message: string;
  room_id: string;
}

type UnlistenFn = () => void;

let eventSource: EventSource | null = null;
const listeners: Map<string, Set<(data: any) => void>> = new Map();

/** Connect to the SSE event stream. Call once after login/restore. */
export function connectEvents(): UnlistenFn {
  if (eventSource) {
    eventSource.close();
  }

  const url = `${getBackendUrl()}/api/events`;
  eventSource = new EventSource(url);

  const eventTypes = [
    "new-message",
    "typing",
    "presence-update",
    "reaction",
    "member-change",
    "call-member",
    "sync-ready",
    "sync-error",
    "client-update",
  ];

  for (const type of eventTypes) {
    eventSource.addEventListener(type, (e: MessageEvent) => {
      const callbacks = listeners.get(type);
      if (callbacks) {
        const data = JSON.parse(e.data);
        for (const cb of callbacks) {
          cb(data);
        }
      }
    });
  }

  eventSource.onerror = () => {
    // EventSource auto-reconnects
    console.warn("SSE connection error, will auto-reconnect");
  };

  return () => {
    eventSource?.close();
    eventSource = null;
  };
}

function addListener(eventType: string, callback: (data: any) => void): UnlistenFn {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }
  listeners.get(eventType)!.add(callback);
  return () => {
    listeners.get(eventType)?.delete(callback);
  };
}

export function onNewMessage(callback: (event: NewMessageEvent) => void): UnlistenFn {
  return addListener("new-message", callback);
}

export function onTyping(callback: (event: TypingEvent) => void): UnlistenFn {
  return addListener("typing", callback);
}

export function onPresence(callback: (event: PresenceEvent) => void): UnlistenFn {
  return addListener("presence-update", callback);
}

export function onReaction(callback: (event: ReactionEvent) => void): UnlistenFn {
  return addListener("reaction", callback);
}

export function onMemberChange(callback: (event: MemberChangeEvent) => void): UnlistenFn {
  return addListener("member-change", callback);
}

export function onCallMember(callback: (event: CallMemberEvent) => void): UnlistenFn {
  return addListener("call-member", callback);
}

export function onSyncReady(callback: () => void): UnlistenFn {
  return addListener("sync-ready", callback);
}

export function onClientUpdate(callback: (event: ClientUpdateEvent) => void): UnlistenFn {
  return addListener("client-update", callback);
}

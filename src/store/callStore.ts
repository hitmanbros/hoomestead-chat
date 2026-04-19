import { create } from "zustand";
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  VideoPresets,
  ScreenSharePresets,
} from "livekit-client";
import { api } from "../api/commands";

/** Wait for RTCPeerConnection to become available (webkit2gtk enables it asynchronously). */
async function waitForWebRTC(timeoutMs = 3000): Promise<boolean> {
  if (typeof RTCPeerConnection !== "undefined") return true;
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (typeof RTCPeerConnection !== "undefined") return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

export interface VoiceParticipant {
  userId: string;
  displayName: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
}

interface CallState {
  // Connection state
  connectedRoomId: string | null;
  connectedRoomName: string | null;
  connectionState: "disconnected" | "connecting" | "connected";
  livekitRoom: Room | null;

  // Local user state
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;

  // Participants in the current voice channel
  participants: VoiceParticipant[];

  // Per-room voice members (from m.call.member state events)
  voiceMembers: Record<string, string[]>; // roomId -> userId[]

  // Actions
  joinVoiceChannel: (roomId: string, roomName: string | null) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  addVoiceMember: (roomId: string, userId: string) => void;
  removeVoiceMember: (roomId: string, userId: string) => void;
  updateParticipants: () => void;
}

export const useCallStore = create<CallState>((set, get) => ({
  connectedRoomId: null,
  connectedRoomName: null,
  connectionState: "disconnected",
  livekitRoom: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  participants: [],
  voiceMembers: {},

  joinVoiceChannel: async (roomId: string, roomName: string | null) => {
    const state = get();

    // Already in this room
    if (state.connectedRoomId === roomId) return;

    // Leave current room first
    if (state.connectedRoomId) {
      await get().leaveVoiceChannel();
    }

    set({ connectionState: "connecting", connectedRoomId: roomId, connectedRoomName: roomName });

    try {
      // Wait for WebRTC APIs (webkit2gtk on Linux enables them asynchronously)
      const webrtcAvailable = await waitForWebRTC();
      if (!webrtcAvailable) {
        throw new Error(
          "WebRTC is not supported in this browser. On Linux, ensure GStreamer WebRTC plugins are installed (gst-plugins-bad, gst-plugin-pipewire)."
        );
      }

      // Get LiveKit token from backend
      const { url, token } = await api.joinVoiceChannel(roomId);

      // Create LiveKit room
      const lkRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
        },
        rtcConfig: {
          iceTransportPolicy: "all" as RTCIceTransportPolicy,
          iceServers: [], // Let LiveKit server provide ICE servers, skip default Twilio STUN
        },
      } as any);

      // Set up event handlers
      lkRoom.on(RoomEvent.TrackSubscribed, () => get().updateParticipants());
      lkRoom.on(RoomEvent.TrackUnsubscribed, () => get().updateParticipants());
      lkRoom.on(RoomEvent.TrackMuted, () => get().updateParticipants());
      lkRoom.on(RoomEvent.TrackUnmuted, () => get().updateParticipants());
      lkRoom.on(RoomEvent.ActiveSpeakersChanged, () => get().updateParticipants());
      lkRoom.on(RoomEvent.ParticipantConnected, () => get().updateParticipants());
      lkRoom.on(RoomEvent.ParticipantDisconnected, () => get().updateParticipants());
      lkRoom.on(RoomEvent.Disconnected, () => {
        set({
          connectedRoomId: null,
          connectedRoomName: null,
          connectionState: "disconnected",
          livekitRoom: null,
          participants: [],
          isMuted: false,
          isDeafened: false,
          isCameraOn: false,
          isScreenSharing: false,
        });
      });

      // Poll audio levels locally for faster speaking indicator (~50ms vs ~500ms server-side)
      let audioMonitor: ReturnType<typeof setInterval> | null = null;
      const prevSpeaking = new Map<string, boolean>();

      const pollAudioLevels = () => {
        let changed = false;
        const checkParticipant = (p: Participant) => {
          const speaking = p.audioLevel > 0.01;
          if (prevSpeaking.get(p.identity) !== speaking) {
            prevSpeaking.set(p.identity, speaking);
            changed = true;
          }
        };
        checkParticipant(lkRoom.localParticipant);
        for (const p of lkRoom.remoteParticipants.values()) {
          checkParticipant(p);
        }
        if (changed) get().updateParticipants();
      };

      audioMonitor = setInterval(pollAudioLevels, 50);

      lkRoom.on(RoomEvent.Disconnected, () => {
        if (audioMonitor) clearInterval(audioMonitor);
      });

      // Connect
      await lkRoom.connect(url, token);

      // Enable mic by default, camera off — user toggles video manually
      let micEnabled = false;
      try {
        await lkRoom.localParticipant.setMicrophoneEnabled(true);
        micEnabled = true;
      } catch (micErr) {
        console.warn("Could not enable microphone:", micErr);
      }

      set({
        livekitRoom: lkRoom,
        connectionState: "connected",
        isMuted: !micEnabled,
        isCameraOn: false,
      });

      get().updateParticipants();
    } catch (e) {
      console.error("Failed to join voice channel:", e);
      set({
        connectedRoomId: null,
        connectedRoomName: null,
        connectionState: "disconnected",
      });
      throw e;
    }
  },

  leaveVoiceChannel: async () => {
    const { livekitRoom, connectedRoomId } = get();

    if (livekitRoom) {
      livekitRoom.disconnect();
    }

    if (connectedRoomId) {
      try {
        await api.leaveVoiceChannel(connectedRoomId);
      } catch (e) {
        console.error("Failed to send leave event:", e);
      }
    }

    set({
      connectedRoomId: null,
      connectedRoomName: null,
      connectionState: "disconnected",
      livekitRoom: null,
      participants: [],
      isMuted: false,
      isDeafened: false,
      isCameraOn: false,
      isScreenSharing: false,
    });
  },

  toggleMute: () => {
    const { livekitRoom, isMuted } = get();
    if (!livekitRoom) return;

    const newMuted = !isMuted;
    livekitRoom.localParticipant.setMicrophoneEnabled(!newMuted);
    set({ isMuted: newMuted });
    get().updateParticipants();
  },

  toggleDeafen: () => {
    const { livekitRoom, isDeafened } = get();
    if (!livekitRoom) return;

    const newDeafened = !isDeafened;
    // Mute all remote audio tracks
    for (const participant of livekitRoom.remoteParticipants.values()) {
      for (const pub_ of participant.trackPublications.values()) {
        if (pub_.track && pub_.track.kind === Track.Kind.Audio) {
          if (newDeafened) {
            pub_.track.detach();
          } else {
            // Re-attach audio element
            const el = pub_.track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
          }
        }
      }
    }

    // Also mute mic when deafening
    if (newDeafened && !get().isMuted) {
      livekitRoom.localParticipant.setMicrophoneEnabled(false);
      set({ isMuted: true });
    }

    set({ isDeafened: newDeafened });
  },

  toggleCamera: async () => {
    const { livekitRoom, isCameraOn } = get();
    if (!livekitRoom) return;

    const newCameraOn = !isCameraOn;
    await livekitRoom.localParticipant.setCameraEnabled(newCameraOn);
    set({ isCameraOn: newCameraOn });
    get().updateParticipants();
  },

  toggleScreenShare: async () => {
    const { livekitRoom, isScreenSharing } = get();
    if (!livekitRoom) return;

    const newScreenSharing = !isScreenSharing;
    await livekitRoom.localParticipant.setScreenShareEnabled(newScreenSharing, {
      resolution: ScreenSharePresets.h1080fps30.resolution,
    });
    set({ isScreenSharing: newScreenSharing });
    get().updateParticipants();
  },

  addVoiceMember: (roomId: string, userId: string) => {
    set((state) => {
      const current = state.voiceMembers[roomId] || [];
      if (current.includes(userId)) return state;
      return {
        voiceMembers: {
          ...state.voiceMembers,
          [roomId]: [...current, userId],
        },
      };
    });
  },

  removeVoiceMember: (roomId: string, userId: string) => {
    set((state) => {
      const current = state.voiceMembers[roomId] || [];
      return {
        voiceMembers: {
          ...state.voiceMembers,
          [roomId]: current.filter((id) => id !== userId),
        },
      };
    });
  },

  updateParticipants: () => {
    const { livekitRoom } = get();
    if (!livekitRoom) {
      set({ participants: [] });
      return;
    }

    const participantList: VoiceParticipant[] = [];

    const addParticipant = (p: Participant) => {
      const hasVideo = Array.from(p.trackPublications.values()).some(
        (pub_) => pub_.track?.kind === Track.Kind.Video && pub_.track?.source === Track.Source.Camera && !pub_.isMuted,
      );
      const hasScreenShare = Array.from(p.trackPublications.values()).some(
        (pub_) => pub_.track?.source === Track.Source.ScreenShare && !pub_.isMuted,
      );
      const isMuted = Array.from(p.trackPublications.values())
        .filter((pub_) => pub_.track?.kind === Track.Kind.Audio)
        .every((pub_) => pub_.isMuted);

      participantList.push({
        userId: p.identity,
        displayName: p.name || p.identity,
        isMuted: isMuted || !p.trackPublications.size,
        isSpeaking: p.audioLevel > 0.01,
        hasVideo,
        hasScreenShare,
      });
    };

    // Local participant
    addParticipant(livekitRoom.localParticipant);

    // Remote participants
    for (const p of livekitRoom.remoteParticipants.values()) {
      addParticipant(p);
    }

    set({ participants: participantList });
  },
}));

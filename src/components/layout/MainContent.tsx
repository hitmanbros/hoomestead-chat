import { useState, useMemo } from "react";
import { useRoomStore } from "../../store/roomStore";
import { useSpaceStore } from "../../store/spaceStore";
import { useUIStore } from "../../store/uiStore";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import TypingIndicator from "../chat/TypingIndicator";
import Tooltip from "../common/Tooltip";
import FriendsView from "./FriendsView";
import DiscoverView from "./DiscoverView";
import type { MessageInfo } from "../../api/commands";

export default function MainContent() {
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const rooms = useRoomStore((s) => s.rooms);
  const dmRooms = useRoomStore((s) => s.dmRooms);
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const spaces = useSpaceStore((s) => s.spaces);
  const showMemberSidebar = useUIStore((s) => s.showMemberSidebar);
  const toggleMemberSidebar = useUIStore((s) => s.toggleMemberSidebar);
  const homeView = useUIStore((s) => s.homeView);
  const [replyTo, setReplyTo] = useState<MessageInfo | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.room_id === selectedRoomId)
      || dmRooms.find((r) => r.room_id === selectedRoomId),
    [rooms, dmRooms, selectedRoomId],
  );

  const selectedSpace = spaces.find((s) => s.room_id === selectedSpaceId);

  if (!selectedRoomId) {
    // Show Friends view when at home with no room selected
    if (!selectedSpaceId && homeView === "friends") {
      return <FriendsView />;
    }
    if (!selectedSpaceId && homeView === "discover") {
      return <DiscoverView />;
    }

    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="120" height="120" viewBox="0 0 184 132" fill="none">
              <rect x="32" y="16" width="120" height="100" rx="8" fill="var(--background-modifier-accent)" opacity="0.3"/>
              <path d="M92 46c-11 0-20 9-20 20s9 20 20 20 20-9 20-20-9-20-20-20zm0 36c-8.8 0-16-7.2-16-16s7.2-16 16-16 16 7.2 16 16-7.2 16-16 16z" fill="var(--text-muted)" opacity="0.4"/>
              <circle cx="86" cy="62" r="3" fill="var(--text-muted)" opacity="0.6"/>
              <circle cx="92" cy="62" r="3" fill="var(--text-muted)" opacity="0.6"/>
              <circle cx="98" cy="62" r="3" fill="var(--text-muted)" opacity="0.6"/>
            </svg>
          </div>
          <h3 style={{ color: "var(--header-primary)", fontSize: 18, fontWeight: 600 }}>
            No Text Channels
          </h3>
          <div style={{ fontSize: 14 }}>
            {selectedSpace
              ? `Select a channel in ${selectedSpace.name} to start chatting`
              : "Select a server and channel to start chatting"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="channel-header">
        {selectedRoom?.is_direct ? (
          <span className="channel-header-hash">@</span>
        ) : (
          <span className="channel-header-hash">#</span>
        )}
        <span className="channel-header-name">
          {selectedRoom?.name || selectedRoomId}
        </span>
        {selectedRoom?.topic && (
          <>
            <div className="channel-header-divider" />
            <span className="channel-header-topic">{selectedRoom.topic}</span>
          </>
        )}

        <div className="channel-header-toolbar">
          <Tooltip text={showMemberSidebar ? "Hide Member List" : "Show Member List"} position="bottom">
            <button
              className={`toolbar-btn ${showMemberSidebar ? "active" : ""}`}
              onClick={toggleMemberSidebar}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.795 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z" />
                <path d="M20.0001 20.006H22.0001V19.006C22.0001 16.4433 20.2697 14.4415 17.5213 13.3477C19.0621 14.7263 20.0001 16.7028 20.0001 19.006V20.006Z" />
                <path d="M14.8834 11.9077C16.6657 11.5044 18.0001 9.90598 18.0001 8.00598C18.0001 6.10598 16.6657 4.50755 14.8834 4.10425C15.5586 5.20578 16.0001 6.5642 16.0001 8.00598C16.0001 9.44776 15.5586 10.8062 14.8834 11.9077Z" />
              </svg>
            </button>
          </Tooltip>

        </div>
      </div>
      <MessageList onReply={setReplyTo} />
      <TypingIndicator />
      <MessageInput
        roomId={selectedRoomId}
        channelName={selectedRoom?.name || undefined}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}

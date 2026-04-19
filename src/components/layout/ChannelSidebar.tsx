import { useEffect, useState, useMemo } from "react";
import { useSpaceStore } from "../../store/spaceStore";
import { useRoomStore } from "../../store/roomStore";
import { useMessageStore } from "../../store/messageStore";
import { useMemberStore } from "../../store/memberStore";
import { useToastStore } from "../../store/toastStore";
import ChannelItem from "../channel/ChannelItem";
import UserPanel from "../user/UserPanel";
import CreateChannel from "../channel/CreateChannel";
import AddExistingChannel from "../channel/AddExistingChannel";
import ConfirmModal from "../common/ConfirmModal";
import ContextMenu, { ContextMenuItem } from "../common/ContextMenu";
import { api } from "../../api/commands";

export default function ChannelSidebar() {
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const spaces = useSpaceStore((s) => s.spaces);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);
  const selectSpace = useSpaceStore((s) => s.selectSpace);
  const rooms = useRoomStore((s) => s.rooms);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const isLoading = useRoomStore((s) => s.isLoading);
  const fetchRooms = useRoomStore((s) => s.fetchRooms);
  const selectRoom = useRoomStore((s) => s.selectRoom);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const addToast = useToastStore((s) => s.addToast);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeavingSpace, setIsLeavingSpace] = useState(false);
  const [defaultChannelType] = useState<"text">("text");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [listContextMenu, setListContextMenu] = useState<{ x: number; y: number } | null>(null);

  const selectedSpace = spaces.find((s) => s.room_id === selectedSpaceId);

  const categories = useMemo(() => {
    const textChannels = rooms.filter((r) => r.channel_type === "text" || !r.channel_type);
    const result: { key: string; label: string; rooms: typeof rooms }[] = [];
    if (textChannels.length > 0) {
      result.push({ key: "text", label: "Text Channels", rooms: textChannels });
    } else if (rooms.length > 0) {
      result.push({ key: "text", label: "Text Channels", rooms });
    }
    return result;
  }, [rooms]);

  useEffect(() => {
    if (selectedSpaceId) {
      selectRoom(null);
      fetchRooms(selectedSpaceId).then(() => {
        // Auto-select the first room when entering a space (like Discord)
        const currentRooms = useRoomStore.getState().rooms;
        if (currentRooms.length > 0) {
          handleSelectRoom(currentRooms[0].room_id);
        }
      });
    }
  }, [selectedSpaceId]);

  const setCurrentRoom = useMessageStore((s) => s.setCurrentRoom);

  const handleSelectRoom = (roomId: string) => {
    selectRoom(roomId);
    setCurrentRoom(roomId);
    Promise.all([fetchMessages(roomId), fetchMembers(roomId)]);
  };

  const handleLeaveRoom = () => {
    if (selectedSpaceId) {
      fetchRooms(selectedSpaceId);
    }
  };

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="channel-sidebar">
      <div
        className={`channel-sidebar-header ${showServerMenu ? "active" : ""}`}
        onClick={() => setShowServerMenu(!showServerMenu)}
      >
        <h2>{selectedSpace?.name || "Server"}</h2>
        <svg
          className={`channel-sidebar-header-chevron ${showServerMenu ? "open" : ""}`}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {showServerMenu && (
        <>
          <div className="server-menu-backdrop" onClick={() => setShowServerMenu(false)} />
          <div className="server-menu">
            <div
              className="server-menu-item"
              onClick={() => {
                setShowServerMenu(false);
                setShowCreateChannel(true);
              }}
            >
              <span>Create Channel</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <div
              className="server-menu-item"
              onClick={() => {
                setShowServerMenu(false);
                setShowAddExisting(true);
              }}
            >
              <span>Add Existing Channel</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </div>
            <div className="server-menu-divider" />
            <div
              className="server-menu-item"
              onClick={() => {
                if (selectedSpaceId) {
                  navigator.clipboard.writeText(selectedSpaceId);
                  addToast("success", "Server ID copied");
                }
                setShowServerMenu(false);
              }}
            >
              <span>Copy Server ID</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            </div>
            <div className="server-menu-divider" />
            <div
              className="server-menu-item danger"
              onClick={() => {
                setShowServerMenu(false);
                setShowLeaveConfirm(true);
              }}
            >
              <span>Leave Server</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.418 13L6.708 16.71a1 1 0 001.414 1.414L12 14.242l3.878 3.882a1 1 0 001.414-1.414L13.582 13l3.71-3.71a1 1 0 00-1.414-1.413L12 11.758 8.122 7.877a1 1 0 00-1.414 1.414L10.418 13z"/>
              </svg>
            </div>
          </div>
        </>
      )}

      <div
        className="channel-list-container"
        onContextMenu={(e) => {
          // Only show if right-clicking empty space (not on a channel item)
          if ((e.target as HTMLElement).closest(".channel-item, .voice-participant")) return;
          e.preventDefault();
          e.stopPropagation();
          setListContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {isLoading && rooms.length === 0 ? (
          <div className="channel-skeleton">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton-channel">
                <div className="skeleton-icon" />
                <div className="skeleton-text" style={{ width: `${50 + i * 8}%` }} />
              </div>
            ))}
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.key}>
              <div
                className="category-header"
                onClick={() => toggleCategory(cat.key)}
              >
                <svg
                  className={`category-arrow-icon ${collapsedCategories[cat.key] ? "collapsed" : ""}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
                <span className="category-name" style={{ flex: 1 }}>{cat.label}</span>
                <span
                  className="category-add-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateChannel(true);
                  }}
                  title="Create Channel"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                  </svg>
                </span>
              </div>

              {!collapsedCategories[cat.key] && (
                cat.rooms.map((room) => (
                  <ChannelItem
                    key={room.room_id}
                    room={room}
                    isSelected={selectedRoomId === room.room_id}
                    onClick={() => handleSelectRoom(room.room_id)}
                    onLeave={handleLeaveRoom}
                  />
                ))
              )}
            </div>
          ))
        )}

        {!isLoading && rooms.length === 0 && (
          <div style={{ padding: "8px 16px", color: "var(--text-muted)", fontSize: "14px" }}>
            No channels yet
          </div>
        )}
      </div>

      {listContextMenu && (
        <ContextMenu
          x={listContextMenu.x}
          y={listContextMenu.y}
          items={[
            {
              label: "Create Channel",
              onClick: () => {
                setShowCreateChannel(true);
              },
            },
          ]}
          onClose={() => setListContextMenu(null)}
        />
      )}

      <UserPanel />

      <CreateChannel
        isOpen={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
        defaultType={defaultChannelType}
      />

      <AddExistingChannel
        isOpen={showAddExisting}
        onClose={() => setShowAddExisting(false)}
      />

      <ConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={async () => {
          if (!selectedSpaceId) return;
          setIsLeavingSpace(true);
          try {
            await api.leaveRoom(selectedSpaceId);
            addToast("success", `Left ${selectedSpace?.name || "server"}`);
            selectSpace(null);
            selectRoom(null);
            await fetchSpaces();
          } catch (e) {
            addToast("error", `Failed to leave: ${e}`);
          } finally {
            setIsLeavingSpace(false);
            setShowLeaveConfirm(false);
          }
        }}
        title="Leave Server"
        description={`Are you sure you want to leave ${selectedSpace?.name || "this server"}? You won't be able to access its channels unless you rejoin.`}
        confirmText="Leave Server"
        danger
        isLoading={isLeavingSpace}
      />
    </div>
  );
}

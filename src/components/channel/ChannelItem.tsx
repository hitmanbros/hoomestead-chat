import { useState } from "react";
import type { RoomInfo } from "../../api/commands";
import { api } from "../../api/commands";
import { useRoomStore } from "../../store/roomStore";
import { useSpaceStore } from "../../store/spaceStore";
import { useToastStore } from "../../store/toastStore";
import ContextMenu, { ContextMenuItem } from "../common/ContextMenu";
import ConfirmModal from "../common/ConfirmModal";
import Tooltip from "../common/Tooltip";

interface Props {
  room: RoomInfo;
  isSelected: boolean;
  onClick: () => void;
  onLeave?: () => void;
}

export default function ChannelItem({ room, isSelected, onClick, onLeave }: Props) {
  const hasUnread = room.unread_count > 0;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const selectRoom = useRoomStore((s) => s.selectRoom);
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const addToast = useToastStore((s) => s.addToast);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      await api.leaveRoom(room.room_id);
      selectRoom(null);
      addToast("success", `Left #${room.name || "channel"}`);
      onLeave?.();
    } catch (e) {
      addToast("error", `Failed to leave: ${e}`);
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.deleteRoom(room.room_id, selectedSpaceId || undefined);
      selectRoom(null);
      addToast("success", `Deleted #${room.name || "channel"}`);
      onLeave?.();
    } catch (e) {
      addToast("error", `Failed to delete: ${e}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: "Mark as Read",
      onClick: () => {
        api.sendReadReceipt(room.room_id, "").catch(() => {});
        addToast("success", "Marked as read");
      },
    },
    { label: "", onClick: () => {}, divider: true },
    {
      label: "Copy Channel ID",
      onClick: () => {
        navigator.clipboard.writeText(room.room_id);
        addToast("success", "Channel ID copied");
      },
    },
    { label: "", onClick: () => {}, divider: true },
    {
      label: "Leave Channel",
      onClick: () => setShowLeaveConfirm(true),
      danger: true,
    },
    {
      label: "Delete Channel",
      onClick: () => setShowDeleteConfirm(true),
      danger: true,
    },
  ];

  return (
    <>
      <div className="channel-item-row">
        {hasUnread && !isSelected && <div className="channel-unread-dot" />}
        <Tooltip text={room.topic || room.name || room.room_id} position="right">
          <div
            className={`channel-item ${isSelected ? "selected" : ""} ${hasUnread ? "unread" : ""}`}
            onClick={onClick}
            onContextMenu={handleContextMenu}
          >
            <span className="channel-icon">
              {room.channel_type === "voice" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904ZM14 9.00304V15.003C15.654 15.003 17 13.657 17 12.003C17 10.349 15.654 9.00304 14 9.00304Z"/>
                </svg>
              ) : (
                "#"
              )}
            </span>
            <span className="channel-name">{room.name || room.room_id}</span>
            <div className="channel-item-actions">
              <button
                className="channel-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(room.room_id);
                  addToast("success", "Invite link copied");
                }}
                title="Create Invite"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.025 5v13.988h-2V8.442l-7.07 7.07-1.414-1.413L17.584 7H12V5h9.025zM5 21V3h2v18H5z"/>
                </svg>
              </button>
              <button
                className="channel-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e);
                }}
                title="Edit Channel"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/>
                </svg>
              </button>
            </div>
            {hasUnread && !isSelected && (
              <span className="unread-badge">
                {room.unread_count > 99 ? "99+" : room.unread_count}
              </span>
            )}
          </div>
        </Tooltip>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeave}
        title="Leave Channel"
        description={`Are you sure you want to leave #${room.name || "this channel"}? You won't be able to see messages unless you rejoin.`}
        confirmText="Leave Channel"
        danger
        isLoading={isLeaving}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Channel"
        description={`Are you sure you want to delete #${room.name || "this channel"}? This will kick all members and cannot be undone.`}
        confirmText="Delete Channel"
        danger
        isLoading={isDeleting}
      />
    </>
  );
}

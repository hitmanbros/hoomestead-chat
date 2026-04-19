import { useState, memo, useMemo } from "react";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import type { MessageInfo } from "../../api/commands";
import { useMessageStore, Reaction } from "../../store/messageStore";
import { useRoomStore } from "../../store/roomStore";
import { useAuthStore } from "../../store/authStore";
import { api } from "../../api/commands";
import ContextMenu, { ContextMenuItem } from "../common/ContextMenu";
import ConfirmModal from "../common/ConfirmModal";
import { useToastStore } from "../../store/toastStore";
import { getUserColor, getDisplayName } from "../../utils/userColors";

interface Props {
  message: MessageInfo;
  showHeader: boolean;
  onReply?: (message: MessageInfo) => void;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"];
const EMPTY_REACTIONS: Reaction[] = [];

function getNameColor(sender: string): string {
  return getUserColor(sender);
}

export default memo(function Message({ message, showHeader, onReply }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const reactions = useMessageStore((s) => s.reactions[message.event_id] ?? EMPTY_REACTIONS);
  const messages = useMessageStore((s) => s.messages);
  const removeMessage = useMessageStore((s) => s.removeMessage);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const currentUserId = useAuthStore((s) => s.user?.user_id);
  const addToast = useToastStore((s) => s.addToast);
  const isOwnMessage = message.sender === currentUserId;

  // Find replied-to message
  const repliedMessage = useMemo(() => {
    if (!message.reply_to) return null;
    return messages.find((m) => m.event_id === message.reply_to) || null;
  }, [message.reply_to, messages]);

  const displayName = getDisplayName(message.sender, message.sender_display_name);
  const initial = displayName[0]?.toUpperCase() || "?";
  const time = new Date(message.timestamp * 1000);
  const nameColor = getNameColor(message.sender);

  // Group reactions by emoji key
  const reactionGroups = useMemo(() => {
    const groups: Record<string, { count: number; senders: string[]; myEventId?: string }> = {};
    for (const r of reactions) {
      if (!groups[r.key]) {
        groups[r.key] = { count: 0, senders: [] };
      }
      groups[r.key].count++;
      groups[r.key].senders.push(r.sender);
      if (r.sender === currentUserId) {
        groups[r.key].myEventId = r.eventId;
      }
    }
    return groups;
  }, [reactions, currentUserId]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleReact = async (emoji: string) => {
    if (!selectedRoomId) return;
    setShowEmojiPicker(false);
    try {
      await api.sendReaction(selectedRoomId, message.event_id, emoji);
    } catch (e) {
      console.error("Failed to send reaction:", e);
    }
  };

  const handleToggleReaction = async (key: string) => {
    if (!selectedRoomId) return;
    const group = reactionGroups[key];
    if (group?.myEventId) {
      // Remove my reaction
      try {
        await api.redactEvent(selectedRoomId, group.myEventId);
      } catch (e) {
        console.error("Failed to remove reaction:", e);
      }
    } else {
      await handleReact(key);
    }
  };

  const handleDelete = async () => {
    if (!selectedRoomId) return;
    setIsDeleting(true);
    try {
      await api.redactEvent(selectedRoomId, message.event_id, "Deleted by user");
      removeMessage(selectedRoomId, message.event_id);
      addToast("success", "Message deleted");
    } catch (e) {
      addToast("error", `Failed to delete: ${e}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const contextMenuItems: ContextMenuItem[] = [
    { label: "Reply", onClick: () => onReply?.(message) },
    { label: "React", onClick: () => setShowEmojiPicker(true) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Copy Text", onClick: () => navigator.clipboard.writeText(message.body) },
    { label: "Copy Message ID", onClick: () => navigator.clipboard.writeText(message.event_id) },
    ...(isOwnMessage
      ? [
          { divider: true, label: "", onClick: () => {} } as ContextMenuItem,
          {
            label: "Delete Message",
            onClick: () => setShowDeleteConfirm(true),
            danger: true,
          } as ContextMenuItem,
        ]
      : []),
  ];

  return (
    <>
      {/* Reply preview bar */}
      {repliedMessage && (
        <div className="message-reply-bar">
          <div
            className="reply-preview-avatar"
            style={{ backgroundColor: getNameColor(repliedMessage.sender) }}
          >
            {getDisplayName(repliedMessage.sender, repliedMessage.sender_display_name)[0]?.toUpperCase()}
          </div>
          <span
            className="reply-preview-name"
            style={{ color: getNameColor(repliedMessage.sender) }}
          >
            {getDisplayName(repliedMessage.sender, repliedMessage.sender_display_name)}
          </span>
          <span className="reply-preview-text">
            {repliedMessage.body.length > 80
              ? repliedMessage.body.slice(0, 80) + "..."
              : repliedMessage.body}
          </span>
        </div>
      )}
      {!repliedMessage && message.reply_to && (
        <div className="message-reply-bar">
          <span className="reply-preview-text" style={{ fontStyle: "italic" }}>
            Original message was deleted
          </span>
        </div>
      )}

      <div
        className={`message ${showHeader ? "with-header" : ""} ${message.reply_to ? "is-reply" : ""}`}
        onContextMenu={handleContextMenu}
      >
        {showHeader ? (
          <div className="message-avatar" style={{ backgroundColor: nameColor }}>
            {initial}
          </div>
        ) : (
          <div className="message-avatar-spacer">
            <span className="message-timestamp-inline">
              {format(time, "HH:mm")}
            </span>
          </div>
        )}

        <div className="message-content-wrapper">
          {showHeader && (
            <div className="message-header">
              <span className="message-author" style={{ color: nameColor }}>
                {displayName}
              </span>
              <span className="message-timestamp">
                {format(time, "MM/dd/yyyy h:mm a")}
              </span>
            </div>
          )}

          {message.msg_type === "image" && message.media_url && (
            <img
              className="message-image"
              src={message.media_url}
              alt={message.body}
            />
          )}

          {message.formatted_body ? (
            <div
              className="message-body"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(message.formatted_body),
              }}
            />
          ) : (
            <div className="message-body">{message.body}</div>
          )}

          {/* Reaction display */}
          {Object.keys(reactionGroups).length > 0 && (
            <div className="message-reactions">
              {Object.entries(reactionGroups).map(([key, group]) => (
                <button
                  key={key}
                  className={`reaction-chip ${group.myEventId ? "reacted" : ""}`}
                  onClick={() => handleToggleReaction(key)}
                  title={group.senders.map((s) => getDisplayName(s)).join(", ")}
                >
                  <span className="reaction-emoji">{key}</span>
                  <span className="reaction-count">{group.count}</span>
                </button>
              ))}
              <button
                className="reaction-chip add-reaction"
                onClick={() => setShowEmojiPicker(true)}
              >
                +
              </button>
            </div>
          )}

          {/* Quick emoji picker */}
          {showEmojiPicker && (
            <div className="emoji-picker">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  className="emoji-picker-item"
                  onClick={() => handleReact(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hover action bar */}
        <div className="message-actions">
          <button
            className="message-action-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Add Reaction"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM12 20C7.589 20 4 16.411 4 12C4 7.589 7.589 4 12 4C16.411 4 20 7.589 20 12C20 16.411 16.411 20 12 20Z"/>
              <path d="M14.5 11C15.33 11 16 10.33 16 9.5C16 8.67 15.33 8 14.5 8C13.67 8 13 8.67 13 9.5C13 10.33 13.67 11 14.5 11Z"/>
              <path d="M9.5 11C10.33 11 11 10.33 11 9.5C11 8.67 10.33 8 9.5 8C8.67 8 8 8.67 8 9.5C8 10.33 8.67 11 9.5 11Z"/>
              <path d="M12 17.5C14.33 17.5 16.32 16.04 17.18 14H6.82C7.68 16.04 9.67 17.5 12 17.5Z"/>
            </svg>
          </button>
          <button
            className="message-action-btn"
            onClick={() => onReply?.(message)}
            title="Reply"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 8.26667V4L3 11.4667L10 18.9333V14.56C15 14.56 18.5 16.2667 21 20C20 14.6667 17 9.33333 10 8.26667Z"/>
            </svg>
          </button>
          <button
            className="message-action-btn"
            onClick={handleContextMenu as any}
            title="More"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 12.001C7 10.8964 6.10457 10.001 5 10.001C3.89543 10.001 3 10.8964 3 12.001C3 13.1055 3.89543 14.001 5 14.001C6.10457 14.001 7 13.1055 7 12.001Z"/>
              <path d="M14 12.001C14 10.8964 13.1046 10.001 12 10.001C10.8954 10.001 10 10.8964 10 12.001C10 13.1055 10.8954 14.001 12 14.001C13.1046 14.001 14 13.1055 14 12.001Z"/>
              <path d="M21 12.001C21 10.8964 20.1046 10.001 19 10.001C17.8954 10.001 17 10.8964 17 12.001C17 13.1055 17.8954 14.001 19 14.001C20.1046 14.001 21 13.1055 21 12.001Z"/>
            </svg>
          </button>
        </div>
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
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Message"
        description="Are you sure you want to delete this message? This cannot be undone."
        confirmText="Delete"
        danger
        isLoading={isDeleting}
      />
    </>
  );
});

import { useState, useRef, useEffect } from "react";
import { useMessageStore } from "../../store/messageStore";
import { api, MessageInfo } from "../../api/commands";

const QUICK_EMOJIS = ["😀", "😂", "❤️", "👍", "👎", "🔥", "🎉", "😢", "😮", "👀", "💀", "🤔", "😭", "🥺", "✨", "💯"];

interface Props {
  roomId: string;
  channelName?: string;
  replyTo: MessageInfo | null;
  onCancelReply: () => void;
}

export default function MessageInput({ roomId, channelName, replyTo, onCancelReply }: Props) {
  const [value, setValue] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const sendMessage = useMessageStore((s) => s.sendMessage);
  const typingTimeout = useRef<number | null>(null);
  const isTyping = useRef(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    return () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
      api.sendTyping(roomId, false).catch(() => {});
    };
  }, [roomId]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojiPicker]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      if (showEmojiPicker) {
        setShowEmojiPicker(false);
      } else if (replyTo) {
        onCancelReply();
      }
    }
  };

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue("");
    try {
      await sendMessage(roomId, trimmed, replyTo?.event_id);
    } catch (e) {
      console.error("Failed to send message:", e);
    }
    onCancelReply();
    isTyping.current = false;
    api.sendTyping(roomId, false).catch(() => {});

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (!isTyping.current) {
      isTyping.current = true;
      api.sendTyping(roomId, true).catch(() => {});
    }
    typingTimeout.current = window.setTimeout(() => {
      isTyping.current = false;
      api.sendTyping(roomId, false).catch(() => {});
    }, 4000);

    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await api.uploadFile(roomId, file);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const insertEmoji = (emoji: string) => {
    setValue((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const senderName = replyTo
    ? replyTo.sender_display_name || (() => {
        const s = replyTo.sender;
        const ci = s.indexOf(":");
        if (ci > 1 && s.startsWith("@")) return s.slice(1, ci);
        return s.startsWith("@") ? s.slice(1) : s;
      })()
    : "";

  const placeholder = channelName ? `Message #${channelName}` : "Message #channel";

  return (
    <div className="message-input-container">
      {replyTo && (
        <div className="reply-bar">
          <span>
            Replying to <strong>{senderName}</strong>
          </span>
          <button className="reply-bar-close" onClick={onCancelReply} aria-label="Cancel reply">
            &times;
          </button>
        </div>
      )}
      <div className="message-input-wrapper">
        <button
          className="message-input-upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title="Upload a file"
        >
          {isUploading ? (
            <span className="upload-spinner" />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.00098C6.486 2.00098 2 6.48698 2 12.001C2 17.515 6.486 22.001 12 22.001C17.514 22.001 22 17.515 22 12.001C22 6.48698 17.514 2.00098 12 2.00098ZM17 13.001H13V17.001H11V13.001H7V11.001H11V7.00098H13V11.001H17V13.001Z"/>
            </svg>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        <textarea
          ref={textareaRef}
          className="message-input"
          placeholder={placeholder}
          aria-label="Message input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <div className="message-input-buttons" ref={emojiPickerRef}>
          <button
            className={`message-input-icon-btn ${showEmojiPicker ? "active" : ""}`}
            title="Emoji"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.486 2 2 6.486 2 12C2 17.515 6.486 22 12 22C17.514 22 22 17.515 22 12C22 6.486 17.514 2 12 2ZM12 20C7.589 20 4 16.411 4 12C4 7.589 7.589 4 12 4C16.411 4 20 7.589 20 12C20 16.411 16.411 20 12 20Z"/>
              <path d="M14.5 11C15.33 11 16 10.33 16 9.5C16 8.67 15.33 8 14.5 8C13.67 8 13 8.67 13 9.5C13 10.33 13.67 11 14.5 11Z"/>
              <path d="M9.5 11C10.33 11 11 10.33 11 9.5C11 8.67 10.33 8 9.5 8C8.67 8 8 8.67 8 9.5C8 10.33 8.67 11 9.5 11Z"/>
              <path d="M12 17.5C14.33 17.5 16.32 16.04 17.18 14H6.82C7.68 16.04 9.67 17.5 12 17.5Z"/>
            </svg>
          </button>
          {showEmojiPicker && (
            <div className="input-emoji-picker">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  className="emoji-picker-item"
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

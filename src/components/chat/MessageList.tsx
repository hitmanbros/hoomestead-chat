import { useEffect, useRef, useCallback } from "react";
import { useMessageStore } from "../../store/messageStore";
import { useRoomStore } from "../../store/roomStore";
import { api } from "../../api/commands";
import Message from "./Message";
import DateDivider from "./DateDivider";
import { isSameDay } from "date-fns";
import type { MessageInfo } from "../../api/commands";

interface Props {
  onReply?: (message: MessageInfo) => void;
}

function MessageSkeleton() {
  return (
    <div className="message-skeleton">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="skeleton-message-row">
          <div className="skeleton-avatar" />
          <div className="skeleton-message-content">
            <div className="skeleton-author" style={{ width: `${60 + (i * 13) % 40}px` }} />
            <div className="skeleton-line" style={{ width: `${40 + (i * 37) % 55}%` }} />
            {i % 2 === 0 && (
              <div className="skeleton-line" style={{ width: `${25 + (i * 23) % 45}%` }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChannelWelcome({ channelName }: { channelName: string }) {
  return (
    <div className="channel-welcome">
      <div className="channel-welcome-icon">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="var(--text-muted)" opacity="0.6">
          <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41001 15H15.41L16.47 9H10.47L9.41001 15Z"/>
        </svg>
      </div>
      <h1 className="channel-welcome-title">Welcome to #{channelName}</h1>
      <p className="channel-welcome-desc">
        This is the start of the #{channelName} channel.
      </p>
    </div>
  );
}

export default function MessageList({ onReply }: Props) {
  const messages = useMessageStore((s) => s.messages);
  const isLoading = useMessageStore((s) => s.isLoading);
  const isLoadingOlder = useMessageStore((s) => s.isLoadingOlder);
  const fetchOlderMessages = useMessageStore((s) => s.fetchOlderMessages);
  const paginationByRoom = useMessageStore((s) => s.paginationByRoom);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const rooms = useRoomStore((s) => s.rooms);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastReceiptRef = useRef<string | null>(null);
  const wasAtBottom = useRef(true);
  const prevMessageCount = useRef(0);
  const prevScrollHeight = useRef(0);

  const selectedRoom = rooms.find((r) => r.room_id === selectedRoomId);
  const pagination = selectedRoomId ? paginationByRoom[selectedRoomId] : null;
  const hasMore = pagination?.hasMore ?? false;

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleScroll = useCallback(() => {
    wasAtBottom.current = isNearBottom();

    // Load older messages when scrolled to top
    const el = containerRef.current;
    if (el && el.scrollTop < 200 && selectedRoomId && hasMore && !isLoadingOlder) {
      prevScrollHeight.current = el.scrollHeight;
      fetchOlderMessages(selectedRoomId);
    }
  }, [isNearBottom, selectedRoomId, hasMore, isLoadingOlder, fetchOlderMessages]);

  // Maintain scroll position when older messages are prepended
  useEffect(() => {
    const el = containerRef.current;
    if (el && prevScrollHeight.current > 0 && messages.length > prevMessageCount.current) {
      const newScrollHeight = el.scrollHeight;
      const diff = newScrollHeight - prevScrollHeight.current;
      if (diff > 0 && el.scrollTop < 200) {
        el.scrollTop += diff;
      }
      prevScrollHeight.current = 0;
    }
  }, [messages.length]);

  // Auto-scroll: only if user was already at bottom, or it's a fresh room load
  useEffect(() => {
    const isFreshLoad = prevMessageCount.current === 0 && messages.length > 0;
    if (isFreshLoad || wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: isFreshLoad ? "auto" : "smooth" });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Reset scroll tracking when room changes
  useEffect(() => {
    wasAtBottom.current = true;
    prevMessageCount.current = 0;
    prevScrollHeight.current = 0;
  }, [selectedRoomId]);

  // Send read receipt for last message
  useEffect(() => {
    if (!selectedRoomId || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.event_id !== lastReceiptRef.current) {
      lastReceiptRef.current = lastMsg.event_id;
      api.sendReadReceipt(selectedRoomId, lastMsg.event_id).catch(() => {});
    }
  }, [messages.length, selectedRoomId]);

  if (isLoading) {
    return (
      <div className="message-list-container">
        <MessageSkeleton />
      </div>
    );
  }

  return (
    <div
      className="message-list-container"
      ref={containerRef}
      onScroll={handleScroll}
    >
      <div className="message-list">
        {!hasMore && selectedRoom && (
          <ChannelWelcome channelName={selectedRoom.name || "channel"} />
        )}
        {isLoadingOlder && (
          <div className="loading-older">
            <MessageSkeleton />
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const showDate =
            !prev ||
            !isSameDay(
              new Date(msg.timestamp * 1000),
              new Date(prev.timestamp * 1000),
            );
          const showHeader =
            !prev ||
            prev.sender !== msg.sender ||
            msg.timestamp - prev.timestamp > 420 ||
            showDate;

          return (
            <div key={msg.event_id}>
              {showDate && (
                <DateDivider date={new Date(msg.timestamp * 1000)} />
              )}
              <Message
                message={msg}
                showHeader={showHeader}
                onReply={onReply}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

import { useSpaceStore } from "../../store/spaceStore";
import { useRoomStore } from "../../store/roomStore";
import { useUIStore } from "../../store/uiStore";
import ServerIcon from "../server/ServerIcon";

export default function MobileBottomNav() {
  const spaces = useSpaceStore((s) => s.spaces);
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const selectSpace = useSpaceStore((s) => s.selectSpace);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const setShowMemberSidebar = useUIStore((s) => s.setShowMemberSidebar);
  const showMemberSidebar = useUIStore((s) => s.showMemberSidebar);
  const setMobileView = useUIStore((s) => s.setMobileView);
  const mobileView = useUIStore((s) => s.mobileView);

  return (
    <nav className="mobile-bottom-nav">
      <button
        className={`mobile-nav-btn ${mobileView === "servers" ? "active" : ""}`}
        onClick={() => setMobileView("servers")}
        aria-label="Servers"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        <span>Servers</span>
      </button>

      <button
        className={`mobile-nav-btn ${mobileView === "channels" ? "active" : ""}`}
        onClick={() => setMobileView("channels")}
        aria-label="Channels"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
        </svg>
        <span>Channels</span>
      </button>

      <button
        className={`mobile-nav-btn ${mobileView === "chat" ? "active" : ""}`}
        onClick={() => setMobileView("chat")}
        aria-label="Chat"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <span>Chat</span>
      </button>

      <button
        className={`mobile-nav-btn ${showMemberSidebar ? "active" : ""}`}
        onClick={() => {
          setShowMemberSidebar(!showMemberSidebar);
          setMobileView("chat");
        }}
        aria-label="Members"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
        </svg>
        <span>Members</span>
      </button>

      <button
        className={`mobile-nav-btn ${mobileView === "settings" ? "active" : ""}`}
        onClick={() => setMobileView("settings")}
        aria-label="Settings"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.16 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
        <span>Settings</span>
      </button>
    </nav>
  );
}

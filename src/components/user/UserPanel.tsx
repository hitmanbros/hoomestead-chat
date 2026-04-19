import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import Tooltip from "../common/Tooltip";
import { getUserColor } from "../../utils/userColors";

export default function UserPanel() {
  const user = useAuthStore((s) => s.user);
  const openSettings = useUIStore((s) => s.openSettings);
  if (!user) return null;

  const displayName = user.display_name || user.user_id;
  const initial = displayName[0]?.toUpperCase() || "?";

  return (
    <div className="user-panel">
      <div
        className="user-panel-avatar"
        onClick={() => openSettings("profile")}
        style={{ cursor: "pointer", background: getUserColor(user.user_id) }}
        title="User Settings"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          initial
        )}
        <div className="presence-dot online" />
      </div>
      <div className="user-panel-info">
        <div className="user-panel-name">{displayName}</div>
        <div className="user-panel-status">Online</div>
      </div>
      <div className="user-panel-buttons">
        <Tooltip text="User Settings" position="top">
          <button
            className="user-panel-btn"
            onClick={() => openSettings("profile")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/>
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

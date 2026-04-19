import { useState, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { useMessageStore } from "../../store/messageStore";
import { useToastStore } from "../../store/toastStore";
import { api } from "../../api/commands";
import { getUserColor } from "../../utils/userColors";

export default function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const recoverEncryption = useAuthStore((s) => s.recoverEncryption);
  const updateAvatarUrl = useAuthStore((s) => s.updateAvatarUrl);
  const clearMessageCache = useMessageStore((s) => s.clearCache);
  const addToast = useToastStore((s) => s.addToast);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const displayName = user.display_name || user.user_id;
  const initial = displayName[0]?.toUpperCase() || "?";
  const color = getUserColor(user.user_id);

  const handleRecover = async () => {
    if (!recoveryKey.trim()) return;
    setIsRecovering(true);
    setRecoveryStatus(null);
    try {
      const result = await recoverEncryption(recoveryKey.trim());
      setRecoveryStatus(result);
      setRecoveryKey("");
      // Clear message cache so encrypted messages get re-fetched with recovered keys
      clearMessageCache();
    } catch (e) {
      setRecoveryStatus(`Error: ${e}`);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleAvatarUpload = () => avatarInputRef.current?.click();

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const httpUrl = await api.setAvatar(file);
      updateAvatarUrl(httpUrl);
      addToast("success", "Avatar updated!");
    } catch (err) {
      addToast("error", `Failed to set avatar: ${err}`);
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  return (
    <div className="settings-page">
      <h2 className="settings-page-title">My Account</h2>

      <div className="settings-card">
        <div className="settings-card-banner" style={{ background: color }} />
        <div className="settings-card-body">
          <div className="settings-card-avatar-row">
            <div
              className="settings-card-avatar"
              onClick={handleAvatarUpload}
              style={{ background: color, cursor: "pointer" }}
              title="Click to change avatar"
            >
              {isUploadingAvatar ? (
                <span style={{ fontSize: 14 }}>...</span>
              ) : user.avatar_url ? (
                <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 32, fontWeight: 600 }}>{initial}</span>
              )}
              <div className="settings-card-avatar-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                </svg>
              </div>
            </div>
            <div className="settings-card-info">
              <div className="settings-card-name">{displayName}</div>
              <div className="settings-card-id">{user.user_id}</div>
            </div>
          </div>

          <div className="settings-card-fields">
            <div className="settings-card-field">
              <div className="settings-card-field-label">DISPLAY NAME</div>
              <div className="settings-card-field-value">{user.display_name || "Not set"}</div>
            </div>
            <div className="settings-card-field">
              <div className="settings-card-field-label">USER ID</div>
              <div className="settings-card-field-value">{user.user_id}</div>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp"
        style={{ display: "none" }}
        onChange={handleAvatarFileChange}
      />

      <h2 className="settings-page-title" style={{ marginTop: 32 }}>Encryption Recovery</h2>
      <p className="settings-description">
        Enter your recovery key to restore access to encrypted message history.
      </p>
      <div className="settings-recovery-row">
        <input
          type="text"
          placeholder="Recovery key (e.g., EsTc 4jLc ...)"
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value)}
          className="settings-text-input"
        />
        <button
          className="settings-btn primary"
          onClick={handleRecover}
          disabled={isRecovering || !recoveryKey.trim()}
        >
          {isRecovering ? "Recovering..." : "Recover Keys"}
        </button>
      </div>
      {recoveryStatus && (
        <div className={`settings-notice ${recoveryStatus.startsWith("Error") ? "error" : "success"}`}>
          {recoveryStatus}
        </div>
      )}
    </div>
  );
}

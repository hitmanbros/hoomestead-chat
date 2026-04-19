import { useState } from "react";
import type { MemberInfo } from "../../api/commands";
import { api } from "../../api/commands";
import { useAuthStore } from "../../store/authStore";
import { useMemberStore } from "../../store/memberStore";
import { useRoomStore } from "../../store/roomStore";
import { useToastStore } from "../../store/toastStore";
import ConfirmModal from "../common/ConfirmModal";
import { getUserColor } from "../../utils/userColors";

function getColor(userId: string): string {
  return getUserColor(userId);
}

function getRoleLabel(member: MemberInfo): string | null {
  if (member.is_server_admin) return "Server Admin";
  if (member.power_level >= 100) return "Admin";
  if (member.power_level >= 50) return "Moderator";
  return null;
}

function getRoleBadgeClass(label: string): string {
  if (label === "Server Admin") return "profile-role-tag server-admin";
  if (label === "Admin") return "profile-role-tag admin";
  if (label === "Moderator") return "profile-role-tag moderator";
  return "profile-role-tag";
}

interface Props {
  member: MemberInfo;
  isOpen: boolean;
  onClose: () => void;
}

export default function MemberProfile({ member, isOpen, onClose }: Props) {
  const [confirmAction, setConfirmAction] = useState<"kick" | "ban" | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [showPromoteMenu, setShowPromoteMenu] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const currentUserId = useAuthStore((s) => s.user?.user_id);
  const members = useMemberStore((s) => s.members);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);

  if (!isOpen) return null;

  const myMember = members.find((m) => m.user_id === currentUserId);
  const myPowerLevel = myMember?.power_level ?? 0;
  const amIServerAdmin = myMember?.is_server_admin ?? false;
  const isSelf = member.user_id === currentUserId;

  const displayName = member.display_name || (() => {
    const s = member.user_id;
    const ci = s.indexOf(":");
    if (ci > 1 && s.startsWith("@")) return s.slice(1, ci);
    return s.startsWith("@") ? s.slice(1) : s;
  })();
  const initial = displayName[0]?.toUpperCase() || "?";
  const color = getColor(member.user_id);
  const roleLabel = getRoleLabel(member);

  // Permission checks:
  // - Server admins can manage anyone (Synapse admin API overrides room permissions)
  // - Room admins/mods need strictly higher power level (Matrix spec)
  const canKick = !isSelf && (
    (amIServerAdmin && !member.is_server_admin) ||
    (myPowerLevel > member.power_level && myPowerLevel >= 50)
  );
  const canBan = !isSelf && (
    (amIServerAdmin && !member.is_server_admin) ||
    (myPowerLevel > member.power_level && myPowerLevel >= 100)
  );
  const canPromote = !isSelf && (
    (amIServerAdmin && !member.is_server_admin) ||
    (myPowerLevel > member.power_level && myPowerLevel >= 100)
  );

  const handleKick = async () => {
    if (!selectedRoomId) return;
    setIsActioning(true);
    try {
      await api.kickMember(selectedRoomId, member.user_id, "Kicked by admin");
      addToast("success", `Kicked ${displayName}`);
      fetchMembers(selectedRoomId);
      onClose();
    } catch (e) {
      addToast("error", `Failed to kick: ${e}`);
    } finally {
      setIsActioning(false);
      setConfirmAction(null);
    }
  };

  const handleBan = async () => {
    if (!selectedRoomId) return;
    setIsActioning(true);
    try {
      await api.banMember(selectedRoomId, member.user_id, "Banned by admin");
      addToast("success", `Banned ${displayName}`);
      fetchMembers(selectedRoomId);
      onClose();
    } catch (e) {
      addToast("error", `Failed to ban: ${e}`);
    } finally {
      setIsActioning(false);
      setConfirmAction(null);
    }
  };

  const handleSetRole = async (powerLevel: number, roleName: string) => {
    if (!selectedRoomId) return;
    setShowPromoteMenu(false);
    try {
      await api.setPowerLevel(selectedRoomId, member.user_id, powerLevel);
      addToast("success", `Set ${displayName} to ${roleName}`);
      fetchMembers(selectedRoomId);
    } catch (e) {
      addToast("error", `Failed to set role: ${e}`);
    }
  };

  const roleOptions = [
    { label: "Admin", level: 100, description: "Can manage channels, kick and ban members" },
    { label: "Moderator", level: 50, description: "Can kick members and manage messages" },
    { label: "Member", level: 0, description: "Default permissions" },
  ];

  return (
    <>
      <div className="modal-overlay" onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}>
        <div className="profile-popup" onClick={(e) => e.stopPropagation()}>
          {/* Banner */}
          <div className="profile-banner" style={{ backgroundColor: color }} />

          {/* Avatar */}
          <div className="profile-avatar-section">
            <div className="profile-avatar" style={{ backgroundColor: color }}>
              {member.avatar_url ? (
                <img src={member.avatar_url} alt="" />
              ) : (
                initial
              )}
              <div className={`profile-presence-dot ${member.presence}`} />
            </div>
          </div>

          {/* Info */}
          <div className="profile-body">
            <div className="profile-name-section">
              <h3 className="profile-display-name" style={{ color }}>
                {displayName}
              </h3>
              <span className="profile-user-id">{member.user_id}</span>
            </div>

            <div className="profile-divider" />

            {/* Roles section */}
            <div className="profile-section">
              <h4 className="profile-section-title">Roles</h4>
              <div className="profile-roles">
                {roleLabel ? (
                  <span className={getRoleBadgeClass(roleLabel)}>
                    {roleLabel === "Server Admin" && (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4 }}>
                        <path d="M13.6572 5.42868L13.8936 5.0985C14.2615 4.56373 13.5982 3.90035 13.0635 4.26836L12.7333 4.50468L12.3962 4.26836C11.8615 3.90035 11.1982 4.56373 11.5661 5.0985L11.8025 5.42868L11.4299 5.56139C10.8445 5.77447 10.8445 6.60111 11.4299 6.81419L11.8025 6.9469L11.5661 7.27708C11.1982 7.81185 11.8615 8.47523 12.3962 8.10722L12.7333 7.8709L13.0635 8.10722C13.5982 8.47523 14.2615 7.81185 13.8936 7.27708L13.6572 6.9469L14.0298 6.81419C14.6152 6.60111 14.6152 5.77447 14.0298 5.56139L13.6572 5.42868Z"/>
                        <path d="M7.59706 8.09052L8.0602 7.35869C8.55498 6.57511 7.54843 5.65422 6.76485 6.14899L6.33333 6.42135L5.90182 6.14899C5.11824 5.65422 4.11169 6.57511 4.60647 7.35869L4.93961 7.89052L4.0602 8.09052C3.19116 8.29052 3.19116 9.52173 4.0602 9.72173L4.93961 9.92173L4.60647 10.4536C4.11169 11.2371 5.11824 12.158 5.90182 11.6633L6.33333 11.3909L6.76485 11.6633C7.54843 12.158 8.55498 11.2371 8.0602 10.4536L7.72706 9.92173L8.60647 9.72173C9.47551 9.52173 9.47551 8.29052 8.60647 8.09052L7.59706 8.09052Z"/>
                      </svg>
                    )}
                    {roleLabel === "Moderator" && (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4 }}>
                        <path d="M8 1L2 4v4c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V4L8 1zm0 2l4 2v3c0 2.6-1.9 5-4 5.6C5.9 13 4 10.6 4 8V5l4-2z"/>
                      </svg>
                    )}
                    {roleLabel}
                  </span>
                ) : (
                  <span className="profile-role-tag member">Member</span>
                )}
                <span className="profile-power-level">Power Level: {member.power_level}</span>
              </div>
            </div>

            <div className="profile-divider" />

            {/* Member since / presence */}
            <div className="profile-section">
              <h4 className="profile-section-title">Status</h4>
              <div className="profile-status">
                <div className={`profile-status-dot ${member.presence}`} />
                <span>{member.presence.charAt(0).toUpperCase() + member.presence.slice(1)}</span>
              </div>
            </div>

            {/* Admin controls */}
            {(canPromote || canKick || canBan) && (
              <>
                <div className="profile-divider" />
                <div className="profile-section">
                  <h4 className="profile-section-title">Admin Actions</h4>
                  <div className="profile-admin-actions">
                    {canPromote && (
                      <div className="profile-action-group">
                        <button
                          className="profile-action-btn"
                          onClick={() => setShowPromoteMenu(!showPromoteMenu)}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1L2 4v4c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V4L8 1zm0 2l4 2v3c0 2.6-1.9 5-4 5.6C5.9 13 4 10.6 4 8V5l4-2z"/>
                          </svg>
                          Change Role
                        </button>
                        {showPromoteMenu && (
                          <div className="profile-role-dropdown">
                            {roleOptions.map((opt) => (
                              <button
                                key={opt.level}
                                className={`profile-role-option ${member.power_level === opt.level ? "active" : ""}`}
                                onClick={() => handleSetRole(opt.level, opt.label)}
                                disabled={member.power_level === opt.level}
                              >
                                <div className="profile-role-option-name">{opt.label}</div>
                                <div className="profile-role-option-desc">{opt.description}</div>
                                {member.power_level === opt.level && (
                                  <span className="profile-role-current">Current</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {canKick && (
                      <button
                        className="profile-action-btn danger"
                        onClick={() => setConfirmAction("kick")}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M15 3H9v2H3v2h18V5h-6V3zm-1 7a1 1 0 00-1 1v7a1 1 0 002 0v-7a1 1 0 00-1-1zm-4 0a1 1 0 00-1 1v7a1 1 0 002 0v-7a1 1 0 00-1-1zm7-1H5l1.5 12.5A2 2 0 008.49 23h7.02a2 2 0 001.99-1.5L19 9z"/>
                        </svg>
                        Kick
                      </button>
                    )}
                    {canBan && (
                      <button
                        className="profile-action-btn danger"
                        onClick={() => setConfirmAction("ban")}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.902 7.902 0 0112 20zm6.31-3.1L7.1 5.69A7.902 7.902 0 0112 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
                        </svg>
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmAction === "kick"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleKick}
        title={`Kick ${displayName}`}
        description={`Are you sure you want to kick ${displayName} from this channel? They can rejoin if they have an invite.`}
        confirmText="Kick"
        danger
        isLoading={isActioning}
      />

      <ConfirmModal
        isOpen={confirmAction === "ban"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleBan}
        title={`Ban ${displayName}`}
        description={`Are you sure you want to ban ${displayName}? They will not be able to rejoin this channel.`}
        confirmText="Ban"
        danger
        isLoading={isActioning}
      />
    </>
  );
}

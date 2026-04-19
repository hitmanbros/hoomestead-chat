import { useState } from "react";
import type { MemberInfo } from "../../api/commands";
import { api } from "../../api/commands";
import { useAuthStore } from "../../store/authStore";
import { useMemberStore } from "../../store/memberStore";
import { useRoomStore } from "../../store/roomStore";
import ContextMenu, { ContextMenuItem } from "../common/ContextMenu";
import ConfirmModal from "../common/ConfirmModal";
import MemberProfile from "./MemberProfile";
import { useToastStore } from "../../store/toastStore";
import { getUserColor } from "../../utils/userColors";

function getRoleColor(member: MemberInfo): string {
  return getUserColor(member.user_id);
}

function getRoleLabel(member: MemberInfo): string | null {
  if (member.is_server_admin) return "Server Admin";
  if (member.power_level >= 100) return "Admin";
  if (member.power_level >= 50) return "Moderator";
  return null;
}

interface Props {
  member: MemberInfo;
}

export default function MemberItem({ member }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"kick" | "ban" | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const currentUserId = useAuthStore((s) => s.user?.user_id);
  const members = useMemberStore((s) => s.members);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);

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
  const isOffline = member.presence === "offline";
  const roleColor = getRoleColor(member);
  const roleLabel = getRoleLabel(member);

  // Permission checks:
  // - Server admins can manage anyone (Synapse admin API overrides room permissions)
  // - Room admins/mods need strictly higher power level (Matrix spec)
  const canManage = !isSelf && (
    (amIServerAdmin && !member.is_server_admin) ||
    (myPowerLevel > member.power_level && myPowerLevel >= 50)
  );
  const canPromote = !isSelf && (
    (amIServerAdmin && !member.is_server_admin) ||
    (myPowerLevel > member.power_level && myPowerLevel >= 100)
  );
  const canBan = !isSelf && (
    (amIServerAdmin && !member.is_server_admin) ||
    (myPowerLevel > member.power_level && myPowerLevel >= 100)
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleKick = async () => {
    if (!selectedRoomId) return;
    setIsActioning(true);
    try {
      await api.kickMember(selectedRoomId, member.user_id, "Kicked by admin");
      addToast("success", `Kicked ${displayName}`);
      fetchMembers(selectedRoomId);
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
    } catch (e) {
      addToast("error", `Failed to ban: ${e}`);
    } finally {
      setIsActioning(false);
      setConfirmAction(null);
    }
  };

  const handleSetRole = async (powerLevel: number, roleName: string) => {
    if (!selectedRoomId) return;
    try {
      await api.setPowerLevel(selectedRoomId, member.user_id, powerLevel);
      addToast("success", `Set ${displayName} to ${roleName}`);
      fetchMembers(selectedRoomId);
    } catch (e) {
      addToast("error", `Failed to set role: ${e}`);
    }
  };

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: "Profile",
      onClick: () => setShowProfile(true),
    },
    ...(!isSelf ? [{
      label: "Message",
      onClick: async () => {
        try {
          const room = await api.createDm(member.user_id);
          useRoomStore.getState().selectRoom(room.room_id);
          useRoomStore.getState().fetchDmRooms();
          addToast("success", `DM opened with ${displayName}`);
        } catch (e) {
          addToast("error", `Failed to open DM: ${e}`);
        }
      },
    } as ContextMenuItem] : []),
    {
      label: "Mention",
      onClick: () => {
        navigator.clipboard.writeText(member.user_id);
        addToast("success", `Copied ${displayName}'s mention`);
      },
    },
    { divider: true, label: "", onClick: () => {} },
    {
      label: "Copy User ID",
      onClick: () => {
        navigator.clipboard.writeText(member.user_id);
        addToast("success", "User ID copied");
      },
    },
    // Role management submenu items
    ...(canPromote
      ? [
          { divider: true, label: "", onClick: () => {} } as ContextMenuItem,
          ...(member.power_level < 100
            ? [{ label: "Promote to Admin", onClick: () => handleSetRole(100, "Admin") } as ContextMenuItem]
            : []),
          ...(member.power_level < 50
            ? [{ label: "Promote to Moderator", onClick: () => handleSetRole(50, "Moderator") } as ContextMenuItem]
            : []),
          ...(member.power_level > 0
            ? [{ label: "Demote to Member", onClick: () => handleSetRole(0, "Member") } as ContextMenuItem]
            : []),
        ]
      : []),
    // Kick/Ban
    ...(canManage || canBan
      ? [
          { divider: true, label: "", onClick: () => {} } as ContextMenuItem,
          ...(canManage
            ? [{ label: "Kick", onClick: () => setConfirmAction("kick"), danger: true } as ContextMenuItem]
            : []),
          ...(canBan
            ? [{ label: "Ban", onClick: () => setConfirmAction("ban"), danger: true } as ContextMenuItem]
            : []),
        ]
      : []),
  ];

  return (
    <>
      <div
        className={`member-item ${isOffline ? "offline" : ""}`}
        onClick={() => setShowProfile(true)}
        onContextMenu={handleContextMenu}
      >
        <div className="member-avatar" style={{ backgroundColor: roleColor }}>
          {initial}
          <div className={`member-presence-dot ${member.presence}`} />
        </div>
        <div className="member-info">
          <span className="member-name" style={{ color: isOffline ? undefined : roleColor }}>
            {displayName}
          </span>
          {roleLabel === "Server Admin" && (
            <span className="member-role-badge server-admin">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="#f0b232" style={{ marginRight: 2, verticalAlign: "middle" }}>
                <path d="M13.6572 5.42868L13.8936 5.0985C14.2615 4.56373 13.5982 3.90035 13.0635 4.26836L12.7333 4.50468L12.3962 4.26836C11.8615 3.90035 11.1982 4.56373 11.5661 5.0985L11.8025 5.42868L11.4299 5.56139C10.8445 5.77447 10.8445 6.60111 11.4299 6.81419L11.8025 6.9469L11.5661 7.27708C11.1982 7.81185 11.8615 8.47523 12.3962 8.10722L12.7333 7.8709L13.0635 8.10722C13.5982 8.47523 14.2615 7.81185 13.8936 7.27708L13.6572 6.9469L14.0298 6.81419C14.6152 6.60111 14.6152 5.77447 14.0298 5.56139L13.6572 5.42868Z"/>
                <path d="M7.59706 8.09052L8.0602 7.35869C8.55498 6.57511 7.54843 5.65422 6.76485 6.14899L6.33333 6.42135L5.90182 6.14899C5.11824 5.65422 4.11169 6.57511 4.60647 7.35869L4.93961 7.89052L4.0602 8.09052C3.19116 8.29052 3.19116 9.52173 4.0602 9.72173L4.93961 9.92173L4.60647 10.4536C4.11169 11.2371 5.11824 12.158 5.90182 11.6633L6.33333 11.3909L6.76485 11.6633C7.54843 12.158 8.55498 11.2371 8.0602 10.4536L7.72706 9.92173L8.60647 9.72173C9.47551 9.52173 9.47551 8.29052 8.60647 8.09052L7.59706 8.09052Z"/>
              </svg>
              Server Admin
            </span>
          )}
          {roleLabel === "Admin" && (
            <span className="member-role-badge" style={{ color: "#f0b232" }}>Admin</span>
          )}
          {roleLabel === "Moderator" && (
            <span className="member-role-badge" style={{ color: "#5c9bf0" }}>Moderator</span>
          )}
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

      <MemberProfile
        member={member}
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />

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

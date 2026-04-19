import { useMemo } from "react";
import { useMemberStore } from "../../store/memberStore";
import type { MemberInfo } from "../../api/commands";
import MemberItem from "../member/MemberItem";

interface RoleGroup {
  label: string;
  members: MemberInfo[];
}

export default function MemberSidebar() {
  const members = useMemberStore((s) => s.members);

  const groups = useMemo(() => {
    const serverAdmins: MemberInfo[] = [];
    const admins: MemberInfo[] = [];
    const moderators: MemberInfo[] = [];
    const onlineMembers: MemberInfo[] = [];
    const offlineMembers: MemberInfo[] = [];

    for (const m of members) {
      if (m.is_server_admin) {
        serverAdmins.push(m);
      } else if (m.power_level >= 100) {
        admins.push(m);
      } else if (m.power_level >= 50) {
        moderators.push(m);
      } else if (m.presence === "offline") {
        offlineMembers.push(m);
      } else {
        onlineMembers.push(m);
      }
    }

    const result: RoleGroup[] = [];
    if (serverAdmins.length > 0) {
      result.push({ label: `Server Admin — ${serverAdmins.length}`, members: serverAdmins });
    }
    if (admins.length > 0) {
      result.push({ label: `Admin — ${admins.length}`, members: admins });
    }
    if (moderators.length > 0) {
      result.push({ label: `Moderator — ${moderators.length}`, members: moderators });
    }
    if (onlineMembers.length > 0) {
      result.push({ label: `Online — ${onlineMembers.length}`, members: onlineMembers });
    }
    if (offlineMembers.length > 0) {
      result.push({ label: `Offline — ${offlineMembers.length}`, members: offlineMembers });
    }

    return result;
  }, [members]);

  return (
    <div className="member-sidebar">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="member-group-header">{group.label}</div>
          {group.members.map((member) => (
            <MemberItem key={member.user_id} member={member} />
          ))}
        </div>
      ))}
    </div>
  );
}

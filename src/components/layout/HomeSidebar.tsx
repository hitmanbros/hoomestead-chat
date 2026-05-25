import { useEffect, useState } from "react";
import UserPanel from "../user/UserPanel";
import { api, type InviteInfo } from "../../api/commands";
import { useToastStore } from "../../store/toastStore";
import { useSpaceStore } from "../../store/spaceStore";

export default function HomeSidebar() {
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listInvites();
      setInvites(list);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const accept = async (invite: InviteInfo) => {
    setBusyId(invite.room_id);
    try {
      await api.acceptInvite(invite.room_id);
      addToast("success", `Joined ${invite.name || "room"}`);
      setInvites((cur) => cur.filter((i) => i.room_id !== invite.room_id));
      if (invite.is_space) await fetchSpaces();
    } catch (e) {
      addToast("error", `Failed to accept: ${e}`);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (invite: InviteInfo) => {
    setBusyId(invite.room_id);
    try {
      await api.rejectInvite(invite.room_id);
      addToast("success", "Invite rejected");
      setInvites((cur) => cur.filter((i) => i.room_id !== invite.room_id));
    } catch (e) {
      addToast("error", `Failed to reject: ${e}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar-header">
        <span style={{ fontWeight: 600, color: "var(--header-primary)" }}>OpenClaw</span>
      </div>
      <div className="channel-list-container">
        <div className="invites-section">
          <div className="invites-header">
            <span>PENDING INVITES</span>
            <span className="invites-count">{invites.length}</span>
          </div>
          {loading && invites.length === 0 && (
            <div className="invites-empty">Loading...</div>
          )}
          {!loading && invites.length === 0 && (
            <div className="invites-empty">No pending invites</div>
          )}
          {invites.map((invite) => (
            <div key={invite.room_id} className="invite-item">
              <div className="invite-meta">
                <div className="invite-name">
                  {invite.is_space ? "🌐 " : invite.is_direct ? "💬 " : "# "}
                  {invite.name || invite.room_id}
                </div>
                {invite.topic && <div className="invite-topic">{invite.topic}</div>}
              </div>
              <div className="invite-actions">
                <button
                  className="invite-btn accept"
                  onClick={() => accept(invite)}
                  disabled={busyId === invite.room_id}
                >
                  Accept
                </button>
                <button
                  className="invite-btn reject"
                  onClick={() => reject(invite)}
                  disabled={busyId === invite.room_id}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <UserPanel />
    </div>
  );
}

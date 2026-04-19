import { useEffect, useState } from "react";
import { api, FriendInfo } from "../../api/commands";
import { useRoomStore } from "../../store/roomStore";
import { useMessageStore } from "../../store/messageStore";
import { useMemberStore } from "../../store/memberStore";
import { useToastStore } from "../../store/toastStore";
import { getUserColor } from "../../utils/userColors";

type Tab = "online" | "all";

function getColor(userId: string): string {
  return getUserColor(userId);
}

function getInitial(name: string): string {
  if (name.startsWith("@")) {
    const local = name.slice(1).split(":")[0];
    return local[0]?.toUpperCase() || "?";
  }
  return name[0]?.toUpperCase() || "?";
}

export default function FriendsView() {
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [tab, setTab] = useState<Tab>("online");
  const [isLoading, setIsLoading] = useState(true);
  const selectRoom = useRoomStore((s) => s.selectRoom);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const setCurrentRoom = useMessageStore((s) => s.setCurrentRoom);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    setIsLoading(true);
    try {
      const result = await api.getFriends();
      setFriends(result);
    } catch (e) {
      addToast("error", `Failed to load friends: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMessage = (friend: FriendInfo) => {
    selectRoom(friend.room_id);
    setCurrentRoom(friend.room_id);
    Promise.all([fetchMessages(friend.room_id), fetchMembers(friend.room_id)]);
  };

  const onlineFriends = friends.filter((f) => f.presence !== "offline");
  const displayed = tab === "online" ? onlineFriends : friends;

  return (
    <div className="main-content">
      <div className="channel-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
          <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.795 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z" />
          <path d="M20 20.006H22V19.006C22 16.443 20.27 14.441 17.521 13.348C19.062 14.726 20 16.703 20 19.006V20.006Z" />
          <path d="M14.883 11.908C16.666 11.504 18 9.906 18 8.006C18 6.106 16.666 4.508 14.883 4.104C15.559 5.206 16 6.564 16 8.006C16 9.448 15.559 10.806 14.883 11.908Z" />
        </svg>
        <span className="channel-header-name">Friends</span>
        <div className="channel-header-divider" />
        <div className="friends-tabs">
          <button
            className={`friends-tab ${tab === "online" ? "active" : ""}`}
            onClick={() => setTab("online")}
          >
            Online
          </button>
          <button
            className={`friends-tab ${tab === "all" ? "active" : ""}`}
            onClick={() => setTab("all")}
          >
            All
          </button>
        </div>
      </div>

      <div className="friends-content">
        <div className="friends-search-bar">
          <input
            type="text"
            placeholder="Search"
            className="friends-search-input"
            disabled
          />
        </div>

        <div className="friends-count">
          {tab === "online" ? "ONLINE" : "ALL FRIENDS"} — {displayed.length}
        </div>

        {isLoading ? (
          <div style={{ padding: 20, color: "var(--text-muted)", textAlign: "center" }}>
            Loading...
          </div>
        ) : displayed.length === 0 ? (
          <div className="friends-empty">
            {tab === "online"
              ? "No friends are online right now."
              : "You haven't started any conversations yet."}
          </div>
        ) : (
          <div className="friends-list">
            {displayed.map((friend) => {
              const name = friend.display_name || friend.user_id;
              const initial = getInitial(name);
              const color = getColor(friend.user_id);
              const isOnline = friend.presence !== "offline";

              const hasAvatar = friend.avatar_url && !friend.avatar_url.startsWith("mxc://");

              return (
                <div key={friend.user_id} className="friend-item">
                  <div className="friend-avatar" style={hasAvatar ? undefined : { backgroundColor: color }}>
                    {hasAvatar ? (
                      <img src={friend.avatar_url!} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      initial
                    )}
                    <div className={`friend-presence-dot ${friend.presence}`} />
                  </div>
                  <div className="friend-info">
                    <span className="friend-name">{name}</span>
                    <span className="friend-status">
                      {friend.presence === "online" ? "Online" :
                       friend.presence === "unavailable" ? "Idle" :
                       friend.presence === "busy" ? "Do Not Disturb" : "Offline"}
                    </span>
                  </div>
                  <div className="friend-actions">
                    <button
                      className="friend-action-btn"
                      onClick={() => handleMessage(friend)}
                      title="Message"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.79805 3C3.80445 3 2.99805 3.8055 2.99805 4.8V15.6C2.99805 16.5936 3.80445 17.4 4.79805 17.4H8.39805L11.998 21L15.598 17.4H19.198C20.1925 17.4 20.998 16.5936 20.998 15.6V4.8C20.998 3.8055 20.1925 3 19.198 3H4.79805Z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

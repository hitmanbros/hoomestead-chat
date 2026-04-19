import { useEffect, useState } from "react";
import { api, PublicSpaceInfo } from "../../api/commands";
import { useSpaceStore } from "../../store/spaceStore";
import { useToastStore } from "../../store/toastStore";
import { getUserColor } from "../../utils/userColors";

export default function DiscoverView() {
  const [spaces, setSpaces] = useState<PublicSpaceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);
  const selectSpace = useSpaceStore((s) => s.selectSpace);
  const addToast = useToastStore((s) => s.addToast);

  const loadSpaces = () => {
    setIsLoading(true);
    api.getPublicSpaces()
      .then(setSpaces)
      .catch((e) => addToast("error", `Failed to load spaces: ${e}`))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSpaces();
  }, []);

  const handleJoin = async (space: PublicSpaceInfo) => {
    setJoiningId(space.room_id);
    try {
      await api.joinRoom(space.room_id);
      addToast("success", `Joined ${space.name || "server"}`);
      await fetchSpaces();
      selectSpace(space.room_id);
      setSpaces((prev) => prev.filter((s) => s.room_id !== space.room_id));
    } catch (e) {
      addToast("error", `Failed to join: ${e}`);
    } finally {
      setJoiningId(null);
    }
  };

  // Separate public and invited spaces
  const publicSpaces = spaces.filter((s) => !s.is_invited);
  const invitedSpaces = spaces.filter((s) => s.is_invited);

  return (
    <div className="main-content">
      <div className="channel-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, opacity: 0.7 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z"/>
        </svg>
        <span className="channel-header-name">Discover Servers</span>
        <span className="channel-header-topic" style={{ marginLeft: 12 }}>
          Find communities on this homeserver
        </span>
        <div className="channel-header-toolbar">
          <button className="toolbar-btn" onClick={loadSpaces} title="Refresh">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="discover-content">
        {isLoading ? (
          <div className="discover-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="discover-card skeleton">
                <div className="discover-card-banner skeleton-bg" />
                <div className="discover-card-body">
                  <div className="skeleton-text" style={{ width: "60%", height: 18, marginBottom: 8 }} />
                  <div className="skeleton-text" style={{ width: "80%", height: 14 }} />
                </div>
              </div>
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div className="discover-empty">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="var(--text-muted)" opacity="0.3">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z"/>
            </svg>
            <h3>No Servers Found</h3>
            <p>There are no public or invited communities available right now.</p>
            <button className="discover-refresh-btn" onClick={loadSpaces}>
              Refresh
            </button>
          </div>
        ) : (
          <>
            {invitedSpaces.length > 0 && (
              <div className="discover-section">
                <h3 className="discover-section-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  Invited — {invitedSpaces.length}
                </h3>
                <div className="discover-grid">
                  {invitedSpaces.map((space) => (
                    <SpaceCard key={space.room_id} space={space} joiningId={joiningId} onJoin={handleJoin} />
                  ))}
                </div>
              </div>
            )}

            {publicSpaces.length > 0 && (
              <div className="discover-section">
                <h3 className="discover-section-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  Public Servers — {publicSpaces.length}
                </h3>
                <div className="discover-grid">
                  {publicSpaces.map((space) => (
                    <SpaceCard key={space.room_id} space={space} joiningId={joiningId} onJoin={handleJoin} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SpaceCard({
  space,
  joiningId,
  onJoin,
}: {
  space: PublicSpaceInfo;
  joiningId: string | null;
  onJoin: (space: PublicSpaceInfo) => void;
}) {
  const color = getUserColor(space.room_id);
  const initial = (space.name || "?")[0]?.toUpperCase() || "?";
  const isInvite = space.is_invited;

  return (
    <div className="discover-card">
      <div className="discover-card-banner" style={{ background: color }}>
        <span className={`discover-badge ${isInvite ? "invite" : "public"}`}>
          {isInvite ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
              Invited
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
              Public
            </>
          )}
        </span>
      </div>
      <div className="discover-card-body">
        <div className="discover-card-avatar" style={{ background: color }}>
          {space.avatar_url ? (
            <img src={space.avatar_url} alt="" />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <h4 className="discover-card-name">{space.name || "Unnamed Server"}</h4>
        {space.topic && (
          <p className="discover-card-topic">{space.topic}</p>
        )}
        <div className="discover-card-footer">
          {!isInvite && (
            <span className="discover-card-members">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.795 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z" />
              </svg>
              {space.num_joined_members} member{space.num_joined_members !== 1 ? "s" : ""}
            </span>
          )}
          {isInvite && <span className="discover-card-members" />}
          <button
            className={`discover-join-btn ${isInvite ? "invite" : ""}`}
            onClick={() => onJoin(space)}
            disabled={joiningId === space.room_id}
          >
            {joiningId === space.room_id ? "Joining..." : isInvite ? "Accept Invite" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}

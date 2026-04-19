import { useEffect, useState } from "react";
import { useSpaceStore } from "../../store/spaceStore";
import { useRoomStore } from "../../store/roomStore";
import ServerIcon from "../server/ServerIcon";
import Tooltip from "../common/Tooltip";
import CreateServer from "../server/CreateServer";

export default function ServerSidebar() {
  const spaces = useSpaceStore((s) => s.spaces);
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const isLoading = useSpaceStore((s) => s.isLoading);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);
  const selectSpace = useSpaceStore((s) => s.selectSpace);
  const selectRoom = useRoomStore((s) => s.selectRoom);
  const spaceUnreadCounts = useRoomStore((s) => s.spaceUnreadCounts);
  const [showCreateServer, setShowCreateServer] = useState(false);

  useEffect(() => {
    fetchSpaces();
  }, []);

  const handleSelectSpace = (spaceId: string) => {
    selectSpace(spaceId);
    selectRoom(null);
  };

  return (
    <div className="server-sidebar">
      <div className="server-list">
        <Tooltip text="Dashboard" position="right">
          <div
            className={`server-icon-wrapper ${selectedSpaceId === null ? "selected" : ""}`}
          >
            <div className="server-pill" />
            <div
              className={`server-icon home ${selectedSpaceId === null ? "selected" : ""}`}
              onClick={() => {
                selectSpace(null);
                selectRoom(null);
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
            </div>
          </div>
        </Tooltip>

        <div className="server-separator" />

        {isLoading && spaces.length === 0 ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="server-icon-wrapper">
                <div className="server-icon skeleton-server" />
              </div>
            ))}
          </>
        ) : (
          spaces.map((space) => (
            <Tooltip key={space.room_id} text={space.name || space.room_id} position="right">
              <ServerIcon
                space={space}
                isSelected={selectedSpaceId === space.room_id}
                onClick={() => handleSelectSpace(space.room_id)}
                unreadCount={spaceUnreadCounts[space.room_id] || 0}
              />
            </Tooltip>
          ))
        )}

        <div className="server-separator" />

        <Tooltip text="Add a Server" position="right">
          <div className="server-icon-wrapper">
            <div
              className="server-icon add"
              onClick={() => setShowCreateServer(true)}
            >
              +
            </div>
          </div>
        </Tooltip>
      </div>

      <CreateServer
        isOpen={showCreateServer}
        onClose={() => setShowCreateServer(false)}
      />
    </div>
  );
}

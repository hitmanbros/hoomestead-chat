import { useState, useEffect } from "react";
import Modal from "../common/Modal";
import { api, RoomInfo } from "../../api/commands";
import { useSpaceStore } from "../../store/spaceStore";
import { useRoomStore } from "../../store/roomStore";
import { useToastStore } from "../../store/toastStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddExistingChannel({ isOpen, onClose }: Props) {
  const [allRooms, setAllRooms] = useState<RoomInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const spaceRooms = useRoomStore((s) => s.rooms);
  const fetchRooms = useRoomStore((s) => s.fetchRooms);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      api.getAllJoinedRooms()
        .then(setAllRooms)
        .catch((e) => addToast("error", `Failed to fetch rooms: ${e}`))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  // Filter out rooms already in this space
  const spaceRoomIds = new Set(spaceRooms.map((r) => r.room_id));
  const availableRooms = allRooms.filter((r) => !spaceRoomIds.has(r.room_id));

  const handleAdd = async (roomId: string) => {
    if (!selectedSpaceId) return;
    setIsAdding(roomId);
    try {
      await api.addRoomToSpace(selectedSpaceId, roomId);
      await fetchRooms(selectedSpaceId);
      addToast("success", "Channel added to server");
      // Remove from available list
      setAllRooms((prev) => prev.filter((r) => r.room_id !== roomId));
    } catch (e) {
      addToast("error", `Failed to add channel: ${e}`);
    } finally {
      setIsAdding(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Existing Channel">
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
        Add a room you've already joined to this server.
      </p>

      {isLoading ? (
        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>
          Loading rooms...
        </div>
      ) : availableRooms.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)" }}>
          No available rooms to add.
        </div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {availableRooms.map((room) => (
            <div
              key={room.room_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 4,
                cursor: "pointer",
                background: "var(--background-secondary)",
                marginBottom: 4,
              }}
              onClick={() => handleAdd(room.room_id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 18, flexShrink: 0 }}>
                  {room.channel_type === "voice" ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z"/>
                    </svg>
                  ) : "#"}
                </span>
                <span style={{
                  color: "var(--text-normal)",
                  fontSize: 15,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {room.name || room.room_id}
                </span>
              </div>
              <button
                className="create-channel-submit"
                style={{ padding: "4px 12px", fontSize: 13 }}
                disabled={isAdding === room.room_id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAdd(room.room_id);
                }}
              >
                {isAdding === room.room_id ? "Adding..." : "Add"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="create-channel-buttons" style={{ marginTop: 12 }}>
        <button className="create-channel-cancel" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

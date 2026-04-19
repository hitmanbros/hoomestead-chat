import { useState, useEffect } from "react";
import Modal from "../common/Modal";
import { api } from "../../api/commands";
import { useSpaceStore } from "../../store/spaceStore";
import { useRoomStore } from "../../store/roomStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: "text" | "voice";
}

type ChannelType = "text" | "voice";

const channelTypes: { value: ChannelType; label: string; description: string }[] = [
  { value: "text", label: "Text Channel", description: "Send messages, images, GIFs, and emoji" },
  { value: "voice", label: "Voice Channel", description: "Hang out together with voice, video, and screen share" },
];

export default function CreateChannel({ isOpen, onClose, defaultType = "text" }: Props) {
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>(defaultType);

  useEffect(() => {
    if (isOpen) setChannelType(defaultType);
  }, [isOpen, defaultType]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const fetchRooms = useRoomStore((s) => s.fetchRooms);

  const handleCreate = async () => {
    if (!name.trim() || !selectedSpaceId) return;
    setIsCreating(true);
    setError(null);
    try {
      await api.createRoom(
        name.trim(),
        undefined,
        selectedSpaceId,
        channelType !== "voice", // don't encrypt voice channels
        channelType,
      );
      await fetchRooms(selectedSpaceId);
      setName("");
      setChannelType("text");
      setError(null);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName("");
    setChannelType("text");
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Channel">
      <div className="create-channel-section">
        <label className="create-channel-label">Channel Type</label>
        <div className="channel-type-options">
          {channelTypes.map((type) => (
            <label
              key={type.value}
              className={`channel-type-option ${channelType === type.value ? "selected" : ""}`}
              onClick={() => setChannelType(type.value)}
            >
              <div className={`channel-type-radio ${channelType === type.value ? "checked" : ""}`}>
                {channelType === type.value && <div className="channel-type-radio-dot" />}
              </div>
              <div className="channel-type-icon">
                {type.value === "text" && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3504L15.4104 9H9.41045Z"/>
                  </svg>
                )}
                {type.value === "voice" && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904ZM14 5.00304V7.00304C16.757 7.00304 19 9.24604 19 12.003C19 14.76 16.757 17.003 14 17.003V19.003C17.86 19.003 21 15.863 21 12.003C21 8.14304 17.86 5.00304 14 5.00304ZM14 9.00304V15.003C15.654 15.003 17 13.657 17 12.003C17 10.349 15.654 9.00304 14 9.00304Z"/>
                  </svg>
                )}
              </div>
              <div className="channel-type-text">
                <span className="channel-type-name">{type.label}</span>
                <span className="channel-type-desc">{type.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="create-channel-section">
        <label className="create-channel-label">Name</label>
        <div className="create-channel-input-wrapper">
          <span className="create-channel-input-prefix">
            {channelType === "text" && "#"}
            {channelType === "voice" && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z"/>
              </svg>
            )}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            placeholder="new-channel"
            autoFocus
            className="create-channel-name-input"
          />
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="create-channel-buttons">
        <button className="create-channel-cancel" onClick={handleClose}>
          Cancel
        </button>
        <button
          className="create-channel-submit"
          onClick={handleCreate}
          disabled={isCreating || !name.trim()}
        >
          {isCreating ? "Creating..." : "Create Channel"}
        </button>
      </div>
    </Modal>
  );
}

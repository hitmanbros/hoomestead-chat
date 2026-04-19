import { useState } from "react";
import Modal from "../common/Modal";
import { api } from "../../api/commands";
import { useSpaceStore } from "../../store/spaceStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateServer({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await api.createSpace(name.trim(), topic.trim() || undefined, isPublic);
      await fetchSpaces();
      setName("");
      setTopic("");
      setIsPublic(true);
      setError(null);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create a Server">
      <div className="login-field">
        <label>Server Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Awesome Server"
          autoFocus
        />
      </div>
      <div className="login-field">
        <label>Topic (optional)</label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What's this server about?"
        />
      </div>

      <div className="create-server-visibility">
        <label className="create-channel-label">Server Visibility</label>
        <div className="channel-type-options">
          <label
            className={`channel-type-option ${isPublic ? "selected" : ""}`}
            onClick={() => setIsPublic(true)}
          >
            <div className={`channel-type-radio ${isPublic ? "checked" : ""}`}>
              {isPublic && <div className="channel-type-radio-dot" />}
            </div>
            <div className="channel-type-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
            </div>
            <div className="channel-type-text">
              <span className="channel-type-name">Public</span>
              <span className="channel-type-desc">Anyone can find and join this server</span>
            </div>
          </label>
          <label
            className={`channel-type-option ${!isPublic ? "selected" : ""}`}
            onClick={() => setIsPublic(false)}
          >
            <div className={`channel-type-radio ${!isPublic ? "checked" : ""}`}>
              {!isPublic && <div className="channel-type-radio-dot" />}
            </div>
            <div className="channel-type-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </div>
            <div className="channel-type-text">
              <span className="channel-type-name">Private</span>
              <span className="channel-type-desc">Only people you invite can join</span>
            </div>
          </label>
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}
      <button
        className="login-button"
        onClick={handleCreate}
        disabled={isCreating || !name.trim()}
      >
        {isCreating ? "Creating..." : "Create Server"}
      </button>
    </Modal>
  );
}

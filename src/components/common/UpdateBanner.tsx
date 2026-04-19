import { useEffect, useState } from "react";
import { onClientUpdate, type ClientUpdateEvent } from "../../api/events";

declare global {
  interface Window {
    electronAPI?: {
      runUpdate?: () => Promise<void>;
      [key: string]: unknown;
    };
  }
}

export default function UpdateBanner() {
  const [update, setUpdate] = useState<ClientUpdateEvent | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    return onClientUpdate((event) => {
      setUpdate(event);
    });
  }, []);

  if (!update) return null;

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await window.electronAPI?.runUpdate?.();
    } catch {
      setUpdating(false);
    }
  };

  const handleDismiss = () => {
    setUpdate(null);
  };

  return (
    <div className="update-banner">
      <span className="update-banner-text">
        {updating
          ? "Updating... pulling changes and rebuilding"
          : `Update available: ${update.message || "new changes pushed"}`}
      </span>
      {!updating && (
        <div className="update-banner-actions">
          <button className="update-banner-btn update" onClick={handleUpdate}>
            Update & Restart
          </button>
          <button className="update-banner-btn dismiss" onClick={handleDismiss}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}

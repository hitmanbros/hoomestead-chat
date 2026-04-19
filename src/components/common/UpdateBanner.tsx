import { useEffect, useState } from "react";
import { onClientUpdate, type ClientUpdateEvent } from "../../api/events";

declare global {
  interface Window {
    electronAPI?: {
      checkForUpdates?: () => Promise<void>;
      downloadUpdate?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
      onUpdateAvailable?: (cb: (info: { version: string }) => void) => void;
      onUpdateProgress?: (cb: (info: { percent: number }) => void) => void;
      onUpdateDownloaded?: (cb: () => void) => void;
      onUpdateError?: (cb: (msg: string) => void) => void;
      [key: string]: unknown;
    };
  }
}

type UpdateState = "idle" | "available" | "downloading" | "ready" | "error";

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>("idle");
  const [message, setMessage] = useState("");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onUpdateAvailable?.((info) => {
      setState("available");
      setMessage(`v${info.version} available`);
    });

    api.onUpdateProgress?.((info) => {
      setPercent(info.percent);
    });

    api.onUpdateDownloaded?.(() => {
      setState("ready");
    });

    api.onUpdateError?.((msg) => {
      setState("error");
      setMessage(msg);
    });

    return onClientUpdate((event: ClientUpdateEvent) => {
      if (state === "idle") {
        setState("available");
        setMessage(event.message || "new changes pushed");
        api.checkForUpdates?.();
      }
    });
  }, []);

  if (state === "idle") return null;

  const handleDownload = () => {
    setState("downloading");
    window.electronAPI?.downloadUpdate?.();
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate?.();
  };

  const handleDismiss = () => {
    setState("idle");
    setMessage("");
  };

  return (
    <div className="update-banner">
      <span className="update-banner-text">
        {state === "available" && `Update ${message}`}
        {state === "downloading" && `Downloading update... ${percent}%`}
        {state === "ready" && "Update ready — restart to apply"}
        {state === "error" && `Update failed: ${message}`}
      </span>
      <div className="update-banner-actions">
        {state === "available" && (
          <button className="update-banner-btn update" onClick={handleDownload}>
            Download Update
          </button>
        )}
        {state === "ready" && (
          <button className="update-banner-btn update" onClick={handleInstall}>
            Restart Now
          </button>
        )}
        <button className="update-banner-btn dismiss" onClick={handleDismiss}>
          {state === "error" ? "Dismiss" : "Later"}
        </button>
      </div>
    </div>
  );
}

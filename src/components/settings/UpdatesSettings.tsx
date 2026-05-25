import { useEffect, useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; percent: number }
  | { kind: "ready" }
  | { kind: "up-to-date" }
  | { kind: "error"; message: string };

declare global {
  interface Window {
    electronAPI?: {
      getAppVersion?: () => Promise<string>;
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

export default function UpdatesSettings() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onUpdateAvailable?.((info) => {
      setStatus({ kind: "available", version: info.version });
    });
    api.onUpdateProgress?.((info) => {
      setStatus({ kind: "downloading", percent: Math.round(info.percent) });
    });
    api.onUpdateDownloaded?.(() => {
      setStatus({ kind: "ready" });
    });
    api.onUpdateError?.((msg) => {
      setStatus({ kind: "error", message: msg });
    });
  }, []);

  const handleCheck = async () => {
    const api = window.electronAPI;
    if (!api?.checkForUpdates) {
      setStatus({ kind: "error", message: "Updater not available (dev build?)" });
      return;
    }
    setStatus({ kind: "checking" });
    try {
      await api.checkForUpdates();
      setTimeout(() => {
        setStatus((s) => (s.kind === "checking" ? { kind: "up-to-date" } : s));
      }, 4000);
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  };

  const handleDownload = () => {
    window.electronAPI?.downloadUpdate?.();
    setStatus({ kind: "downloading", percent: 0 });
  };

  const handleInstall = () => {
    window.electronAPI?.installUpdate?.();
  };

  const renderStatus = () => {
    switch (status.kind) {
      case "idle":
        return null;
      case "checking":
        return <div className="settings-description">Checking for updates...</div>;
      case "up-to-date":
        return <div className="settings-description">You're on the latest version.</div>;
      case "available":
        return (
          <div className="settings-description">
            Update available: v{status.version}
            <div style={{ marginTop: 8 }}>
              <button className="settings-btn" onClick={handleDownload}>
                Download Update
              </button>
            </div>
          </div>
        );
      case "downloading":
        return <div className="settings-description">Downloading... {status.percent}%</div>;
      case "ready":
        return (
          <div className="settings-description">
            Update downloaded. Restart to apply.
            <div style={{ marginTop: 8 }}>
              <button className="settings-btn" onClick={handleInstall}>
                Restart Now
              </button>
            </div>
          </div>
        );
      case "error":
        return <div className="settings-description">Error: {status.message}</div>;
    }
  };

  return (
    <div className="settings-page">
      <h2 className="settings-page-title">Updates</h2>
      <p className="settings-description">
        Check for new versions of OpenClaw Client.
      </p>

      <div className="settings-divider" />

      <div className="settings-toggle-row">
        <div className="settings-toggle-info">
          <div className="settings-toggle-label">Current version</div>
          <div className="settings-toggle-desc">{version ? `v${version}` : "…"}</div>
        </div>
        <button
          className="settings-btn"
          onClick={handleCheck}
          disabled={status.kind === "checking" || status.kind === "downloading"}
        >
          {status.kind === "checking" ? "Checking..." : "Check for Updates"}
        </button>
      </div>

      {renderStatus()}
    </div>
  );
}

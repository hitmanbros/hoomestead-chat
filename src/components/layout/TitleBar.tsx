const electronAPI = (window as any).electronAPI;

export default function TitleBar() {
  // In browser mode (no Electron), hide the custom titlebar
  if (!electronAPI) return null;

  return (
    <div className="titlebar" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
      <div className="titlebar-buttons" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button className="titlebar-btn" onClick={() => electronAPI.minimize()}>
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect fill="currentColor" width="10" height="1" />
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => electronAPI.maximize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect fill="none" stroke="currentColor" strokeWidth="1" x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button className="titlebar-btn titlebar-close" onClick={() => electronAPI.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line stroke="currentColor" strokeWidth="1.2" x1="0" y1="0" x2="10" y2="10" />
            <line stroke="currentColor" strokeWidth="1.2" x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

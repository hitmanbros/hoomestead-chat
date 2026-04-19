import { useState } from "react";

const THEME_COLORS = [
  { key: "--background-primary", label: "Background Primary", default: "#313338" },
  { key: "--background-secondary", label: "Background Secondary", default: "#2b2d31" },
  { key: "--background-tertiary", label: "Background Tertiary", default: "#1e1f22" },
  { key: "--background-floating", label: "Background Floating", default: "#111214" },
  { key: "--background-modifier-hover", label: "Hover", default: "#2e3035" },
  { key: "--background-modifier-selected", label: "Selected", default: "#404249" },
  { key: "--text-normal", label: "Text Normal", default: "#dbdee1" },
  { key: "--text-muted", label: "Text Muted", default: "#949ba4" },
  { key: "--text-link", label: "Text Link", default: "#00a8fc" },
  { key: "--header-primary", label: "Header Primary", default: "#f2f3f5" },
  { key: "--brand-500", label: "Brand / Accent", default: "#5865f2" },
  { key: "--green-360", label: "Online Green", default: "#23a55a" },
  { key: "--yellow-300", label: "Idle Yellow", default: "#f0b232" },
  { key: "--red-400", label: "Danger Red", default: "#f23f43" },
] as const;

const STORAGE_KEY = "hoomestead-theme";
const MODE_KEY = "hoomestead-theme-mode"; // "default" | "custom"

function loadTheme(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadMode(): "default" | "custom" {
  return (localStorage.getItem(MODE_KEY) as "default" | "custom") || "default";
}

function saveTheme(overrides: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function saveMode(mode: "default" | "custom") {
  localStorage.setItem(MODE_KEY, mode);
}

function applyOverrides(overrides: Record<string, string>) {
  const root = document.documentElement;
  for (const c of THEME_COLORS) {
    if (overrides[c.key]) {
      root.style.setProperty(c.key, overrides[c.key]);
    } else {
      root.style.removeProperty(c.key);
    }
  }
}

function clearOverrides() {
  const root = document.documentElement;
  for (const c of THEME_COLORS) {
    root.style.removeProperty(c.key);
  }
}

export default function AppearanceSettings() {
  const [mode, setMode] = useState<"default" | "custom">(loadMode);
  const [overrides, setOverrides] = useState<Record<string, string>>(loadTheme);

  const isCustom = mode === "custom";

  const handleSetDefault = () => {
    setMode("default");
    saveMode("default");
    clearOverrides();
  };

  const handleSetCustom = () => {
    setMode("custom");
    saveMode("custom");
    applyOverrides(overrides);
  };

  const handleColorChange = (key: string, value: string) => {
    const next = { ...overrides, [key]: value };
    setOverrides(next);
    saveTheme(next);
    document.documentElement.style.setProperty(key, value);
  };

  const handleReset = (key: string) => {
    const next = { ...overrides };
    delete next[key];
    setOverrides(next);
    saveTheme(next);
    document.documentElement.style.removeProperty(key);
  };

  const handleResetAll = () => {
    setOverrides({});
    saveTheme({});
    clearOverrides();
  };

  const hasCustomColors = Object.keys(overrides).length > 0;

  return (
    <div className="settings-page">
      <h2 className="settings-page-title">Appearance</h2>
      <p className="settings-description">
        Customize the look and feel of OpenClaw Client. Changes are saved locally and applied instantly.
      </p>

      <div className="settings-divider" />

      <div className="settings-toggle-row">
        <div className="settings-toggle-info">
          <div className="settings-toggle-label">Default Theme</div>
          <div className="settings-toggle-desc">Use the built-in Discord dark theme colors</div>
        </div>
        <button
          className={`settings-toggle ${!isCustom ? "on" : ""}`}
          onClick={handleSetDefault}
        >
          <div className="settings-toggle-knob" />
        </button>
      </div>

      <div className="settings-toggle-row">
        <div className="settings-toggle-info">
          <div className="settings-toggle-label">Custom Theme</div>
          <div className="settings-toggle-desc">Override individual color variables with your own values</div>
        </div>
        <button
          className={`settings-toggle ${isCustom ? "on" : ""}`}
          onClick={handleSetCustom}
        >
          <div className="settings-toggle-knob" />
        </button>
      </div>

      {isCustom && (
        <>
          <div className="settings-divider" />

          <div className="settings-section-header-row">
            <h3 className="settings-section-title">Theme Colors</h3>
            {hasCustomColors && (
              <button className="settings-btn small" onClick={handleResetAll}>
                Reset All to Default
              </button>
            )}
          </div>
          <p className="settings-description">
            Override individual CSS color variables. Colors not set will use the default values.
          </p>

          <div className="settings-color-grid">
            {THEME_COLORS.map((c) => {
              const current = overrides[c.key] || c.default;
              const isOverridden = !!overrides[c.key];

              return (
                <div key={c.key} className="settings-color-item">
                  <div className="settings-color-label">{c.label}</div>
                  <div className="settings-color-input-row">
                    <input
                      type="text"
                      className="settings-color-text"
                      value={current}
                      onChange={(e) => handleColorChange(c.key, e.target.value)}
                      spellCheck={false}
                    />
                    <input
                      type="color"
                      className="settings-color-picker"
                      value={current}
                      onChange={(e) => handleColorChange(c.key, e.target.value)}
                    />
                    {isOverridden && (
                      <button
                        className="settings-color-reset"
                        onClick={() => handleReset(c.key)}
                        title="Reset to default"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12S7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12S8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

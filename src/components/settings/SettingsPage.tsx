import { useEffect } from "react";
import { useUIStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import ProfileSettings from "./ProfileSettings";
import AppearanceSettings from "./AppearanceSettings";

type PageId = "profile" | "appearance";

interface SidebarNavItem {
  id: PageId;
  label: string;
  icon: string;
}

interface SidebarSection {
  section: string;
}

type SidebarItem = SidebarNavItem | SidebarSection;

function isNavItem(item: SidebarItem): item is SidebarNavItem {
  return "id" in item;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { section: "USER SETTINGS" },
  { id: "profile", label: "My Account", icon: "M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" },
  { section: "APP SETTINGS" },
  { id: "appearance", label: "Appearance", icon: "M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2C17.51 2 22 6.49 22 12S17.51 22 12 22ZM18.92 8H15.97C15.65 6.75 15.19 5.55 14.59 4.44C16.43 5.07 17.96 6.35 18.92 8ZM12 4.04C11.17 5.24 10.53 6.57 10.1 8H13.9C13.47 6.57 12.83 5.24 12 4.04ZM4.26 14C4.1 13.36 4 12.69 4 12S4.1 10.64 4.26 10H7.64C7.56 10.66 7.5 11.32 7.5 12S7.56 13.34 7.64 14H4.26ZM5.08 16H8.03C8.35 17.25 8.81 18.45 9.41 19.56C7.57 18.93 6.04 17.66 5.08 16ZM8.03 8H5.08C6.04 6.34 7.57 5.07 9.41 4.44C8.81 5.55 8.35 6.75 8.03 8ZM12 19.96C12.83 18.76 13.47 17.43 13.9 16H10.1C10.53 17.43 11.17 18.76 12 19.96ZM14.34 14H9.66C9.57 13.34 9.5 12.68 9.5 12S9.57 10.65 9.66 10H14.34C14.43 10.65 14.5 11.32 14.5 12S14.43 13.34 14.34 14ZM14.59 19.56C15.19 18.45 15.65 17.25 15.97 16H18.92C17.96 17.65 16.43 18.93 14.59 19.56ZM16.36 14C16.44 13.34 16.5 12.68 16.5 12S16.44 10.66 16.36 10H19.74C19.9 10.64 20 11.31 20 12S19.9 13.36 19.74 14H16.36Z" },
];

export default function SettingsPage() {
  const settingsPage = useUIStore((s) => s.settingsPage);
  const closeSettings = useUIStore((s) => s.closeSettings);
  const openSettings = useUIStore((s) => s.openSettings);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeSettings]);

  if (!settingsPage) return null;

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
      <div className="settings-modal">
        <div className="settings-sidebar">
          <div className="settings-sidebar-scroll">
            {SIDEBAR_ITEMS.map((item, i) => {
              if (!isNavItem(item)) {
                return <div key={i} className="settings-sidebar-section">{item.section}</div>;
              }
              return (
                <button
                  key={item.id}
                  className={`settings-sidebar-item ${settingsPage === item.id ? "active" : ""}`}
                  onClick={() => openSettings(item.id)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </button>
              );
            })}

            <div className="settings-sidebar-separator" />

            <button className="settings-sidebar-item danger" onClick={logout}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 2H14C15.1 2 16 2.9 16 4V8H14V4H6V20H14V16H16V20C16 21.1 15.1 22 14 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2ZM16.56 12.56L13.12 16L12 14.88L13.88 13H8V11H13.88L12 9.12L13.12 8L16.56 11.44C16.84 11.72 16.84 12.28 16.56 12.56Z"/>
              </svg>
              Log Out
            </button>

            <div className="settings-sidebar-footer">
              <span className="settings-sidebar-version">OpenClaw Client v1.0.0</span>
            </div>
          </div>
        </div>

        <div className="settings-content">
          <div className="settings-content-scroll">
            {settingsPage === "profile" && <ProfileSettings />}
            {settingsPage === "appearance" && <AppearanceSettings />}
          </div>

          <button className="settings-close-btn" onClick={closeSettings} aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
            </svg>
            <div className="settings-close-keybind">ESC</div>
          </button>
        </div>
      </div>
    </div>
  );
}

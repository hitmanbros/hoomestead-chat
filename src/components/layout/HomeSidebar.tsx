import UserPanel from "../user/UserPanel";

export default function HomeSidebar() {
  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar-header">
        <span style={{ fontWeight: 600, color: "var(--header-primary)" }}>OpenClaw</span>
      </div>
      <div className="channel-list-container" />
      <UserPanel />
    </div>
  );
}

import { useState } from "react";
import type { SpaceInfo } from "../../api/commands";
import ContextMenu, { ContextMenuItem } from "../common/ContextMenu";
import { useToastStore } from "../../store/toastStore";

interface Props {
  space: SpaceInfo;
  isSelected: boolean;
  onClick: () => void;
  unreadCount?: number;
}

export default function ServerIcon({ space, isSelected, onClick, unreadCount = 0 }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const initials = (space.name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3);

  const hasUnread = unreadCount > 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: "Copy Server ID",
      onClick: () => {
        navigator.clipboard.writeText(space.room_id);
        addToast("success", "Server ID copied");
      },
    },
  ];

  return (
    <>
      <div
        className={`server-icon-wrapper ${isSelected ? "selected" : ""} ${hasUnread ? "has-unread" : ""}`}
        onContextMenu={handleContextMenu}
      >
        <div className="server-pill" />
        <div
          className={`server-icon ${isSelected ? "selected" : ""}`}
          onClick={onClick}
        >
          {space.avatar_url ? (
            <img src={space.avatar_url} alt={space.name || ""} />
          ) : (
            initials
          )}
        </div>
        {hasUnread && !isSelected && (
          <div className="server-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

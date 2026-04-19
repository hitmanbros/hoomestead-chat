import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState({ x, y });
  const readyRef = useRef(false);

  useEffect(() => {
    // Delay enabling close-on-click to prevent the opening event from immediately closing
    const timer = setTimeout(() => {
      readyRef.current = true;
    }, 50);

    const handleClick = (e: MouseEvent) => {
      if (!readyRef.current) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (!readyRef.current) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleEscape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Clamp menu position to viewport after it renders
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let ax = x;
    let ay = y;
    if (ax + rect.width > window.innerWidth) {
      ax = window.innerWidth - rect.width - 8;
    }
    if (ay + rect.height > window.innerHeight) {
      ay = window.innerHeight - rect.height - 8;
    }
    if (ax < 0) ax = 8;
    if (ay < 0) ay = 8;
    setAdjusted({ x: ax, y: ay });
  }, [x, y]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: adjusted.x,
    top: adjusted.y,
    zIndex: 15000,
  };

  return createPortal(
    <div className="context-menu" style={style} ref={menuRef}>
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="context-menu-divider" />
        ) : (
          <div
            key={i}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </div>
        ),
      )}
    </div>,
    document.body,
  );
}

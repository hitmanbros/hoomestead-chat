import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface Props {
  text: string;
  position?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}

export default function Tooltip({ text, position = "right", children }: Props) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let x = 0;
      let y = 0;
      switch (position) {
        case "right":
          x = rect.right + 12;
          y = rect.top + rect.height / 2;
          break;
        case "left":
          x = rect.left - 12;
          y = rect.top + rect.height / 2;
          break;
        case "top":
          x = rect.left + rect.width / 2;
          y = rect.top - 8;
          break;
        case "bottom":
          x = rect.left + rect.width / 2;
          y = rect.bottom + 8;
          break;
      }
      setCoords({ x, y });
      setVisible(true);
    }, 500);
  }, [position]);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const getStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "fixed",
      zIndex: 15000,
      pointerEvents: "none",
    };
    switch (position) {
      case "right":
        return { ...base, left: coords.x, top: coords.y, transform: "translateY(-50%)" };
      case "left":
        return { ...base, right: window.innerWidth - coords.x, top: coords.y, transform: "translateY(-50%)" };
      case "top":
        return { ...base, left: coords.x, bottom: window.innerHeight - coords.y, transform: "translateX(-50%)" };
      case "bottom":
        return { ...base, left: coords.x, top: coords.y, transform: "translateX(-50%)" };
      default:
        return base;
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible &&
        createPortal(
          <div className="tooltip" style={getStyle()}>
            {text}
          </div>,
          document.body,
        )}
    </div>
  );
}

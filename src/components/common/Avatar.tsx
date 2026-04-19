import { getUserColor } from "../../utils/userColors";

interface Props {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

export default function Avatar({ name, avatarUrl, size = 40, className }: Props) {
  const initial = name[0]?.toUpperCase() || "?";

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: getUserColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "white",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initial
      )}
    </div>
  );
}

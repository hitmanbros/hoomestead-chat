import { useMemberStore } from "../../store/memberStore";
import { useAuthStore } from "../../store/authStore";

function getDisplayName(userId: string): string {
  const colonIdx = userId.indexOf(":");
  if (colonIdx > 1 && userId.startsWith("@")) {
    return userId.slice(1, colonIdx);
  }
  return userId.startsWith("@") ? userId.slice(1) : userId;
}

export default function TypingIndicator() {
  const typingUsers = useMemberStore((s) => s.typingUsers);
  const currentUserId = useAuthStore((s) => s.user?.user_id);

  const others = typingUsers.filter((u) => u !== currentUserId);

  if (others.length === 0) return <div className="typing-indicator" />;

  const names = others.map(getDisplayName);
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = "Several people are typing...";
  }

  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span>{text}</span>
    </div>
  );
}

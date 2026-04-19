/**
 * Shared avatar color generation — ensures consistent colors across all components.
 * Uses the same hash + palette everywhere: messages, member list, voice tiles, etc.
 */

const AVATAR_COLORS = [
  "#f47b67", "#e9a050", "#45d1c2", "#5c9bf0", "#e879a8",
  "#f5c542", "#8bc34a", "#ce93d8", "#4fc3f7", "#ff8a65",
] as const;

/**
 * Normalize a Matrix user ID for consistent hashing.
 * Strips device ID suffix from LiveKit identities: @bryan:hoomestead.com:DeviceId -> @bryan:hoomestead.com
 */
function normalizeUserId(identifier: string): string {
  if (identifier.startsWith("@")) {
    // Matrix user ID format: @localpart:server — may have :deviceId appended by LiveKit
    const firstColon = identifier.indexOf(":");
    if (firstColon > 0) {
      const secondColon = identifier.indexOf(":", firstColon + 1);
      if (secondColon > 0) {
        // Has device ID suffix, strip it
        return identifier.slice(0, secondColon);
      }
    }
  }
  return identifier;
}

/** Get a consistent color for a user based on their ID/name. */
export function getUserColor(identifier: string): string {
  const normalized = normalizeUserId(identifier);
  const hash = normalized.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Extract readable display name from a Matrix user ID like @bryan:hoomestead.com or @bryan:hoomestead.com:DeviceId */
export function getDisplayName(userId: string, displayName?: string | null): string {
  if (displayName && !displayName.startsWith("@")) return displayName;
  const id = displayName || userId;
  const bare = id.startsWith("@") ? id.slice(1) : id;
  const colonIdx = bare.indexOf(":");
  return colonIdx > 0 ? bare.slice(0, colonIdx) : bare;
}

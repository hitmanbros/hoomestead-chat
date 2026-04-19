# OpenClaw Client — Change Log

All changes relative to the original `discord-matrix-clone-backup`.

---

## 2026-04-18 — Session 1: Rebranding + Voice/Video Removal

### Rebranding (DONE)
- `package.json` — name: `openclaw-client`, productName: `OpenClaw Client`
- `index.html` — title: `OpenClaw Client`
- `SettingsPage.tsx` — version label: `OpenClaw Client v1.0.0`
- `AppearanceSettings.tsx` — description mentions OpenClaw Client

### HOW-IT-WORKS.md — NEW FILE (DONE)
- Created comprehensive architecture reference doc covering:
  - Startup sequence (Electron → Rust backend → React frontend)
  - UI layout hierarchy (ServerSidebar → ChannelSidebar/HomeSidebar → MainContent → MemberSidebar)
  - State management (Zustand stores: auth, space, room, message, member, call, ui)
  - Message flow (send → POST → SSE broadcast → addMessage)
  - SSE events (new-message, typing, presence, reaction, member-change, call-member, sync-ready)
  - Backend REST routes
  - Rules for modifying the codebase

### HomeSidebar.tsx — Simplified to Dashboard Placeholder (DONE)
- Removed Friends tab, Discover tab, Direct Messages section
- Removed all imports except `UserPanel`
- Now shows "OpenClaw" header + empty container + UserPanel
- Was a full sidebar with friend list, discover button, DM list, unread counts

### ServerSidebar.tsx — Home Icon Changed (DONE)
- Replaced Discord logo SVG with house icon SVG
- Tooltip changed from "Direct Messages" to "Dashboard"
- onClick still goes to home (selectSpace(null), selectRoom(null))

### MainContent.tsx — Voice/Video Removed (DONE)
- Removed imports: `useCallStore`, `useToastStore`, `VoicePanel`
- Removed state: `connectedRoomId`, `connectionState`, `joinVoiceChannel`, `addToast`
- Removed VoicePanel rendering check (was: if connectedRoomId && selectedRoomId matches, show VoicePanel)
- Removed voice call button from channel header toolbar
- Removed video call button from channel header toolbar
- Kept: member list toggle button
- Kept: FriendsView/DiscoverView imports (dead code via HomeSidebar change, cleanup later)

### ChannelSidebar.tsx — Voice Features Removed (DONE)
- Removed imports: `VoiceChannelItem`, `VoiceStatusBar`, `useCallStore`
- Removed voice channel category from `categories` useMemo (was separate "Voice Channels" section)
- All rooms now render as `ChannelItem` only (no VoiceChannelItem)
- Removed `<VoiceStatusBar />` component from bottom of sidebar
- Removed "Create Voice Channel" from right-click context menu → now just "Create Channel"
- Changed `defaultChannelType` from `useState<"text" | "voice">("text")` to `useState<"text">("text")`
- Removed `setDefaultChannelType("text")` calls from server menu and category add button
- Removed `.voice-participant` from context menu guard (line 165)

### SettingsPage.tsx — Voice Tab Removed (DONE)
- Removed `VoiceSettings` import
- Removed `{ id: "voice", label: "Voice & Video", ... }` from SIDEBAR_ITEMS
- Removed `{settingsPage === "voice" && <VoiceSettings />}` render line
- PageId type narrowed from `"profile" | "appearance" | "voice"` to `"profile" | "appearance"`

### UserPanel.tsx — Mic/Deafen Buttons Removed (DONE)
- Removed `muted`/`deafened` useState hooks and toggle handlers
- Removed mic button and deafen button JSX (kept settings gear button only)
- Removed unused `useState` import

### AppLayout.tsx — onCallMember Removed (DONE)
- Removed `onCallMember` SSE listener (was lines 92-101)
- Removed `useCallStore` import
- Removed `onCallMember` from events import

### Dead Voice Files Deleted (DONE)
- Deleted `src/components/voice/VoicePanel.tsx`
- Deleted `src/components/voice/VoiceStatusBar.tsx`
- Deleted `src/components/settings/VoiceSettings.tsx`
- Deleted `src/components/channel/VoiceChannelItem.tsx`
- Confirmed no other files import these (grep clean)

### messages.css — Code Block Styling + Font Size (DONE)
- Font size: 16px → 14px to match Element
- Added `<pre><code>` styling: dark background box, monospace 13px, border, rounded corners
- Added inline `<code>` styling: subtle background, monospace
- Added `<blockquote>` styling: left border accent
- Added `<ol>`, `<ul>`, heading styles inside messages

### Typecheck: PASSES CLEAN (`npm run typecheck`)

### Still Alive (kept for now, not imported anywhere active)
- `src/store/callStore.ts` — voice-only store
- `src/api/events.ts` — still exports `onCallMember` (unused, harmless)

### OpenClaw Bot Config Fix (DONE)
- Bot was in a feedback loop: sending messages → seeing its own messages → responding → repeat → OOM kill
- Fix: `channels.matrix.allowBots: "mentions"` — ignores bot messages unless they @mention it
- Bryan's messages still trigger normally (no @ needed)
- Other bots can trigger it via @mention
- VPS SSH: `ssh -i ~/.ssh/vps_deploy -p 2222 root@REDACTED_VPS` (root user, not bryan)

### Not Yet Done
- [ ] (Optional) Delete callStore.ts and clean onCallMember from events.ts

### Reference
- Backup of original: `~/claudedir/discord-matrix-clone-backup/`
- Data dir (shared): `~/.local/share/com.hoomestead.chat/`
- Matrix homeserver: `matrix.example.com`
- User: `@user:example.com`

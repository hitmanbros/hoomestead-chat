# OpenClaw Client — How It Works

Reference doc for the app architecture. Read this before making changes.

## Architecture

```
Electron (frameless window)
  └─ spawns Rust backend (random port)
  └─ loads Vite frontend (localhost:1420)
  └─ preload.ts bridges port to frontend via IPC
```

- **Frontend**: React 19 + TypeScript + Vite + Zustand stores
- **Backend**: Rust (axum + matrix-sdk 0.10) → matrix.hoomestead.com
- **Communication**: HTTP REST + SSE (Server-Sent Events) on localhost
- **Data dir**: `~/.local/share/com.hoomestead.chat/` (session.json, SQLite stores)

## Startup Sequence

1. Electron starts → spawns Rust binary → backend listens on random port
2. Backend prints `{"port": N}` to stdout → Electron captures it
3. Preload.ts exposes `getBackendUrl()` → `http://127.0.0.1:N`
4. Frontend `App.tsx` calls `waitForBackendUrl()` then `restoreSession()`
5. Backend loads `session.json` → calls `client.matrix_auth().restore_session()`
6. Backend runs initial Matrix sync → emits `sync-ready` SSE event
7. Frontend receives `sync-ready` → calls `fetchSpaces()` → auto-selects first space
8. ChannelSidebar loads rooms for that space → auto-selects first room
9. Messages load, SSE streams real-time events

**CRITICAL**: Session restore is triggered by frontend POST to `/api/restore-session`. If this fails, app shows login screen. Both copies share the same data dir (`~/.local/share/com.hoomestead.chat/`), so running two backends simultaneously causes SQLite lock conflicts.

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│ TitleBar (frameless, custom minimize/maximize/close)     │
├────┬──────────┬──────────────────────────┬───────────────┤
│    │ Channel  │                          │ Member        │
│ S  │ Sidebar  │     MainContent          │ Sidebar       │
│ e  │          │                          │ (toggleable)  │
│ r  │ - header │  - channel header        │               │
│ v  │ - rooms  │  - MessageList           │ - role groups │
│ e  │   list   │  - TypingIndicator       │ - members     │
│ r  │          │  - MessageInput          │ - presence    │
│    │          │                          │               │
│ B  │          │                          │               │
│ a  ├──────────┤                          │               │
│ r  │ UserPanel│                          │               │
└────┴──────────┴──────────────────────────┴───────────────┘
```

### ServerSidebar (left icon bar)
- **Home icon** (top): `selectSpace(null)` → shows HomeSidebar
- **Space icons**: Each space = Discord server. Click → `selectSpace(id)` → shows ChannelSidebar
- **Add server button** (+): Create/join space
- Unread badges aggregate from rooms

### ChannelSidebar (when space selected)
- **Header**: Space name + dropdown menu (create channel, add existing, leave)
- **Categories**: Text Channels, Voice Channels (collapsible)
- **Room items**: `#channel-name` with unread badges
- **Voice channels**: Show connected participants
- **VoiceStatusBar**: Shows when in a voice call
- **UserPanel**: Avatar, name, mic/headphone/settings buttons

### HomeSidebar (when no space selected — home icon clicked)
- **Friends tab**: Shows friend list (online/all)
- **Discover tab**: Browse public spaces
- **Direct Messages**: List of DM conversations with unread badges
- **New DM button**: Create DM by Matrix user ID

### MainContent
- **If no room selected**: Empty state or FriendsView/DiscoverView
- **If room selected**: Channel header + MessageList + TypingIndicator + MessageInput
- **If voice connected**: VoicePanel (video grid + controls)

### MemberSidebar (right, toggleable)
- Groups by role (Server Admin, Members)
- Shows presence (online/offline dot)
- Right-click for admin actions (kick, ban, power level)

## State Management (Zustand Stores)

| Store | File | Key State |
|-------|------|-----------|
| authStore | `store/authStore.ts` | `isLoggedIn`, `user`, `isRestoring` |
| spaceStore | `store/spaceStore.ts` | `spaces[]`, `selectedSpaceId` |
| roomStore | `store/roomStore.ts` | `rooms[]`, `dmRooms[]`, `selectedRoomId`, `spaceUnreadCounts` |
| messageStore | `store/messageStore.ts` | `messagesByRoom{}`, `paginationByRoom{}` |
| memberStore | `store/memberStore.ts` | `members[]`, `typingUsers[]` |
| callStore | `store/callStore.ts` | `connectedRoomId`, `participants[]`, `isMuted`, `isCameraOn` |
| uiStore | `store/uiStore.ts` | `showMemberSidebar`, `homeView`, `settingsPage` |

## Room/Space Selection Flow

```
User clicks space icon in ServerSidebar
  → selectSpace(spaceId)
  → selectRoom(null)
  → AppLayout renders ChannelSidebar
  → ChannelSidebar.useEffect fetches rooms for space
  → Auto-selects first room
  → fetchMessages(roomId) + fetchMembers(roomId)
  → MainContent renders chat
```

## Messages

### Sending
- User types in MessageInput textarea
- Enter sends (Shift+Enter for newline)
- `sendMessage(roomId, body, replyTo?)` → POST `/api/rooms/{id}/messages`
- Typing indicator: POST `/api/rooms/{id}/typing` while typing

### Receiving
- SSE `new-message` event → `addMessage(roomId, message)` in store
- MessageList auto-scrolls to bottom

### Rendering (Message.tsx)
- `formatted_body` → sanitized HTML via DOMPurify
- `msg_type: "image"` → `<img src={media_url}>`
- `msg_type: "file"` → link with filename
- Reactions: emoji groups with counts
- Replies: preview bar above message
- Hover actions: react, reply, more menu

### Pagination
- Infinite scroll: fetches older messages when scrolled to top
- Uses `endToken` from previous fetch for cursor pagination

## Media/Files

### Upload
- Click upload button in MessageInput → file picker
- POST `/api/rooms/{id}/upload` as multipart form data
- Backend uploads to Matrix media repo → returns mxc:// URL
- Appears as image or file message in chat

### Display
- `media_url` field on messages = direct HTTP URL
- Images rendered inline, files as download links
- Avatar upload: POST `/api/avatar` with image file

## Real-Time Events (SSE)

Frontend connects to `GET /api/events` → EventSource stream.

| Event | Data | Handler |
|-------|------|---------|
| `new-message` | `{room_id, message}` | `addMessage()` |
| `typing` | `{room_id, user_ids[]}` | `setTypingUsers()` |
| `presence-update` | `{user_id, presence}` | `updatePresence()` |
| `reaction` | `{room_id, event_id, relates_to, sender, key}` | `addReaction()` |
| `member-change` | `{room_id, user_id, membership}` | `fetchMembers()` |
| `call-member` | `{room_id, user_id, action}` | `addVoiceMember()` |
| `sync-ready` | (empty) | `fetchSpaces()` + auto-select |

All listeners registered in AppLayout.tsx useEffect (lines 37-103).

## Voice/Video (LiveKit)

- Join: POST `/api/rooms/{id}/voice/join` → `{url, token}`
- Connect to LiveKit room with token
- Audio enabled by default, camera off
- Controls: mute, deafen, camera, screen share
- Participants rendered as video tiles in VoicePanel
- Uses `livekit-client` library for WebRTC

## Key Backend Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/login` | POST | Username/password auth |
| `/api/restore-session` | POST | Load session from disk |
| `/api/logout` | POST | Clear session |
| `/api/spaces` | GET | List spaces |
| `/api/spaces/{id}/rooms` | GET | Rooms in space |
| `/api/direct-rooms` | GET | List DMs |
| `/api/rooms` | POST | Create room |
| `/api/rooms/{id}/messages` | GET/POST | List/send messages |
| `/api/rooms/{id}/upload` | POST | Upload file/image |
| `/api/rooms/{id}/members` | GET | Member list |
| `/api/rooms/{id}/typing` | POST | Typing indicator |
| `/api/rooms/{id}/reactions` | POST | Send reaction |
| `/api/rooms/{id}/voice/join` | POST | Get LiveKit token |
| `/api/events` | GET | SSE event stream |
| `/api/media` | GET | mxc:// to http:// |

## Key Files

### Frontend
- `src/App.tsx` — Entry, auth flow, session restore
- `src/api/commands.ts` — All API client functions
- `src/api/transport.ts` — HTTP fetch wrapper, backend URL detection
- `src/api/events.ts` — SSE connection + event listeners
- `src/components/layout/AppLayout.tsx` — Main layout, event wiring
- `src/components/layout/ServerSidebar.tsx` — Space/home icon bar
- `src/components/layout/ChannelSidebar.tsx` — Rooms in a space
- `src/components/layout/HomeSidebar.tsx` — Friends, Discover, DMs
- `src/components/layout/MainContent.tsx` — Chat/voice/empty views
- `src/components/chat/Message.tsx` — Single message render
- `src/components/chat/MessageInput.tsx` — Input + file upload

### Backend
- `src-rust/src/main.rs` — Server startup, all route definitions
- `src-rust/src/auth.rs` — Login, session restore, encryption
- `src-rust/src/sync.rs` — Matrix event loop → SSE broadcast
- `src-rust/src/sse.rs` — SSE handler
- `src-rust/src/models.rs` — Data structures

### Electron
- `electron/main.ts` — Window creation, backend spawning, IPC
- `electron/preload.ts` — Bridge backend URL to renderer

## Rules for Modifying

1. **Never run two backends** — they share SQLite at `~/.local/share/com.hoomestead.chat/`. Kill old before starting new.
2. **Session restore is frontend-triggered** — backend doesn't auto-restore. Frontend calls POST `/api/restore-session` on startup.
3. **Spaces are required** — rooms belong to spaces. No space = no rooms in ChannelSidebar.
4. **SSE drives all real-time** — new messages, typing, presence all come through `/api/events`.
5. **Typecheck before testing** — `npx tsc --noEmit -p tsconfig.json` catches errors before Vite hot-reload breaks.
6. **HomeSidebar vs ChannelSidebar** — controlled by `selectedSpaceId` in AppLayout line 110. Null = Home, truthy = Channel.
7. **Vite hot-reloads** — changes to src/ files auto-update in Electron without restart. Electron/main.ts changes need full restart.

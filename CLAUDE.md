# OpenClaw Client - AI Agent Dashboard with Matrix Backend

## Overview
Desktop chat app (Electron + Rust sidecar + React 19 + matrix-sdk 0.10) that replicates Discord's UI using Matrix as the backend. Matrix spaces = Discord servers, Matrix rooms = Discord channels.

## Architecture
- **Desktop Shell**: Electron (frameless window, custom titlebar)
- **Backend**: Rust HTTP server (axum) + matrix-sdk → communicates with `matrix.hoomestead.com`
- **Communication**: HTTP REST + SSE (Server-Sent Events) on localhost
- **Frontend**: React 19 + TypeScript + Vite, styled with custom Discord-theme CSS
- **State**: Zustand stores (auth, spaces, rooms, messages, members)
- **Real-time**: SSE streams Matrix sync events to frontend

## Key Commands
```bash
# Dev (frontend only, needs Rust backend running separately)
npm run dev

# Dev (full Electron + frontend)
npm run dev:electron

# Build Rust backend
cd src-rust && cargo build --release

# Build frontend
npm run build

# Package for distribution
npm run package

# Typecheck frontend
npm run typecheck
```

## Project Structure
- `electron/` — Electron main process + preload script
- `src-rust/` — Rust HTTP backend (axum, matrix-sdk)
- `src/` — React frontend
  - `api/` — HTTP fetch wrappers (`transport.ts`, `commands.ts`) and SSE events (`events.ts`)
  - `store/` — Zustand state stores
  - `components/` — React components (layout, server, channel, chat, member, user, common)
  - `styles/` — Discord dark theme CSS

## Matrix Server
- Homeserver: `matrix.hoomestead.com`
- User: `@bryan:hoomestead.com`

## Build Output
- `dist/` — built frontend (Vite output, loaded by Electron in production)
- `dist-electron/` — compiled Electron main + preload (TypeScript -> JS)
- `release/` — electron-builder output: `linux-unpacked/`, `openclaw-client_1.0.0_amd64.deb`, `latest-linux.yml` (electron-updater metadata)
- `src-rust/target/release/openclaw-client-backend` — Rust sidecar binary, bundled via `extraResources` in package.json

## Startup sequence (see HOW-IT-WORKS.md for detail)
1. Electron spawns Rust sidecar. Awaits `{"port": N}` JSON on stdout (**10s timeout** — else app quits).
2. Sidecar binds random port, prints port, starts axum + matrix-sdk.
3. Preload exposes `window.api.getBackendUrl()`.
4. React `App.tsx` → `waitForBackendUrl()` → `restoreSession()` → opens SSE stream.
5. Frontend renders only after `sync-ready` SSE event fires (initial Matrix sync complete).

## Fixed: blank screen on packaged launch (2026-04-18)
**Cause:** Vite default `base: "/"` emits absolute asset paths in `dist/index.html` (`src="/assets/..."`). Electron loads via `file://` so `/assets/...` resolves to filesystem root → 404 → React never mounts → blank window (just `backgroundColor: #1e1f22`, no titlebar).
**Fix:** Set `base: "./"` in `vite.config.ts`. Now emits `./assets/...` which resolves relative to `index.html`.
Always keep this when packaging a Vite frontend into Electron.

## Shared data dir
`~/.local/share/com.hoomestead.chat/` — SQLite DB + Matrix session. Running two backends (dev + packaged) causes SQLite lock collision. Close one first.

## Bot interaction
`allowBots` setting default `"mentions"` — bots only respond to `@botname`. Prevents OpenClaw agent feedback loops.

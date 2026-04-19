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

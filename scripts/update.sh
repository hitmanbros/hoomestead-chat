#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "Pulling latest changes..."
git pull origin main

echo "Rebuilding Rust backend..."
cd src-rust
cargo build --release 2>&1
cd ..

echo "Rebuilding frontend..."
npm run build 2>&1
npm run build:electron 2>&1

echo "Update complete"

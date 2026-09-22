#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-start}"
if [ "$#" -gt 1 ]; then
  printf '%s\n' 'Usage: bash sreon.sh [start|build|help]' >&2
  exit 2
fi
case "$ACTION" in
  help|-h|--help)
    printf '%s\n' 'Sreon native Mac app' 'bash sreon.sh          Open an existing app, or build it once if needed' 'bash sreon.sh build    Build a fresh native app and open it' 'The installed app needs no Docker, Node, Rust, terminal, or localhost server.'
    exit 0 ;;
  start|build) ;;
  *) printf '%s\n' 'Usage: bash sreon.sh [start|build|help]' >&2; exit 2 ;;
esac
if [ "$(uname -s)" != Darwin ]; then
  printf '%s\n' 'This launcher builds the macOS app. Run it on your Mac, or download the Mac build from GitHub Actions.' >&2
  exit 1
fi
if [ "$ACTION" = start ]; then
  for app in "$ROOT/src-tauri/target/release/bundle/macos/Sreon.app" "$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/Sreon.app" /Applications/Sreon.app "$HOME/Applications/Sreon.app"; do
    if [ -d "$app" ]; then
      open "$app"
      exit 0
    fi
  done
fi
if ! xcode-select -p >/dev/null 2>&1; then
  printf '%s\n' 'Install Apple’s build tools with: xcode-select --install' 'Then run this command again.' >&2
  exit 1
fi
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi
if ! command -v cargo >/dev/null 2>&1; then
  printf '%s\n' 'Building requires Rust. Install it from https://rustup.rs, then open a new terminal.' 'A downloaded Sreon.app does not require Rust.' >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Building requires Node.js 22 or newer from https://nodejs.org.' 'A downloaded Sreon.app does not require Node.' >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  printf '%s\n' 'Update Node.js to version 22 or newer before building.' >&2
  exit 1
fi
cd "$ROOT"
printf '%s\n' 'Building Sreon’s native Rust app. The first build can take several minutes.'
npm ci
npm run desktop:build -- --bundles app
APP="$ROOT/src-tauri/target/release/bundle/macos/Sreon.app"
if [ ! -d "$APP" ]; then
  printf '%s\n' 'The expected app bundle was not created. Review the build output above.' >&2
  exit 1
fi
printf '\nBuilt: %s\nDrag Sreon.app into Applications to keep it in your Dock.\n' "$APP"
open "$APP"

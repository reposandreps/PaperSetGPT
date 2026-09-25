#!/bin/bash
set -euo pipefail

MODE="production"
for arg in "$@"; do
  case "$arg" in
    --qualify)
      MODE="qualification"
      ;;
    *)
      echo "usage: $0 [--qualify]" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BRAVE_APP="${PAPERSET_BRAVE_APP:-/Applications/Brave Browser.app}"
BRAVE_BIN="$BRAVE_APP/Contents/MacOS/Brave Browser"
BRAVE_ROOT="${PAPERSET_BRAVE_ROOT:-$HOME/Library/Application Support/BraveSoftware/Brave-Browser}"
PROFILE="${PAPERSET_PROFILE_DIRECTORY:-}"
QA_ROOT="${PAPERSET_QA_ROOT:-$HOME/Library/Application Support/BraveSoftware/PaperSetGPT-QA}"
QA_PROFILE="${PAPERSET_QA_PROFILE_DIRECTORY:-Default}"
URL="${PAPERSET_URL:-https://chatgpt.com/}"
PORT="${PAPERSET_CDP_PORT:-9229}"
LOG_DIR="${PAPERSET_LOG_DIR:-$HOME/Library/Logs/PaperSetGPT-QA}"
LOG_FILE="$LOG_DIR/brave.log"
EXTENSION_DIR="$REPO_ROOT/extension"
THEME_DIR="$REPO_ROOT/browser-theme"

[[ -x "$BRAVE_BIN" ]] || { echo "Brave not found at $BRAVE_BIN" >&2; exit 1; }
mkdir -p "$LOG_DIR"

if [[ "$MODE" == "qualification" ]]; then
  ACTIVE_ROOT="$QA_ROOT"
  ACTIVE_PROFILE="$QA_PROFILE"
  ACTIVE_PROFILE_ROOT="$QA_ROOT/$QA_PROFILE"

  [[ -f "$ACTIVE_PROFILE_ROOT/Preferences" ]] || {
    echo "ChatGPT Brave QA profile not found at $ACTIVE_PROFILE_ROOT" >&2
    echo "The retained isolated QA root is required for qualification; see docs/setup.md" >&2
    exit 1
  }
  [[ -f "$EXTENSION_DIR/manifest.json" ]] || { echo "Extension manifest missing at $EXTENSION_DIR" >&2; exit 1; }
  [[ -f "$THEME_DIR/manifest.json" ]] || { echo "Browser theme manifest missing at $THEME_DIR" >&2; exit 1; }

  if ps -axo command= | grep -F -- "--user-data-dir=$QA_ROOT" | grep -v grep >/dev/null 2>&1; then
    echo "A ChatGPT Brave QA browser is already using $QA_ROOT" >&2
    exit 3
  fi
  if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
    echo "A qualification browser is already listening on 127.0.0.1:$PORT" >&2
    exit 3
  fi

  # Chromium caches unpacked theme compilation. Rebuild it for each QA launch so
  # current manifest colours are what the qualification window actually renders.
  rm -f "$THEME_DIR/Cached Theme.pak"

  args=(
    --user-data-dir="$QA_ROOT"
    --profile-directory="$QA_PROFILE"
    --no-first-run
    --no-default-browser-check
    --new-window
    --load-extension="$EXTENSION_DIR,$THEME_DIR"
    --remote-debugging-address=127.0.0.1
    --remote-debugging-port="$PORT"
    "$URL"
  )
else
  if [[ -z "$PROFILE" && -f "$BRAVE_ROOT/Local State" ]]; then
    PROFILE="$(
      PAPERSET_DETECT_ROOT="$BRAVE_ROOT" node - <<'NODE'
const fs = require("fs");
const path = require("path");
try {
  const state = JSON.parse(
    fs.readFileSync(path.join(process.env.PAPERSET_DETECT_ROOT, "Local State"), "utf8")
  );
  const matches = Object.entries(state?.profile?.info_cache || {})
    .filter(([, meta]) => meta?.name === "ChatGPT")
    .map(([directory]) => directory);
  if (matches.length === 1) process.stdout.write(matches[0]);
} catch {}
NODE
    )"
  fi
  PROFILE="${PROFILE:-ChatGPT}"

  ACTIVE_ROOT="$BRAVE_ROOT"
  ACTIVE_PROFILE="$PROFILE"
  ACTIVE_PROFILE_ROOT="$BRAVE_ROOT/$PROFILE"

  [[ -f "$ACTIVE_PROFILE_ROOT/Preferences" ]] || {
    echo "ChatGPT Brave profile not found at $ACTIVE_PROFILE_ROOT" >&2
    echo "Create/install the normal Brave profile first; see docs/setup.md" >&2
    exit 1
  }

  args=(
    --profile-directory="$PROFILE"
    --no-first-run
    --no-default-browser-check
    --new-window
    "$URL"
  )
  if [[ -n "${PAPERSET_BRAVE_ROOT:-}" ]]; then
    args=(--user-data-dir="$BRAVE_ROOT" "${args[@]}")
  fi
fi

nohup "$BRAVE_BIN" "${args[@]}" >"$LOG_FILE" 2>&1 &
launcher_pid=$!

if [[ "$MODE" == "qualification" ]]; then
  for _ in {1..60}; do
    if curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
      browser_version="$(curl -fsS "http://127.0.0.1:$PORT/json/version" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("Browser", "unknown"))')"
      printf 'pid=%s\nmode=%s\nprofile_directory=%s\nbrave_root=%s\ncdp=http://127.0.0.1:%s\nbrowser=%s\n' \
        "$launcher_pid" "$MODE" "$ACTIVE_PROFILE" "$ACTIVE_ROOT" "$PORT" "$browser_version"
      exit 0
    fi
    sleep 0.2
  done
  echo "Brave started as PID $launcher_pid but CDP was not ready; see $LOG_FILE" >&2
  exit 4
fi

printf 'launcher_pid=%s\nmode=%s\nprofile_directory=%s\nbrave_root=%s\n' \
  "$launcher_pid" "$MODE" "$ACTIVE_PROFILE" "$ACTIVE_ROOT"

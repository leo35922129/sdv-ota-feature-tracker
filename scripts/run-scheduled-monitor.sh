#!/bin/bash
# Keep Tesla/Rivian OTA data fresh even when `npm start` is not running.
# Safe to overlap with the in-server monitor loop (monitor.mjs uses a lock).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${HOME}/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${PATH}"

cd "$ROOT"
exec node scripts/monitor.mjs

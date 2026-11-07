#!/bin/bash
# Install a macOS LaunchAgent that polls Tesla + Rivian OTA sources every 30 min.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.lei.sdv-ota-feature-tracker.monitor"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
RUNNER="${ROOT}/scripts/run-scheduled-monitor.sh"
LOG_DIR="${ROOT}/data"
OUT_LOG="${LOG_DIR}/monitor-launchd.out.log"
ERR_LOG="${LOG_DIR}/monitor-launchd.err.log"

chmod +x "$RUNNER"
mkdir -p "${HOME}/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${HOME}/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true

echo "Installed ${LABEL}"
echo "  plist: ${PLIST}"
echo "  interval: every 30 minutes (+ on login/load)"
echo "  logs: ${OUT_LOG}"
echo "        ${ERR_LOG}"

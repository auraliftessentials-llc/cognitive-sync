/**
 * GET /api/public/bridge-install?code=ABCD1234
 *
 * One-paste installer for macOS / Linux. Usage:
 *
 *   curl -sSL https://cognitivesync.io/api/public/bridge-install?code=ABCD1234 | bash
 *
 * What it does (idempotent — safe to re-run):
 *   1. mkdir -p ~/.merkabah && chmod 700
 *   2. download daemon to ~/.merkabah/merkabah-bridge.mjs
 *   3. pair using the supplied code
 *   4. install a LaunchAgent (macOS) or systemd --user unit (Linux) that
 *      auto-starts the daemon at login and restarts it on crash
 *   5. start it now
 *
 * Pass ?code=… to pair. Without a code, it just installs/updates the binary
 * and re-launches the existing pairing.
 */
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = (host: string) => `#!/usr/bin/env bash
# Merkabah Bridge — sovereign one-paste installer
set -euo pipefail

HOST="${host}"
CODE="\${CODE:-}"
DIR="\$HOME/.merkabah"
BIN="\$DIR/merkabah-bridge.mjs"
LOG="\$DIR/bridge.log"

bold() { printf "\\033[1m%s\\033[0m\\n" "\$1"; }
ok()   { printf "\\033[32m✓\\033[0m %s\\n" "\$1"; }
warn() { printf "\\033[33m!\\033[0m %s\\n" "\$1"; }
die()  { printf "\\033[31m✗ %s\\033[0m\\n" "\$1" >&2; exit 1; }

bold "Merkabah Bridge installer"

command -v node >/dev/null 2>&1 || die "node is required (https://nodejs.org). Install Node 18+ then re-run."
NODE_BIN="\$(command -v node)"

mkdir -p "\$DIR"; chmod 700 "\$DIR"
ok "workspace ready: \$DIR"

# 1. Download/refresh daemon
curl -fsSL "\$HOST/api/public/bridge-daemon" -o "\$BIN.new"
mv "\$BIN.new" "\$BIN"
chmod 700 "\$BIN"
ok "daemon installed (\$(wc -c <"\$BIN") bytes)"

# 2. Pair if code provided and not already paired
if [ -n "\$CODE" ]; then
  MERKABAH_HOST="\$HOST" "\$NODE_BIN" "\$BIN" pair "\$CODE"
elif [ ! -f "\$DIR/bridge.json" ]; then
  warn "no pairing code passed and no existing pairing. Run again with CODE=XXXXXXXX or pair manually:"
  echo "  MERKABAH_HOST=\$HOST node \$BIN pair <CODE>"
fi

# 3. Install autostart
PLATFORM="\$(uname -s)"
if [ "\$PLATFORM" = "Darwin" ]; then
  PLIST="\$HOME/Library/LaunchAgents/io.cognitivesync.bridge.plist"
  mkdir -p "\$HOME/Library/LaunchAgents"
  cat > "\$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.cognitivesync.bridge</string>
  <key>ProgramArguments</key><array>
    <string>\$NODE_BIN</string>
    <string>\$BIN</string>
    <string>serve</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>MERKABAH_HOST</key><string>\$HOST</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>\$LOG</string>
  <key>StandardErrorPath</key><string>\$LOG</string>
  <key>ThrottleInterval</key><integer>5</integer>
</dict></plist>
PLIST
  launchctl unload "\$PLIST" 2>/dev/null || true
  launchctl load "\$PLIST"
  ok "LaunchAgent installed: \$PLIST (auto-start at login, auto-restart on crash)"
elif [ "\$PLATFORM" = "Linux" ]; then
  UNIT_DIR="\$HOME/.config/systemd/user"
  mkdir -p "\$UNIT_DIR"
  cat > "\$UNIT_DIR/merkabah-bridge.service" <<UNIT
[Unit]
Description=Merkabah Bridge daemon
After=network-online.target

[Service]
Environment=MERKABAH_HOST=\$HOST
ExecStart=\$NODE_BIN \$BIN serve
Restart=always
RestartSec=5
StandardOutput=append:\$LOG
StandardError=append:\$LOG

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now merkabah-bridge.service
  ok "systemd --user unit installed and started"
else
  warn "auto-start not configured for \$PLATFORM. Run manually: node \$BIN serve"
fi

bold "Done. Tail the log with:  tail -f \$LOG"
`;

export const Route = createFileRoute("/api/public/bridge-install")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const host = `${url.protocol}//${url.host}`;
        return new Response(SCRIPT(host), {
          status: 200,
          headers: {
            "Content-Type": "text/x-shellscript; charset=utf-8",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});

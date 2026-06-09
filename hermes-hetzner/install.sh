#!/usr/bin/env bash
#
# install.sh — Provision Hermes Agent on a Hetzner (Ubuntu/Debian) server.
#
# What it does (idempotent — safe to re-run):
#   1. Installs the only prerequisite the Hermes installer needs: git + curl.
#   2. Creates a dedicated, non-login `hermes` system user (no root for the agent).
#   3. Installs Hermes Agent as that user via the official one-line installer.
#   4. Installs a hardened systemd service so the gateway survives reboots.
#
# It deliberately does NOT run the interactive wizards (`hermes setup`,
# `hermes model`, `hermes gateway setup`) — those need your API key and Slack
# tokens. Run them yourself after this script, then start the service.
# See README.md for the full runbook.
#
# Usage:  sudo bash install.sh
#
set -euo pipefail

HERMES_USER="hermes"
HERMES_HOME="/home/${HERMES_USER}"
HERMES_BIN="${HERMES_HOME}/.local/bin/hermes"
SERVICE_NAME="hermes-gateway"
SERVICE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/${SERVICE_NAME}.service"

log()  { printf '\033[1;32m[hermes-install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[hermes-install]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[hermes-install] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash install.sh"

# --- 1. Prerequisites ---------------------------------------------------------
log "Installing prerequisites (git, curl, ca-certificates)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates sudo >/dev/null
log "git: $(git --version)"

# --- 2. Dedicated service user ------------------------------------------------
if id "${HERMES_USER}" &>/dev/null; then
  log "User '${HERMES_USER}' already exists — skipping."
else
  log "Creating system user '${HERMES_USER}'…"
  # --create-home so the installer has ~/.local; --shell /bin/bash so you can
  # `sudo -iu hermes` to run the interactive wizards.
  useradd --create-home --shell /bin/bash --comment "Hermes Agent" "${HERMES_USER}"
fi

# --- 3. Install Hermes Agent as the hermes user -------------------------------
if [ -x "${HERMES_BIN}" ]; then
  log "Hermes already installed at ${HERMES_BIN} — skipping installer."
  log "  (To upgrade later: sudo -iu ${HERMES_USER} hermes update)"
else
  log "Running the official Hermes installer as '${HERMES_USER}'…"
  # The installer pulls Python, Node.js, ripgrep, ffmpeg, clones the repo,
  # builds a venv, and symlinks ~/.local/bin/hermes.
  sudo -iu "${HERMES_USER}" bash -c \
    'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'
  [ -x "${HERMES_BIN}" ] || die "Installer finished but ${HERMES_BIN} is missing. Check the output above."
  log "Hermes installed: $(sudo -iu "${HERMES_USER}" hermes --version 2>/dev/null || echo 'installed')"
fi

# Ensure the data dir exists with the right ownership before the wizards run.
install -d -o "${HERMES_USER}" -g "${HERMES_USER}" -m 700 "${HERMES_HOME}/.hermes"

# --- 4. systemd service -------------------------------------------------------
if [ -f "${SERVICE_SRC}" ]; then
  log "Installing systemd unit → /etc/systemd/system/${SERVICE_NAME}.service"
  install -m 644 "${SERVICE_SRC}" "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  # Enable (start on boot) but DON'T start yet — there's no config to run on.
  systemctl enable "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
  log "Service enabled (will start on boot). Not started yet — configure first."
else
  warn "Service file ${SERVICE_SRC} not found; skipping systemd setup."
fi

# --- Done ---------------------------------------------------------------------
cat <<EOF

$(log "Base install complete. Next steps (interactive):")

  1. Switch to the hermes user:
       sudo -iu ${HERMES_USER}

  2. Pick Claude as the model and paste your Anthropic API key:
       hermes setup        # or: hermes model
       hermes config set ANTHROPIC_API_KEY sk-ant-...

  3. Connect Slack (have your xoxb- and xapp- tokens + member ID ready):
       hermes gateway setup

  4. Sanity-check it works, then exit back to root:
       hermes            # CLI chat — type 'hi', Ctrl-C to quit
       exit

  5. Start the always-on gateway service:
       sudo systemctl start ${SERVICE_NAME}
       sudo systemctl status ${SERVICE_NAME} --no-pager
       journalctl -u ${SERVICE_NAME} -f       # live logs

See README.md for the full Slack app setup (scopes, Socket Mode, tokens).
EOF

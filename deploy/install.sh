#!/usr/bin/env bash
#
# Install or update the mc-hammer portal as a systemd service on Debian/Ubuntu.
#
#   sudo ./deploy/install.sh
#
# Re-run it to deploy a new build; it is idempotent and never touches the
# contents of the servers/ directory.
#
# Defaults can be overridden with environment variables (keep sudo -E):
#
#   MC_HAMMER_DIR=/srv/mc-hammer MC_HAMMER_USER=mc MC_HAMMER_PORT=9000 sudo -E ./deploy/install.sh
#
set -euo pipefail

INSTALL_DIR="${MC_HAMMER_DIR:-/opt/mc-hammer}"
SERVICE_USER="${MC_HAMMER_USER:-mchammer}"
PORT="${MC_HAMMER_PORT:-80}"
SERVICE_NAME="mc-hammer"
DEFAULTS_FILE="/etc/default/${SERVICE_NAME}"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
    echo "error: must run as root, e.g. sudo $0" >&2
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "error: systemctl not found; this script targets systemd hosts" >&2
    exit 1
fi

# --- toolchain -------------------------------------------------------------

GO_BIN="${GO:-}"
if [ -z "$GO_BIN" ]; then
    if command -v go >/dev/null 2>&1; then
        GO_BIN="$(command -v go)"
    elif [ -x /usr/local/go/bin/go ]; then
        GO_BIN=/usr/local/go/bin/go
    else
        echo "error: no go toolchain found (looked in PATH and /usr/local/go/bin)" >&2
        echo "       install Go, or set GO=/path/to/go" >&2
        exit 1
    fi
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "warning: docker not found on PATH; the portal cannot manage servers without it" >&2
elif ! docker compose version >/dev/null 2>&1; then
    echo "warning: 'docker compose' unavailable; install the docker-compose-plugin package" >&2
fi

# --- service user ----------------------------------------------------------

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    echo "creating system user $SERVICE_USER"
    useradd --system --user-group --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$SERVICE_USER"
else
    echo "warning: no 'docker' group on this host; $SERVICE_USER will not be able to reach the docker socket" >&2
fi

# --- build -----------------------------------------------------------------

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "building mc-hammer with $GO_BIN"
(cd "$REPO_DIR" && "$GO_BIN" build -o "$BUILD_DIR/mc-hammer" ./cmd/portal)

# --- install ---------------------------------------------------------------

# Only the top-level servers/ dir is created and chowned. Its contents are left
# alone on purpose: the Minecraft containers write into data/ as their own uid,
# and a recursive chown here would lock them out of their own worlds.
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$INSTALL_DIR" "$INSTALL_DIR/servers"

if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "stopping $SERVICE_NAME"
    systemctl stop "$SERVICE_NAME"
fi

install -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0755 "$BUILD_DIR/mc-hammer" "$INSTALL_DIR/mc-hammer"

if [ "$REPO_DIR" = "$INSTALL_DIR" ]; then
    echo "repo checkout is the install dir; leaving web/ in place"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/web"
else
    echo "installing static assets into $INSTALL_DIR/web"
    rm -rf "$INSTALL_DIR/web"
    cp -R "$REPO_DIR/web" "$INSTALL_DIR/web"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/web"
fi

if [ -f "$DEFAULTS_FILE" ]; then
    echo "keeping existing $DEFAULTS_FILE (it overrides MC_HAMMER_PORT=$PORT)"
else
    cat > "$DEFAULTS_FILE" <<EOF
# Options for the mc-hammer portal. Edit, then: systemctl restart $SERVICE_NAME
MC_HAMMER_PORT=$PORT
EOF
fi

echo "writing $UNIT_FILE"
sed -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" \
    -e "s|@USER@|$SERVICE_USER|g" \
    -e "s|@PORT@|$PORT|g" \
    "$REPO_DIR/deploy/mc-hammer.service" > "$UNIT_FILE"
chmod 0644 "$UNIT_FILE"

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo
echo "mc-hammer is installed in $INSTALL_DIR and enabled at boot."
echo "  status:  systemctl status $SERVICE_NAME"
echo "  logs:    journalctl -u $SERVICE_NAME -f"
echo "  portal:  http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"

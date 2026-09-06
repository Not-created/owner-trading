#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# OWNER TRADING
# Single-command deployment
# ============================================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

APP_NAME="owner-trading"
VENV_DIR="${APP_DIR}/.venv"
DIST_DIR="${APP_DIR}/dist"

log() {
  printf '\n[OWNER-TRADING] %s\n' "$1"
}

fail() {
  printf '\n[OWNER-TRADING][ERROR] %s\n' "$1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# ============================================================
# 1. PREFLIGHT
# ============================================================

log "Running preflight checks..."

command_exists node || fail "Node.js is required."
command_exists npm || fail "npm is required."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"

if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  fail "Node.js 20 or newer is required. Current version: $(node --version)"
fi

[[ -f "package.json" ]] \
  || fail "package.json not found."

[[ -f "public/index.html" ]] \
  || fail "public/index.html not found."

[[ -f "src/index.jsx" ]] \
  || fail "src/index.jsx not found."

[[ -f "src/App.jsx" ]] \
  || fail "src/App.jsx not found."

log "Node: $(node --version)"
log "npm : $(npm --version)"

# ============================================================
# 2. PROTECTED FILES
# ============================================================

log "Checking protected configuration..."

for file in \
  ".env" \
  ".env.local" \
  ".env.production"
do
  if [[ -f "$file" ]]; then
    log "Preserving existing $file"
  fi
done

# This script NEVER removes:
# - .env
# - .env.local
# - .env.production
# - database files
# - persistent data

# ============================================================
# 3. DEPENDENCIES
# ============================================================

log "Installing frontend dependencies..."

if [[ -f "package-lock.json" ]]; then
  npm ci
else
  log "package-lock.json not found."
  log "Generating package-lock.json with npm install..."
  npm install
fi

# ============================================================
# 4. FRONTEND BUILD
# ============================================================

log "Building frontend..."

rm -rf "${DIST_DIR}"

npm run build

[[ -f "${DIST_DIR}/index.html" ]] \
  || fail "Frontend build failed: dist/index.html not found."

log "Frontend build completed successfully."

# ============================================================
# 5. BACKEND DETECTION
# ============================================================

BACKEND_PRESENT="false"

if [[ -d "${APP_DIR}/backend" ]]; then
  BACKEND_PRESENT="true"
fi

# ============================================================
# 6. BACKEND SETUP
# ============================================================

if [[ "${BACKEND_PRESENT}" == "true" ]]; then

  log "Backend detected."

  command_exists python3 \
    || fail "Python 3 is required for the backend."

  PYTHON_VERSION="$(
    python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
  )"

  log "Python: ${PYTHON_VERSION}"

  if [[ ! -d "${VENV_DIR}" ]]; then
    log "Creating Python virtual environment..."
    python3 -m venv "${VENV_DIR}"
  fi

  source "${VENV_DIR}/bin/activate"

  python -m pip install --upgrade pip

  if [[ -f "${APP_DIR}/backend/requirements.txt" ]]; then
    log "Installing backend dependencies..."
    python -m pip install -r "${APP_DIR}/backend/requirements.txt"
  else
    log "backend/requirements.txt not found."
    log "Backend dependency installation skipped."
  fi

else

  log "No backend directory detected."

fi

# ============================================================
# 7. DEPLOYMENT STATUS
# ============================================================

if [[ "${BACKEND_PRESENT}" == "false" ]]; then

  echo
  echo "============================================================"
  echo " OWNER TRADING — FRONTEND DEPLOYMENT COMPLETE"
  echo "============================================================"
  echo
  echo "Frontend : READY"
  echo "Build    : ${DIST_DIR}"
  echo "Backend  : NOT YET INTEGRATED"
  echo
  echo "IMPORTANT:"
  echo "The frontend was built successfully, but this project does"
  echo "not currently contain the backend runtime."
  echo
  echo "Real authentication, Kotak Neo connection, market data,"
  echo "orders, positions, strategies, backtesting, risk controls,"
  echo "owner controls and AI APIs require the backend integration."
  echo
  echo "No fake backend/service has been started."
  echo
  echo "============================================================"

  exit 0
fi

# ============================================================
# 8. BACKEND ENTRYPOINT VALIDATION
# ============================================================

if [[ -f "${APP_DIR}/backend/server.py" ]]; then
  BACKEND_ENTRYPOINT="server:app"
elif [[ -f "${APP_DIR}/backend/main.py" ]]; then
  BACKEND_ENTRYPOINT="main:app"
elif [[ -f "${APP_DIR}/backend/app.py" ]]; then
  BACKEND_ENTRYPOINT="app:app"
else
  fail "Backend detected, but no supported FastAPI entrypoint was found."
fi

log "Backend entrypoint: ${BACKEND_ENTRYPOINT}"

# ============================================================
# 9. BACKEND SYSTEMD SERVICE
# ============================================================

SYSTEMD_SERVICE="/etc/systemd/system/${APP_NAME}-backend.service"

if [[ "${EUID}" -eq 0 ]]; then

  log "Installing systemd backend service..."

  cat > "${SYSTEMD_SERVICE}" <<EOF
[Unit]
Description=Owner Trading Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=-${APP_DIR}/backend/.env
ExecStart=${VENV_DIR}/bin/uvicorn ${BACKEND_ENTRYPOINT} --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5
User=${SUDO_USER:-root}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${APP_NAME}-backend"
  systemctl restart "${APP_NAME}-backend"

  sleep 2

  systemctl is-active --quiet "${APP_NAME}-backend" \
    || fail "Backend systemd service failed to start."

  log "Backend systemd service is active."

else

  log "Not running as root."
  log "Systemd/Nginx installation skipped."
  log "Run with sudo when deploying to a Linux production server."

fi

# ============================================================
# 10. BACKEND HEALTH CHECK
# ============================================================

if command_exists curl; then

  log "Checking backend health..."

  HEALTH_OK="false"

  for _ in $(seq 1 15); do

    if curl -fsS \
      "http://127.0.0.1:8000/api/health" \
      >/dev/null 2>&1
    then
      HEALTH_OK="true"
      break
    fi

    sleep 1

  done

  if [[ "${HEALTH_OK}" != "true" ]]; then
    fail "Backend health check failed."
  fi

  log "Backend health check passed."

else

  log "curl not available; backend HTTP health check skipped."

fi

# ============================================================
# 11. FINAL
# ============================================================

echo
echo "============================================================"
echo " OWNER TRADING — DEPLOYMENT COMPLETE"
echo "============================================================"
echo
echo "Frontend : ${DIST_DIR}"
echo "Backend  : ${BACKEND_ENTRYPOINT}"
echo "API      : http://127.0.0.1:8000"
echo "Service  : ${APP_NAME}-backend"
echo
echo "============================================================"

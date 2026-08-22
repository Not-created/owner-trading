#!/usr/bin/env bash
#
# =============================================================================
#  deploy.sh — Owner Trading Platform — Phase 1 Deployment Foundation
# =============================================================================
#
#  Idempotent deployment script for the Owner Trading production platform.
#  Automates the manual steps documented in deploy/README.md.
#
#  USAGE:
#    sudo bash deploy/deploy.sh
#
#  OPTIONS:
#    --skip-os-packages   Skip apt-get install (for fast re-runs)
#    --skip-frontend      Skip frontend install/build (backend-only updates)
#    --help               Show this help
#
#  CONSTRAINTS (MANDATORY — DO NOT VIOLATE):
#    - No Docker, no Redis, no Celery
#    - Single backend worker (uvicorn --workers 1)
#    - Backend binds 127.0.0.1:8000 (localhost only)
#    - Nginx is the public entry point
#    - Preserves the Universal Broker Engine (broker-agnostic)
#    - No broker-specific code, no default/primary broker
#    - No dummy/fake trading data
#    - Never overwrites existing production secrets
#
#  SAFETY:
#    - Idempotent: safe on fresh / already-deployed / failed servers
#    - Backs up existing Nginx + systemd configs before changing them
#    - Restores backups if validation fails
#    - Never deletes or resets MongoDB data
#    - Never overwrites an existing backend/.env
#
#  SECRETS:
#    - Current: backend/.env (loaded by backend/server.py via load_dotenv)
#    - Future:  /etc/owner-trading/owner-trading.env (set SECRETS_FILE below)
#    - Secrets are never printed to stdout or logs
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (edit only if your server layout differs)
# ---------------------------------------------------------------------------
APP_DIR="${APP_DIR:-/home/ubuntu/owner-trading}"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
VENV_DIR="${APP_DIR}/.venv"
SERVICE_USER="${SERVICE_USER:-ubuntu}"
SERVICE_GROUP="${SERVICE_GROUP:-www-data}"

SYSTEMD_UNIT_SRC="${APP_DIR}/deploy/systemd/owner-trading-backend.service"
SYSTEMD_UNIT_DST="/etc/systemd/system/owner-trading-backend.service"
SYSTEMD_SERVICE_NAME="owner-trading-backend"
OBSOLETE_SYSTEMD_UNIT="/etc/systemd/system/owner-trading.service"

NGINX_CONF_SRC="${APP_DIR}/deploy/nginx/owner-trading.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/owner-trading"
NGINX_ENABLED="/etc/nginx/sites-enabled/owner-trading"

# Current secrets file. Future production location:
#   /etc/owner-trading/owner-trading.env
SECRETS_FILE="${SECRETS_FILE:-${BACKEND_DIR}/.env}"

BACKUP_DIR="${APP_DIR}/deploy/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
SKIP_OS_PACKAGES=0
SKIP_FRONTEND=0

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-os-packages) SKIP_OS_PACKAGES=1; shift ;;
    --skip-frontend)    SKIP_FRONTEND=1;    shift ;;
    --help|-h)          usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn ]${NC} $*"; }
fail() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

backup_file() {
  # $1 = source file, $2 = backup label
  local src="$1" label="$2"
  if [[ -f "${src}" ]]; then
    mkdir -p "${BACKUP_DIR}"
    cp -p "${src}" "${BACKUP_DIR}/${label}.${TIMESTAMP}"
    log "Backed up ${src} -> ${BACKUP_DIR}/${label}.${TIMESTAMP}"
  fi
}

restore_latest_backup() {
  # $1 = backup glob, $2 = destination
  local glob="$1" dst="$2" latest
  latest="$(ls -t ${glob} 2>/dev/null | head -1 || true)"
  if [[ -n "${latest}" && -f "${latest}" ]]; then
    cp -p "${latest}" "${dst}"
    log "Restored ${dst} from ${latest}"
  else
    warn "No backup found for ${dst} — manual recovery required"
  fi
}

# ---------------------------------------------------------------------------
# 1. Pre-flight checks
# ---------------------------------------------------------------------------
preflight() {
  log "Pre-flight checks"
  [[ "${EUID}" -eq 0 ]] || fail "Run as root: sudo bash deploy/deploy.sh"
  [[ -d "${APP_DIR}" ]] || fail "App directory not found: ${APP_DIR}"
  [[ -f "${BACKEND_DIR}/server.py" ]] || fail "backend/server.py not found"
  [[ -f "${FRONTEND_DIR}/package.json" ]] || fail "frontend/package.json not found"
  [[ -f "${SYSTEMD_UNIT_SRC}" ]] || fail "systemd unit not found: ${SYSTEMD_UNIT_SRC}"
  [[ -f "${NGINX_CONF_SRC}" ]] || fail "nginx conf not found: ${NGINX_CONF_SRC}"
  id "${SERVICE_USER}" >/dev/null 2>&1 || fail "Service user '${SERVICE_USER}' does not exist"

  # OS
  if [[ -f /etc/os-release ]] && grep -qi ubuntu /etc/os-release; then
    log "OS: Ubuntu"
  else
    warn "Not Ubuntu — script targets Ubuntu 20.04+"
  fi

  # Python (must be 3.9+)
  if command -v python3 >/dev/null 2>&1; then
    PY_VER="$(python3 --version 2>&1 | awk '{print $2}')"
    PY_MAJOR="$(echo "${PY_VER}" | cut -d. -f1)"
    PY_MINOR="$(echo "${PY_VER}" | cut -d. -f2)"
    log "Python: ${PY_VER}"
    if [[ "${PY_MAJOR}" -lt 3 || ( "${PY_MAJOR}" -eq 3 && "${PY_MINOR}" -lt 9 ) ]]; then
      fail "Python 3.9+ required (found ${PY_VER})"
    fi
  else
    fail "python3 not found — install python3-dev python3-venv python3-pip"
  fi

  # Node (React 19 + Craco 7.1.0 recommend Node 20 LTS; README minimum is 14+)
  if command -v node >/dev/null 2>&1; then
    NODE_VER="$(node --version 2>&1 | sed 's/^v//')"
    NODE_MAJOR="$(echo "${NODE_VER}" | cut -d. -f1)"
    log "Node: ${NODE_VER}"
    if [[ "${NODE_MAJOR}" -lt 14 ]]; then
      fail "Node 14+ required (found ${NODE_VER})"
    elif [[ "${NODE_MAJOR}" -lt 20 ]]; then
      warn "Node < 20 — React 19 + Craco 7.1.0 recommend Node 20 LTS. Verify 'yarn build' succeeds."
    fi
  else
    warn "node not found — will install Node 20 LTS via NodeSource"
  fi

  # Yarn (authoritative package manager — package.json declares yarn@1.22.22)
  if ! command -v yarn >/dev/null 2>&1; then
    warn "yarn not found — will install via npm"
  fi

  log "Pre-flight checks passed"
}

# ---------------------------------------------------------------------------
# 2. OS packages (idempotent)
# ---------------------------------------------------------------------------
install_os_packages() {
  if [[ "${SKIP_OS_PACKAGES}" -eq 1 ]]; then
    log "Skipping OS package installation (--skip-os-packages)"
    return
  fi
  log "Installing OS packages (idempotent)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    python3-dev python3-venv python3-pip \
    nginx build-essential curl jq
  log "OS packages installed"
}

# ---------------------------------------------------------------------------
# 3. Node + Yarn (only if missing)
# ---------------------------------------------------------------------------
install_node_yarn() {
  if ! command -v node >/dev/null 2>&1; then
    log "Installing Node 20 LTS via NodeSource"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  if ! command -v yarn >/dev/null 2>&1; then
    log "Installing yarn via npm"
    npm install -g yarn
  fi
  log "Node: $(node --version 2>&1) | Yarn: $(yarn --version 2>&1)"
}

# ---------------------------------------------------------------------------
# 4. Backend venv + dependencies
# ---------------------------------------------------------------------------
setup_backend() {
  log "Setting up backend virtual environment"
  if [[ ! -d "${VENV_DIR}" ]]; then
    python3 -m venv "${VENV_DIR}"
    log "Created venv at ${VENV_DIR}"
  fi
  "${VENV_DIR}/bin/pip" install --upgrade pip setuptools wheel
  "${VENV_DIR}/bin/pip" install -r "${BACKEND_DIR}/requirements.txt"
  log "Backend dependencies installed"
}

# ---------------------------------------------------------------------------
# 5. Backend .env (create only if missing — never overwrite)
# ---------------------------------------------------------------------------
setup_secrets() {
  if [[ -f "${SECRETS_FILE}" ]]; then
    log "Secrets file exists — preserving: ${SECRETS_FILE}"
    chmod 600 "${SECRETS_FILE}"
    return
  fi

  log "Creating secrets file: ${SECRETS_FILE}"
  mkdir -p "$(dirname "${SECRETS_FILE}")"

  # Generate secure secrets
  JWT_SECRET_GEN="$(openssl rand -hex 32)"
  ENCRYPTION_KEY_GEN="$("${VENV_DIR}/bin/python" -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

  # Allow non-interactive overrides via environment variables
  MONGO_URL_IN="${MONGO_URL:-mongodb://localhost:27017}"
  DB_NAME_IN="${DB_NAME:-owner_trading_db}"
  OWNER_USERNAME_IN="${OWNER_USERNAME:-}"
  OWNER_PASSWORD_IN="${OWNER_PASSWORD:-}"
  OWNER_EMAIL_IN="${OWNER_EMAIL:-}"
  FRONTEND_URL_IN="${FRONTEND_URL:-http://localhost}"
  CORS_ORIGINS_IN="${CORS_ORIGINS:-${FRONTEND_URL_IN}}"

  # If any required value is missing and stdin is a TTY, prompt interactively.
  if [[ -t 0 ]]; then
    read -r -p "  MONGO_URL [${MONGO_URL_IN}]: " _in
    MONGO_URL_IN="${_in:-${MONGO_URL_IN}}"
    read -r -p "  DB_NAME [${DB_NAME_IN}]: " _in
    DB_NAME_IN="${_in:-${DB_NAME_IN}}"
    if [[ -z "${OWNER_USERNAME_IN}" ]]; then
      read -r -p "  OWNER_USERNAME: " OWNER_USERNAME_IN
    fi
    if [[ -z "${OWNER_PASSWORD_IN}" ]]; then
      read -r -s -p "  OWNER_PASSWORD: " OWNER_PASSWORD_IN; echo
    fi
    if [[ -z "${OWNER_EMAIL_IN}" ]]; then
      read -r -p "  OWNER_EMAIL: " OWNER_EMAIL_IN
    fi
    read -r -p "  FRONTEND_URL [${FRONTEND_URL_IN}]: " _in
    FRONTEND_URL_IN="${_in:-${FRONTEND_URL_IN}}"
    read -r -p "  CORS_ORIGINS [${CORS_ORIGINS_IN}]: " _in
    CORS_ORIGINS_IN="${_in:-${CORS_ORIGINS_IN}}"
  fi

  [[ -n "${OWNER_USERNAME_IN}" ]] || fail "OWNER_USERNAME is required (set env var or run interactively)"
  [[ -n "${OWNER_PASSWORD_IN}" ]] || fail "OWNER_PASSWORD is required (set env var or run interactively)"
  [[ -n "${OWNER_EMAIL_IN}" ]] || fail "OWNER_EMAIL is required (set env var or run interactively)"

  cat > "${SECRETS_FILE}" <<EOF
# Owner Trading — production secrets
# Created by deploy.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Permissions: chmod 600. Never commit this file.
MONGO_URL="${MONGO_URL_IN}"
DB_NAME="${DB_NAME_IN}"
JWT_SECRET="${JWT_SECRET_GEN}"
ENCRYPTION_KEY="${ENCRYPTION_KEY_GEN}"
OWNER_USERNAME="${OWNER_USERNAME_IN}"
OWNER_PASSWORD="${OWNER_PASSWORD_IN}"
OWNER_EMAIL="${OWNER_EMAIL_IN}"
FRONTEND_URL="${FRONTEND_URL_IN}"
CORS_ORIGINS="${CORS_ORIGINS_IN}"
EOF
  chmod 600 "${SECRETS_FILE}"
  chown "${SERVICE_USER}:${SERVICE_GROUP}" "${SECRETS_FILE}" 2>/dev/null || true
  log "Secrets file created (chmod 600)"
}

# ---------------------------------------------------------------------------
# 6. Frontend build (Yarn is authoritative — package.json declares yarn@1.22.22)
# ---------------------------------------------------------------------------
build_frontend() {
  if [[ "${SKIP_FRONTEND}" -eq 1 ]]; then
    log "Skipping frontend build (--skip-frontend)"
    return
  fi
  log "Building frontend (Yarn)"
  cd "${FRONTEND_DIR}"
  yarn install --frozen-lockfile
  yarn build
  cd "${APP_DIR}"
  [[ -f "${FRONTEND_DIR}/build/index.html" ]] || fail "Frontend build missing index.html"
  log "Frontend build complete"
}

# ---------------------------------------------------------------------------
# 7. Nginx (backup -> install -> validate -> reload; restore on failure)
# ---------------------------------------------------------------------------
install_nginx() {
  log "Installing Nginx configuration"
  backup_file "${NGINX_AVAILABLE}" "owner-trading.conf.bak"
  cp -p "${NGINX_CONF_SRC}" "${NGINX_AVAILABLE}"
  ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
  if nginx -t 2>&1; then
    systemctl reload nginx
    log "Nginx configuration valid and reloaded"
  else
    warn "Nginx validation failed — restoring previous config"
    restore_latest_backup "${BACKUP_DIR}/owner-trading.conf.bak.*" "${NGINX_AVAILABLE}"
    nginx -t 2>&1 || warn "Restored Nginx config also fails validation — manual recovery required"
    fail "Nginx configuration failed validation"
  fi
}

# ---------------------------------------------------------------------------
# 8. Systemd (backup -> install -> enable -> start; restore on failure)
# ---------------------------------------------------------------------------
install_systemd() {
  log "Installing systemd service"

  # Remove obsolete unit if present (documented migration in deploy/README.md)
  if [[ -f "${OBSOLETE_SYSTEMD_UNIT}" ]]; then
    systemctl stop owner-trading 2>/dev/null || true
    rm -f "${OBSOLETE_SYSTEMD_UNIT}"
    log "Removed obsolete unit: ${OBSOLETE_SYSTEMD_UNIT}"
  fi

  backup_file "${SYSTEMD_UNIT_DST}" "owner-trading-backend.service.bak"
  cp -p "${SYSTEMD_UNIT_SRC}" "${SYSTEMD_UNIT_DST}"
  systemctl daemon-reload
  systemctl enable "${SYSTEMD_SERVICE_NAME}"
  systemctl restart "${SYSTEMD_SERVICE_NAME}"

  # Wait for the service to come up (max 15s)
  for _ in $(seq 1 15); do
    if systemctl is-active --quiet "${SYSTEMD_SERVICE_NAME}"; then
      break
    fi
    sleep 1
  done

  if systemctl is-active --quiet "${SYSTEMD_SERVICE_NAME}"; then
    log "Systemd service active: ${SYSTEMD_SERVICE_NAME}"
  else
    warn "Service failed to start — restoring previous unit"
    restore_latest_backup "${BACKUP_DIR}/owner-trading-backend.service.bak.*" "${SYSTEMD_UNIT_DST}"
    systemctl daemon-reload
    systemctl restart "${SYSTEMD_SERVICE_NAME}" 2>/dev/null || true
    fail "Systemd service failed to start — see: journalctl -u ${SYSTEMD_SERVICE_NAME} -n 50"
  fi
}

# ---------------------------------------------------------------------------
# 9. Health checks
# ---------------------------------------------------------------------------
health_checks() {
  log "Running post-deployment health checks"

  # Backend localhost
  curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1 \
    || fail "Backend health check failed on 127.0.0.1:8000"

  # MongoDB connectivity (via backend health — never touches the database)
  DB_OK="$(curl -fsS http://127.0.0.1:8000/api/health 2>/dev/null | jq -r '.database' 2>/dev/null || echo 'false')"
  if [[ "${DB_OK}" == "true" ]]; then
    log "MongoDB connectivity verified (via /api/health)"
  else
    fail "MongoDB connectivity check failed — start/configure MongoDB per deploy/README.md"
  fi

  # Via Nginx
  curl -fsS http://localhost/api/health >/dev/null 2>&1 \
    || fail "Backend health check failed via Nginx"

  # Frontend
  curl -fsS http://localhost/ 2>/dev/null | grep -q "<!DOCTYPE html>" \
    || fail "Frontend not served by Nginx"

  # Frontend build must not contain localhost:8000 (README Step 3.3)
  if grep -rq "localhost:8000" "${FRONTEND_DIR}/build/" 2>/dev/null; then
    fail "Frontend build contains localhost:8000 — REACT_APP_BACKEND_URL must be empty"
  fi

  # systemd
  systemctl is-active --quiet "${SYSTEMD_SERVICE_NAME}" \
    || fail "Service not active: ${SYSTEMD_SERVICE_NAME}"
  systemctl is-enabled --quiet "${SYSTEMD_SERVICE_NAME}" \
    || fail "Service not enabled: ${SYSTEMD_SERVICE_NAME}"

  # Binding — must be 127.0.0.1:8000 only
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep -q "127.0.0.1:8000" \
      || fail "Backend not bound to 127.0.0.1:8000"
    if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:8000"; then
      fail "Backend bound to 0.0.0.0:8000 — must be 127.0.0.1 only"
    fi
  else
    warn "ss not available — skipping binding check"
  fi

  # Auth guard — unauthenticated /api/auth/me must return 401
  AUTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/auth/me)"
  if [[ "${AUTH_CODE}" == "401" ]]; then
    log "Auth guard verified (401 for unauthenticated /api/auth/me)"
  else
    warn "Expected 401 for unauthenticated /api/auth/me, got ${AUTH_CODE}"
  fi

  log "All health checks passed"
}

# ---------------------------------------------------------------------------
# 10. Summary
# ---------------------------------------------------------------------------
summary() {
  echo
  echo "============================================================"
  echo "  Owner Trading — Phase 1 deployment complete"
  echo "============================================================"
  echo "  Backend : http://127.0.0.1:8000/api/health"
  echo "  Public  : http://localhost/api/health"
  echo "  Frontend: http://localhost/"
  echo "  Service : systemctl status ${SYSTEMD_SERVICE_NAME}"
  echo "  Logs    : journalctl -u ${SYSTEMD_SERVICE_NAME} -f"
  echo "  Secrets : ${SECRETS_FILE} (chmod 600, never committed)"
  echo "  Backups : ${BACKUP_DIR}"
  echo "============================================================"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  preflight
  install_os_packages
  install_node_yarn
  setup_backend
  setup_secrets
  build_frontend
  install_nginx
  install_systemd
  health_checks
  summary
}

main "$@"
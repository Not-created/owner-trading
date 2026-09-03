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
RELEASE_DIR="${APP_DIR}/deploy/releases"
LOCK_FILE="${APP_DIR}/deploy/.deploy.lock"
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

run_as_user() {
  if [[ "${EUID}" -eq 0 ]]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "${SERVICE_USER}" -- "$@"
    elif command -v sudo >/dev/null 2>&1; then
      sudo -u "${SERVICE_USER}" "$@"
    else
      fail "Cannot switch to ${SERVICE_USER} (no runuser / sudo)"
    fi
  else
    "$@"
  fi
}

owns_dir() {
  local path="$1"
  [[ ! -e "${path}" ]] || { local own; own="$(stat -c '%U' "${path}" 2>/dev/null || true)"; [[ "${own}" == "${SERVICE_USER}" ]]; }
}

acquire_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${LOCK_FILE}"
    if ! flock -n 9; then
      fail "Another deployment is in progress (${LOCK_FILE}). Aborting."
    fi
    log "Deployment lock acquired: ${LOCK_FILE}"
  else
    ln -s ".pid.$$" "${LOCK_FILE}" 2>/dev/null && { log "Lock acquired via symlink fallback"; return; }
    fail "Another deployment is in progress (${LOCK_FILE}). Aborting."
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
    run_as_user python3 -m venv "${VENV_DIR}"
    log "Created venv at ${VENV_DIR}"
  fi
  if [[ "${EUID}" -eq 0 ]] && ! owns_dir "${VENV_DIR}"; then
    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${VENV_DIR}"
    log "Corrected ownership of ${VENV_DIR}"
  fi
  run_as_user "${VENV_DIR}/bin/pip" install --upgrade pip setuptools wheel
  run_as_user "${VENV_DIR}/bin/pip" install -r "${BACKEND_DIR}/requirements.txt"
  log "Backend dependencies installed"
}

# ---------------------------------------------------------------------------
# 5. Backend .env (create only if missing — never overwrite)
# ---------------------------------------------------------------------------
# Validate required env keys without printing values.
validate_secrets() {
  local file="$1" key val
  for key in MONGO_URL DB_NAME JWT_SECRET ENCRYPTION_KEY OWNER_USERNAME OWNER_PASSWORD OWNER_EMAIL FRONTEND_URL; do
    val="$(grep -E "^${key}=" "${file}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    [[ -n "${val}" ]] || fail "Secrets file missing required non-empty key: ${key}"
  done
  # Reject obvious placeholders
  for key in JWT_SECRET ENCRYPTION_KEY OWNER_PASSWORD; do
    val="$(grep -E "^${key}=" "${file}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    case "${val}" in
      ""|"change-me"|"changeme"|"CHANGE_ME"|"<generate-secure-random-value>"|"<set-strong-password>"|"dev-insecure"|"secret")
        fail "Secrets: placeholder value for ${key}" ;;
    esac
  done
  local pw ek ck cs
  pw="$(grep -E '^OWNER_PASSWORD=' "${file}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  [[ ${#pw} -ge 8 ]] || fail "OWNER_PASSWORD must be >= 8 chars (current: ${#pw})"
  ek="$(grep -E '^ENCRYPTION_KEY=' "${file}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  if ! FERNET_KEY="${ek}" "${VENV_DIR}/bin/python" -c 'import os; from cryptography.fernet import Fernet; Fernet(os.environ["FERNET_KEY"])' >/dev/null 2>&1; then
    fail "ENCRYPTION_KEY is not a valid Fernet key"
  fi
  ck="$(grep -E '^COOKIE_SECURE=' "${file}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  cs="$(grep -E '^COOKIE_SAMESITE=' "${file}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  [[ "${ck}" =~ ^(true|false)$ ]] || fail "COOKIE_SECURE must be true|false (got: ${ck:-empty})"
  [[ "${cs}" =~ ^(none|lax|strict)$ ]] || fail "COOKIE_SAMESITE must be none|lax|strict (got: ${cs:-empty})"
  log "Secrets validation passed (values not printed)"
}

setup_secrets() {
  if [[ -f "${SECRETS_FILE}" ]]; then
    log "Secrets file exists — preserving: ${SECRETS_FILE}"
    chmod 600 "${SECRETS_FILE}"
    validate_secrets "${SECRETS_FILE}"
    return
  fi

  log "Creating secrets file: ${SECRETS_FILE}"
  mkdir -p "$(dirname "${SECRETS_FILE}")"

  # Generate secure secrets
  JWT_SECRET_GEN="$(openssl rand -hex 32)"
  ENCRYPTION_KEY_GEN="$("${VENV_DIR}/bin/python" -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

  # Allow non-interactive overrides via environment variables.
  # Default cookie mode is HTTP/IP (no TLS): COOKIE_SECURE=false, SAMESITE=lax.
  # For HTTPS: COOKIE_SECURE=true COOKIE_SAMESITE=none.
  MONGO_URL_IN="${MONGO_URL:-mongodb://localhost:27017}"
  DB_NAME_IN="${DB_NAME:-owner_trading_db}"
  OWNER_USERNAME_IN="${OWNER_USERNAME:-}"
  OWNER_PASSWORD_IN="${OWNER_PASSWORD:-}"
  OWNER_EMAIL_IN="${OWNER_EMAIL:-}"
  FRONTEND_URL_IN="${FRONTEND_URL:-http://localhost}"
  CORS_ORIGINS_IN="${CORS_ORIGINS:-${FRONTEND_URL_IN}}"
  COOKIE_SECURE_IN="${COOKIE_SECURE:-false}"
  COOKIE_SAMESITE_IN="${COOKIE_SAMESITE:-lax}"

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
  [[ ${#OWNER_PASSWORD_IN} -ge 8 ]] || fail "OWNER_PASSWORD must be at least 8 characters"
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
# HTTP/IP mode (no TLS). For HTTPS set COOKIE_SECURE=true COOKIE_SAMESITE=none
COOKIE_SECURE="${COOKIE_SECURE_IN}"
COOKIE_SAMESITE="${COOKIE_SAMESITE_IN}"
EOF
  chmod 600 "${SECRETS_FILE}"
  chown "${SERVICE_USER}:${SERVICE_GROUP}" "${SECRETS_FILE}" 2>/dev/null || true
  validate_secrets "${SECRETS_FILE}"
  log "Secrets file created (chmod 600) and validated"
}

# 5b. MongoDB validation — never install/reset/delete anything
validate_mongodb() {
  log "Validating MongoDB"
  local MONGO_URL_IN
  MONGO_URL_IN="$(grep -E '^MONGO_URL=' "${SECRETS_FILE}" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  if echo "${MONGO_URL_IN}" | grep -qiE '^mongodb://(127\.0\.0\.1|localhost)'; then
    if systemctl is-active --quiet mongod 2>/dev/null || systemctl is-active --quiet mongodb 2>/dev/null; then
      log "Local MongoDB service is running"
    else
      warn "Local MongoDB service is NOT running (expected: mongod or mongodb). Will be confirmed by backend health."
    fi
  else
    log "Remote MongoDB detected — will be confirmed by backend /api/health (credentials never printed)"
  fi
}

# ---------------------------------------------------------------------------
# 6. Frontend build (Yarn is authoritative — package.json declares yarn@1.22.22)
# ---------------------------------------------------------------------------
build_frontend() {
  if [[ "${SKIP_FRONTEND}" -eq 1 ]]; then
    log "Skipping frontend build (--skip-frontend)"
    return
  fi
  if [[ "${EUID}" -eq 0 ]]; then
    mkdir -p "${FRONTEND_DIR}/node_modules"
    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${FRONTEND_DIR}/node_modules" "${FRONTEND_DIR}/build" 2>/dev/null || true
  fi
  log "Installing frontend deps (Yarn, as ${SERVICE_USER})"
  ( cd "${FRONTEND_DIR}" && run_as_user yarn install --frozen-lockfile --non-interactive )
  BUILD_TMP="${FRONTEND_DIR}/build.tmp.${TIMESTAMP}"
  log "Building frontend into ${BUILD_TMP}"
  ( cd "${FRONTEND_DIR}" && run_as_user env BUILD_PATH="build.tmp.${TIMESTAMP}" yarn build )
  [[ -f "${BUILD_TMP}/index.html" ]] || fail "Frontend build missing index.html"
  mkdir -p "${RELEASE_DIR}"
  if [[ -d "${FRONTEND_DIR}/build" && ! -L "${FRONTEND_DIR}/build" ]]; then
    mv "${FRONTEND_DIR}/build" "${RELEASE_DIR}/build.prev.${TIMESTAMP}"
    log "Preserved previous build -> ${RELEASE_DIR}/build.prev.${TIMESTAMP}"
  fi
  mv "${BUILD_TMP}" "${FRONTEND_DIR}/build"
  if [[ "${EUID}" -eq 0 ]]; then
    chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${FRONTEND_DIR}/build"
  fi
  log "Frontend build complete (atomic)"
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
firewall_check() {
  log "Firewall / network check"
}

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
  acquire_lock
  preflight
  install_os_packages
  install_node_yarn
  setup_backend
  setup_secrets
  validate_mongodb
  build_frontend
  install_nginx
  install_systemd
  health_checks
  firewall_check
  summary
}

main "$@"
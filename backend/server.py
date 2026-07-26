"""
Enterprise AI Trading Platform — main FastAPI app.
Wires all modules; runs startup tasks (indexes, seeding, module registration).
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ruff: noqa: E402
import os
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from core.database import init_indexes, close_db, get_db
from core.error_handling import register_error_handlers
from core.logging_service import log_service
from core.config import get_settings
from core.module_registry import module_registry, ModuleMeta

from modules.auth.router import router as auth_router
from modules.users.router import router as users_router
from modules.ai_core.router import router as ai_router
from modules.broker_core.router import router as brokers_router
from modules.plugins.router import router as plugins_router
from modules.settings.router import router as settings_router
from modules.logs.router import router as logs_router
from modules.owner_control.router import router as owner_control_router
from modules.auth.service import seed_owner


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


app = FastAPI(title="Enterprise AI Trading Platform", version="1.0.0")

register_error_handlers(app)

s = get_settings()
allowed = [s.frontend_url]
extra = os.environ.get("CORS_ORIGINS", "").strip()
if extra and extra != "*":
    allowed.extend([o.strip() for o in extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)

# Health router at /api
health_router = APIRouter(prefix="/api")


@health_router.get("/")
async def root():
    return {"platform": "Enterprise AI Trading Platform", "status": "ok"}


@health_router.get("/health")
async def health():
    try:
        await get_db().command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {"ok": db_ok, "database": db_ok}


# Register all module routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(ai_router)
app.include_router(brokers_router)
app.include_router(plugins_router)
app.include_router(settings_router)
app.include_router(logs_router)
app.include_router(owner_control_router)


def _register_modules() -> None:
    """Central self-registration for every module → surfaces in Owner Control."""
    module_registry.register(ModuleMeta(
        module_id="auth", display_name="Authentication", version="1.0.0",
        description="Owner-only JWT auth, sessions, brute-force protection, login history.",
        api_prefix="/api/auth",
        endpoints=["POST /login", "POST /logout", "GET /me", "POST /refresh",
                   "POST /change-password", "GET /sessions", "DELETE /sessions/{id}",
                   "POST /logout-all", "GET /login-history"],
        capabilities=["auth:manage"],
    ))
    module_registry.register(ModuleMeta(
        module_id="users", display_name="Owner Profile", version="1.0.0",
        description="Owner profile, preferences, and identity settings.",
        api_prefix="/api/users",
        endpoints=["GET /me", "PATCH /me/profile"],
        capabilities=["user:manage"],
    ))
    module_registry.register(ModuleMeta(
        module_id="ai_core", display_name="Universal AI Core", version="1.0.0",
        description="Plugin-based AI providers (OpenAI, Claude, Gemini) with switching, "
                    "usage tracking, health checks, and automatic failover.",
        api_prefix="/api/ai",
        endpoints=["GET /providers", "POST /default", "GET /health",
                   "POST /chat", "GET /usage"],
        capabilities=["ai:read", "ai:write"],
    ))
    module_registry.register(ModuleMeta(
        module_id="broker_core", display_name="Universal Broker Engine", version="1.0.0",
        description="Broker plugin framework with encrypted credentials, multi-account, "
                    "primary broker selection, connect/disconnect/health.",
        api_prefix="/api/brokers",
        endpoints=["GET /plugins", "GET /accounts", "POST /accounts",
                   "DELETE /accounts/{id}", "POST /accounts/{id}/primary",
                   "POST /accounts/{id}/connect", "POST /accounts/{id}/disconnect"],
        capabilities=["broker:read", "broker:write"],
    ))
    module_registry.register(ModuleMeta(
        module_id="plugins", display_name="Plugin Registry", version="1.0.0",
        description="Install, enable, disable, and uninstall platform extensions.",
        api_prefix="/api/plugins",
        endpoints=["GET /", "POST /", "POST /{id}/enable",
                   "POST /{id}/disable", "DELETE /{id}"],
        capabilities=["plugin:read", "plugin:write"],
    ))
    module_registry.register(ModuleMeta(
        module_id="settings", display_name="Settings Engine", version="1.0.0",
        description="Persistent key/value settings for system, security, appearance, notifications.",
        api_prefix="/api/settings",
        endpoints=["GET /", "GET /{key}", "PUT /{key}"],
        capabilities=["settings:read", "settings:write"],
    ))
    module_registry.register(ModuleMeta(
        module_id="logs", display_name="Audit Logs", version="1.0.0",
        description="Searchable structured audit stream with level & category filters.",
        api_prefix="/api/logs",
        endpoints=["GET /", "GET /categories"],
        capabilities=["logs:read"],
    ))
    module_registry.register(ModuleMeta(
        module_id="owner_control", display_name="Owner Control", version="1.0.0",
        description="Central control center. Every module registers itself here.",
        api_prefix="/api/owner-control",
        endpoints=["GET /overview", "GET /modules", "GET /capabilities"],
        capabilities=["owner-control:manage"],
    ))


@app.on_event("startup")
async def _startup():
    await init_indexes()
    await seed_owner()
    _register_modules()
    await log_service.info("system", "Platform started")


@app.on_event("shutdown")
async def _shutdown():
    await log_service.info("system", "Platform shutting down")
    await close_db()

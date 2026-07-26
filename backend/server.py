"""
Enterprise AI Trading Platform — main FastAPI app.
Wires all modules; runs startup tasks (indexes, seeding).
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

from modules.auth.router import router as auth_router
from modules.users.router import router as users_router
from modules.roles.router import router as roles_router
from modules.ai_core.router import router as ai_router
from modules.broker_core.router import router as brokers_router
from modules.plugins.router import router as plugins_router
from modules.settings.router import router as settings_router
from modules.logs.router import router as logs_router
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
app.include_router(roles_router)
app.include_router(ai_router)
app.include_router(brokers_router)
app.include_router(plugins_router)
app.include_router(settings_router)
app.include_router(logs_router)


@app.on_event("startup")
async def _startup():
    await init_indexes()
    await seed_owner()
    await log_service.info("system", "Platform started")


@app.on_event("shutdown")
async def _shutdown():
    await log_service.info("system", "Platform shutting down")
    await close_db()

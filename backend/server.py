"""
Enterprise AI Trading Platform — main FastAPI application.

Application entry point.

Responsibilities:
- Load deployment environment
- Create the FastAPI application
- Register global middleware
- Register application routers
- Provide platform health endpoints
- Initialize database indexes
- Seed the owner account
- Bootstrap enabled broker plugins
- Create AI Developer architecture snapshots
- Close database resources during shutdown

Architecture rule:
This module wires modules together. Business logic belongs inside
its respective module.

Current broker deployment:
- Kotak Neo is the only enabled broker adapter.
- Other approved brokers remain unregistered until their adapters are
  intentionally implemented and validated.

Market-data architecture:
- market_data.base
- market_data.providers
- market_data.service
- market_data.router

Future Strategy, Backtest, Trading Engine and AI modules must integrate
through their own routers/services without duplicating existing layers.
"""

from __future__ import annotations

from modules.strategy_router import router as strategy_router

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response


# ----------------------------------------------------------------------
# Environment
# ----------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parent

load_dotenv(
    ROOT_DIR / ".env"
)


# ----------------------------------------------------------------------
# Application dependencies
# ----------------------------------------------------------------------

from core.config import get_settings
from core.database import (
    close_db,
    get_db,
    init_indexes,
)
from core.error_handling import (
    register_error_handlers,
)
from core.logging_service import log_service

from modules.ai_core.presets_router import (
    router as ai_presets_router,
)
from modules.ai_core.router import (
    router as ai_router,
)
from modules.ai_developer.core_router import (
    router as ai_dev_core_router,
)
from modules.ai_developer.router import (
    router as ai_dev_router,
)
from modules.auth.router import (
    router as auth_router,
)
from modules.auth.service import seed_owner
from modules.auth.two_factor import (
    router as two_factor_router,
)
from modules.broker_core.router import (
    router as brokers_router,
)
from modules.broker_plugins.bootstrap import (
    bootstrap_broker_plugins,
)
from modules.logs.router import (
    router as logs_router,
)
from modules.market_data.router import (
    router as market_router,
)
from modules.plugins.router import (
    router as plugins_router,
)
from modules.roles.router import (
    router as roles_router,
)
from modules.settings.router import (
    router as settings_router,
)
from modules.users.router import (
    router as users_router,
)


# ----------------------------------------------------------------------
# Security middleware
# ----------------------------------------------------------------------


class SecurityHeadersMiddleware(
    BaseHTTPMiddleware
):
    """
    Add baseline browser security headers to every response.

    Authentication/security policy remains owned by the existing
    authentication and security modules.
    """

    async def dispatch(
        self,
        request,
        call_next,
    ):
        response: Response = await call_next(
            request
        )

        response.headers[
            "X-Content-Type-Options"
        ] = "nosniff"

        response.headers[
            "X-Frame-Options"
        ] = "DENY"

        response.headers[
            "Referrer-Policy"
        ] = "strict-origin-when-cross-origin"

        response.headers[
            "Permissions-Policy"
        ] = (
            "geolocation=(), "
            "microphone=(), "
            "camera=()"
        )

        return response


# ----------------------------------------------------------------------
# FastAPI application
# ----------------------------------------------------------------------

app = FastAPI(
    title="Enterprise AI Trading Platform",
    version="1.1.0",
)

register_error_handlers(
    app
)


# ----------------------------------------------------------------------
# CORS
# ----------------------------------------------------------------------

settings = get_settings()

allowed_origins = [
    settings.frontend_url
]

extra_origins = os.environ.get(
    "CORS_ORIGINS",
    "",
).strip()

if (
    extra_origins
    and extra_origins != "*"
):
    allowed_origins.extend(
        origin.strip()
        for origin in extra_origins.split(",")
        if origin.strip()
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SecurityHeadersMiddleware
)


# ----------------------------------------------------------------------
# Platform health/root endpoints
# ----------------------------------------------------------------------

health_router = APIRouter(
    prefix="/api"
)


@health_router.get("/")
async def root():
    """
    Basic application availability endpoint.
    """
    return {
        "platform": (
            "Enterprise AI Trading Platform"
        ),
        "status": "ok",
    }


@health_router.get("/health")
async def health():
    """
    Application + database health endpoint.

    This endpoint does not authenticate and does not expose credentials
    or database connection details.
    """
    try:
        await get_db().command(
            "ping"
        )
        database_ok = True

    except Exception:
        database_ok = False

    return {
        "ok": database_ok,
        "database": database_ok,
    }


app.include_router(
    health_router
)


# ----------------------------------------------------------------------
# Existing application routers
# ----------------------------------------------------------------------
#
# Keep each module behind its own router/service boundary.
# Do not place module business logic in server.py.
#

app.include_router(
    auth_router
)

app.include_router(
    two_factor_router
)

app.include_router(
    users_router
)

app.include_router(
    roles_router
)

app.include_router(
    ai_router
)

app.include_router(
    ai_presets_router
)

app.include_router(
    brokers_router
)

app.include_router(
    strategy_router
)

app.include_router(
    plugins_router
)

app.include_router(
    settings_router
)

app.include_router(
    logs_router
)

app.include_router(
    market_router
)

app.include_router(
    ai_dev_router
)

app.include_router(
    ai_dev_core_router
)


# ----------------------------------------------------------------------
# Startup
# ----------------------------------------------------------------------


@app.on_event("startup")
async def _startup():
    """
    Initialize the platform after the application process starts.

    Order:
        1. Database indexes
        2. Owner seed
        3. Enabled broker plugins
        4. AI Developer architecture snapshot
        5. Startup audit log

    Broker registration is intentionally delegated to bootstrap.py.
    """

    try:
        await init_indexes()

        await seed_owner()

        bootstrap_broker_plugins()

    except Exception:
        await log_service.info(
            "system",
            (
                "Startup bootstrap failed; "
                "continuing with degraded mode"
            ),
        )

    # Keep Project Memory synchronized with the actual application
    # architecture on every cold start.
    try:
        from modules.ai_developer import memory as devmem

        await devmem.snapshot_architecture(
            reason="startup"
        )

    except Exception:
        pass

    try:
        await log_service.info(
            "system",
            "Platform started",
        )

    except Exception:
        pass


# ----------------------------------------------------------------------
# Shutdown
# ----------------------------------------------------------------------


@app.on_event("shutdown")
async def _shutdown():
    """
    Gracefully close application resources.
    """

    try:
        await log_service.info(
            "system",
            "Platform shutting down",
        )

    finally:
        await close_db()

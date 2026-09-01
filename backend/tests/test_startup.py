import asyncio
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Provide test defaults if running outside active environment
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "owner_trading_test")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_must_be_long_enough_for_security_12345")
os.environ.setdefault("ENCRYPTION_KEY", "b64_32byte_dummy_key_for_testing_1234567890123=")
os.environ.setdefault("OWNER_USERNAME", "test_owner")
os.environ.setdefault("OWNER_PASSWORD", "test_password_123")
os.environ.setdefault("OWNER_EMAIL", "test@example.com")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")

import server as server_module


def test_startup_does_not_raise_when_database_init_fails(monkeypatch):
    async def fail_init_indexes():
        raise RuntimeError("db unavailable")

    async def noop_async(*args, **kwargs):
        return None

    monkeypatch.setattr(server_module, "init_indexes", fail_init_indexes)
    monkeypatch.setattr(server_module, "seed_owner", noop_async)
    monkeypatch.setattr(server_module, "bootstrap_broker_plugins", lambda: None)
    monkeypatch.setattr(server_module.log_service, "info", noop_async)

    try:
        asyncio.run(server_module._startup())
    except Exception as exc:  # pragma: no cover - regression guard
        pytest.fail(f"startup should tolerate boot failures, got: {exc}")

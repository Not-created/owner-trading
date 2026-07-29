import asyncio

import pytest

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

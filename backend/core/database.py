"""
Database Service — Motor (async MongoDB).
Provides a singleton client, database handle and index initialization.
"""
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from core.config import get_settings

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(get_settings().mongo_url)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_client()[get_settings().db_name]
    return _db


async def init_indexes() -> None:
    db = get_db()
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index("token_jti", unique=True)
    await db.sessions.create_index("user_id")
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index(
        "created_at", expireAfterSeconds=3600
    )
    await db.audit_logs.create_index([("created_at", -1)])
    await db.audit_logs.create_index("level")
    await db.audit_logs.create_index("category")
    await db.trusted_devices.create_index("user_id")
    await db.trusted_devices.create_index("device_id")
    await db.ai_usage.create_index([("created_at", -1)])
    await db.ai_providers.create_index("provider_id", unique=True)
    await db.broker_accounts.create_index("account_id", unique=True)
    await db.broker_plugins.create_index("plugin_id", unique=True)
    await db.plugins.create_index("plugin_id", unique=True)
    await db.settings_store.create_index("key", unique=True)
    await db.orders.create_index([("user_id", 1), ("account_id", 1), ("order_id", 1)])
    await db.positions.create_index([("user_id", 1), ("account_id", 1)])
    await db.holdings.create_index([("user_id", 1), ("account_id", 1)])
    await db.trade_history.create_index([("user_id", 1), ("account_id", 1)])


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
    

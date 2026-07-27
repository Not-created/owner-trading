"""
Simple in-process event bus (event-driven architecture).
Loosely-coupled: modules publish events; other modules subscribe.
"""
from collections import defaultdict
from typing import Any, Awaitable, Callable
import asyncio

Handler = Callable[[dict[str, Any]], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event_name: str, handler: Handler) -> None:
        self._handlers[event_name].append(handler)

    async def publish(self, event_name: str, payload: dict[str, Any]) -> None:
        for h in list(self._handlers.get(event_name, [])):
            try:
                await h(payload)
            except Exception:
                # Errors in one handler must never break the publisher.
                pass


event_bus = EventBus()

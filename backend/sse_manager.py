"""
Pagani Zonda R – SSE (Server-Sent Events) Infrastructure
Async event queue with heartbeat and safe disconnect handling.
"""

import asyncio
import logging
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

logger = logging.getLogger("pagani.sse")


class SSEManager:
    """
    Manages Server-Sent Events streams for connected clients.
    Each client gets its own asyncio.Queue for event delivery.
    """

    def __init__(self, heartbeat_interval: int = 15):
        self.heartbeat_interval = heartbeat_interval
        # channel -> set of queues
        self._channels: dict[str, set[asyncio.Queue]] = {}

    def subscribe(self, channel: str = "default") -> asyncio.Queue:
        """Subscribe a new client to a channel. Returns their personal queue."""
        queue: asyncio.Queue = asyncio.Queue()
        if channel not in self._channels:
            self._channels[channel] = set()
        self._channels[channel].add(queue)
        logger.info(f"SSE client subscribed to '{channel}' (total: {len(self._channels[channel])})")
        return queue

    def unsubscribe(self, queue: asyncio.Queue, channel: str = "default"):
        """Remove a client queue from a channel."""
        if channel in self._channels:
            self._channels[channel].discard(queue)
            if not self._channels[channel]:
                del self._channels[channel]
        logger.info(f"SSE client unsubscribed from '{channel}'")

    async def publish(self, event: str, data: dict, channel: str = "default"):
        """Publish an event to all subscribers on a channel."""
        if channel not in self._channels:
            return
        message = self._format_sse(event, data)
        dead_queues = []
        for queue in self._channels[channel]:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                dead_queues.append(queue)
        # Clean up any full/dead queues
        for q in dead_queues:
            self._channels[channel].discard(q)

    async def stream(self, queue: asyncio.Queue, channel: str = "default") -> AsyncGenerator[str, None]:
        """
        Async generator that yields SSE-formatted strings.
        Sends heartbeat comments every `heartbeat_interval` seconds.
        Handles disconnect safely by catching CancelledError.
        """
        try:
            while True:
                try:
                    # Wait for an event or timeout for heartbeat
                    message = await asyncio.wait_for(
                        queue.get(), timeout=self.heartbeat_interval
                    )
                    yield message
                except asyncio.TimeoutError:
                    # Send heartbeat comment (SSE spec: lines starting with ':' are comments)
                    yield f": heartbeat {datetime.now(timezone.utc).isoformat()}\n\n"
        except asyncio.CancelledError:
            logger.info(f"SSE stream cancelled for channel '{channel}'")
        except GeneratorExit:
            logger.info(f"SSE stream generator exited for channel '{channel}'")
        finally:
            self.unsubscribe(queue, channel)

    @staticmethod
    def _format_sse(event: str, data: dict) -> str:
        """Format a message according to the SSE specification."""
        payload = json.dumps(data, default=str)
        lines = [f"event: {event}", f"data: {payload}", "", ""]
        return "\n".join(lines)

    def active_connections(self, channel: str = "default") -> int:
        """Return the number of active subscribers on a channel."""
        return len(self._channels.get(channel, set()))


# ── Singleton ──
sse_manager = SSEManager()
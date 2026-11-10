"""Local Quasar (glagol) connection for Yandex speakers."""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from aiohttp import (
    ClientConnectorError,
    ClientSession,
    ClientWebSocketResponse,
    WSMsgType,
)
from homeassistant.core import HomeAssistant, callback
from zeroconf import ServiceBrowser, ServiceStateChange

from .api import YandexQuasarClient

_LOGGER = logging.getLogger(__name__)
SERVICE_TYPE = "_yandexio._tcp.local."


class YahomeLocalDiscovery:
    """Discover speakers that expose the local glagol WebSocket."""

    def __init__(
        self,
        hass: HomeAssistant,
        on_found: Callable[[dict[str, Any]], None],
    ) -> None:
        self._hass = hass
        self._on_found = on_found
        self._zeroconf = None
        self._browser: ServiceBrowser | None = None

    async def async_start(self) -> None:
        """Start mDNS discovery."""
        from homeassistant.components.zeroconf import async_get_instance

        self._zeroconf = await async_get_instance(self._hass)
        self._browser = ServiceBrowser(
            self._zeroconf,
            SERVICE_TYPE,
            handlers=[self._service_handler],
        )

    @callback
    def _service_handler(
        self,
        zeroconf,
        service_type: str,
        name: str,
        state_change: ServiceStateChange,
    ) -> None:
        if state_change not in (
            ServiceStateChange.Added,
            ServiceStateChange.Updated,
        ):
            return
        try:
            info = zeroconf.get_service_info(service_type, name)
            if not info or not info.addresses:
                return
            properties = {
                key.decode(): value.decode() if isinstance(value, bytes) else value
                for key, value in info.properties.items()
            }
            payload = {
                "device_id": properties.get("deviceId"),
                "platform": properties.get("platform"),
                "host": str(ipaddress.ip_address(info.addresses[0])),
                "port": info.port,
            }
        except Exception:  # noqa: BLE001
            return
        if payload["device_id"] and payload["host"]:
            self._hass.loop.call_soon_threadsafe(self._on_found, payload)

    def stop(self) -> None:
        """Stop mDNS discovery."""
        if self._browser:
            self._browser.cancel()
            self._browser = None
        self._zeroconf = None


class YahomeGlagol:
    """Persistent local connection to one Yandex speaker."""

    def __init__(
        self,
        session: ClientSession,
        quasar: YandexQuasarClient,
        device_id: str,
        platform: str,
        host: str,
        port: int,
        on_state: Callable[[dict[str, Any]], None],
    ) -> None:
        self._session = session
        self._quasar = quasar
        self._device_id = device_id
        self._platform = platform
        self._host = host
        self._port = port
        self._on_state = on_state
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._ws: ClientWebSocketResponse | None = None
        self._token: str | None = None
        self._waiters: dict[str, asyncio.Future] = {}
        self._last_state_ts = 0.0

    @property
    def connected(self) -> bool:
        """Return True while the local socket is open."""
        return self._ws is not None and not self._ws.closed

    async def start(self) -> None:
        """Start the connection loop."""
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop the connection loop."""
        self._stop.set()
        if self._ws and not self._ws.closed:
            await self._ws.close()
        if self._task:
            self._task.cancel()
            self._task = None

    async def _run(self) -> None:
        fails = 0
        while not self._stop.is_set():
            try:
                if not self._token:
                    self._token = await self._quasar.get_glagol_token(
                        self._device_id, self._platform
                    )
                if not self._token:
                    raise RuntimeError("No glagol token")

                self._ws = await self._session.ws_connect(
                    f"wss://{self._host}:{self._port}",
                    ssl=False,
                    heartbeat=55,
                    timeout=15,
                )
                fails = 0
                await self._send_raw({"command": "softwareVersion"})

                async for message in self._ws:
                    if message.type != WSMsgType.TEXT:
                        continue
                    try:
                        data = json.loads(message.data)
                    except (TypeError, ValueError):
                        continue
                    request_id = data.get("id")
                    if request_id in self._waiters:
                        waiter = self._waiters.pop(request_id)
                        if not waiter.done():
                            waiter.set_result(data)
                    state = data.get("state")
                    if isinstance(state, dict):
                        now = time.time()
                        if now - self._last_state_ts >= 0.7:
                            self._last_state_ts = now
                            self._on_state(state)

            except asyncio.CancelledError:
                raise
            except (ClientConnectorError, ConnectionResetError, RuntimeError) as err:
                _LOGGER.debug(
                    "Speaker %s local connection: %s", self._device_id, err
                )
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug(
                    "Speaker %s local error: %s", self._device_id, err
                )

            if self._ws and not self._ws.closed:
                await self._ws.close()
            self._ws = None
            self._token = None
            for waiter in self._waiters.values():
                if not waiter.done():
                    waiter.set_result({"error": "disconnected"})
            self._waiters.clear()
            if self._stop.is_set():
                break
            fails += 1
            await asyncio.sleep(min(30, 5 * fails))

    async def _send_raw(self, payload: dict[str, Any]) -> None:
        if not self._ws or self._ws.closed:
            return
        await self._ws.send_json(
            {
                "conversationToken": self._token,
                "id": str(uuid.uuid4()),
                "payload": payload,
                "sentTime": int(time.time() * 1000),
            }
        )

    async def send(
        self,
        payload: dict[str, Any],
        timeout: float = 5.0,
        wait: bool = True,
    ) -> dict[str, Any] | None:
        """Send a payload and optionally wait for the station response."""
        if not self._ws or self._ws.closed:
            return None
        if not wait:
            await self._send_raw(payload)
            return {}
        request_id = str(uuid.uuid4())
        waiter = asyncio.get_running_loop().create_future()
        self._waiters[request_id] = waiter
        try:
            await self._ws.send_json(
                {
                    "conversationToken": self._token,
                    "id": request_id,
                    "payload": payload,
                    "sentTime": int(time.time() * 1000),
                }
            )
            result = await asyncio.wait_for(waiter, timeout)
        except (asyncio.TimeoutError, ConnectionResetError):
            return None
        finally:
            self._waiters.pop(request_id, None)
        if not isinstance(result, dict):
            return None
        if status := result.get("status"):
            if status != "ok":
                return None
        return result

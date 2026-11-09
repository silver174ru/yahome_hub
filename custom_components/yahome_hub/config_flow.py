"""Config flow for YaHome Hub."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import (
    YahomeApiError,
    YahomeAuthError,
    YandexIoTClient,
    exchange_cookies_for_tokens,
)
from .const import (
    CONF_COOKIES,
    CONF_MUSIC_TOKEN,
    CONF_ONLY_STATION_DEVICES,
    CONF_SCAN_INTERVAL,
    CONF_TOKEN,
    CONF_X_TOKEN,
    COOKIES_URL,
    DEFAULT_ONLY_STATION_DEVICES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
    NAME,
)


class YahomeHubConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for YaHome Hub."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            token = user_input[CONF_TOKEN].strip()
            cookies = user_input.get(CONF_COOKIES, "").strip()
            session = async_get_clientsession(self.hass)
            iot = YandexIoTClient(session, token)

            try:
                payload = await iot.get_user_info()
            except YahomeAuthError:
                errors["base"] = "invalid_auth"
            except YahomeApiError:
                errors["base"] = "cannot_connect"
            else:
                if not payload.get("devices") and not payload.get("households"):
                    errors["base"] = "no_devices"
                elif cookies:
                    try:
                        x_token, music_token = await exchange_cookies_for_tokens(
                            session, cookies
                        )
                    except YahomeAuthError:
                        errors["base"] = "cookies"
                    except YahomeApiError:
                        errors["base"] = "cannot_connect"
                    else:
                        data = {
                            CONF_TOKEN: token,
                            CONF_COOKIES: cookies,
                            CONF_X_TOKEN: x_token,
                            CONF_MUSIC_TOKEN: music_token,
                        }
                        await self.async_set_unique_id(DOMAIN)
                        self._abort_if_unique_id_configured()
                        return self.async_create_entry(title=NAME, data=data)
                else:
                    data = {CONF_TOKEN: token}
                    await self.async_set_unique_id(DOMAIN)
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(title=NAME, data=data)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TOKEN): str,
                    vol.Optional(CONF_COOKIES, default=""): str,
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return YahomeHubOptionsFlow(config_entry)

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> config_entries.ConfigFlowResult:
        """Start reauthentication."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Update an expired token/cookies pair."""
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()

        if user_input is not None:
            token = user_input[CONF_TOKEN].strip()
            cookies = user_input.get(CONF_COOKIES, "").strip()
            session = async_get_clientsession(self.hass)
            iot = YandexIoTClient(session, token)
            try:
                await iot.get_user_info()
            except YahomeAuthError:
                errors["base"] = "invalid_auth"
            except YahomeApiError:
                errors["base"] = "cannot_connect"
            else:
                data = dict(entry.data)
                data[CONF_TOKEN] = token
                if cookies:
                    try:
                        x_token, music_token = await exchange_cookies_for_tokens(
                            session, cookies
                        )
                    except YahomeAuthError:
                        errors["base"] = "cookies"
                    except YahomeApiError:
                        errors["base"] = "cannot_connect"
                    else:
                        data[CONF_COOKIES] = cookies
                        data[CONF_X_TOKEN] = x_token
                        data[CONF_MUSIC_TOKEN] = music_token
                if not errors:
                    self.hass.config_entries.async_update_entry(entry, data=data)
                    await self.hass.config_entries.async_reload(entry.entry_id)
                    return self.async_abort(reason="reauth_successful")

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TOKEN): str,
                    vol.Optional(CONF_COOKIES, default=""): str,
                }
            ),
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Update token and cookies without removing the integration."""
        errors: dict[str, str] = {}
        entry = self.hass.config_entries.async_get_entry(
            self.context.get("entry_id", "")
        )
        if entry is None:
            return self.async_abort(reason="reconfigure_failed")

        if user_input is not None:
            token = user_input[CONF_TOKEN].strip()
            cookies = user_input.get(CONF_COOKIES, "").strip()
            session = async_get_clientsession(self.hass)
            iot = YandexIoTClient(session, token)
            try:
                await iot.get_user_info()
            except YahomeAuthError:
                errors["base"] = "invalid_auth"
            except YahomeApiError:
                errors["base"] = "cannot_connect"
            else:
                data = dict(entry.data)
                data[CONF_TOKEN] = token
                if cookies:
                    try:
                        x_token, music_token = await exchange_cookies_for_tokens(
                            session, cookies
                        )
                    except YahomeAuthError:
                        errors["base"] = "cookies"
                    except YahomeApiError:
                        errors["base"] = "cannot_connect"
                    else:
                        data[CONF_COOKIES] = cookies
                        data[CONF_X_TOKEN] = x_token
                        data[CONF_MUSIC_TOKEN] = music_token
                if not errors:
                    self.hass.config_entries.async_update_entry(entry, data=data)
                    await self.hass.config_entries.async_reload(entry.entry_id)
                    return self.async_abort(reason="reconfigure_successful")

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TOKEN): str,
                    vol.Optional(CONF_COOKIES, default=""): str,
                }
            ),
            errors=errors,
            description_placeholders={"cookies_url": COOKIES_URL},
        )


class YahomeHubOptionsFlow(config_entries.OptionsFlow):
    """Options for YaHome Hub."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._entry = config_entry

    @property
    def config_entry(self) -> config_entries.ConfigEntry:
        """Return the config entry."""
        return self._entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Manage options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_SCAN_INTERVAL,
                        default=options.get(
                            CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                        ),
                    ): vol.All(
                        vol.Coerce(int),
                        vol.Range(
                            min=MIN_SCAN_INTERVAL, max=MAX_SCAN_INTERVAL
                        ),
                    ),
                    vol.Optional(
                        CONF_ONLY_STATION_DEVICES,
                        default=options.get(
                            CONF_ONLY_STATION_DEVICES,
                            DEFAULT_ONLY_STATION_DEVICES,
                        ),
                    ): bool,
                }
            ),
        )

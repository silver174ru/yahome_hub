"""Unit tests for YaHome Hub helpers and video URL safety."""

from __future__ import annotations

from custom_components.yahome_hub.helpers import (
    device_type_label,
    is_car_alarm_device,
    is_hub_device,
    is_ir_remote_device,
)
from custom_components.yahome_hub.video import (
    audio_play_payload,
    is_public_http_url,
    video_descriptor,
)


def test_starline_car_alarm_is_its_own_device() -> None:
    """A StarLine remote_car must never be treated as a hub or IR remote."""
    device = {
        "type": "devices.types.remote_car",
        "name": "Рыжик",
        "device_info": {"manufacturer": "StarLine", "model": "Модуль"},
    }
    assert is_car_alarm_device(device)
    assert not is_hub_device(device)
    assert not is_ir_remote_device(device)
    assert device_type_label(device) == "Автосигнализация"


def test_yandex_saturn_hub_is_a_hub() -> None:
    """The Saturn hub is a hub, not a media speaker."""
    device = {
        "type": "devices.types.hub.yandex.saturn",
        "name": "Хаб",
    }
    assert is_hub_device(device)
    assert not is_ir_remote_device(device)
    assert device_type_label(device) == "Хаб"


def test_xiaomi_hub_is_detected_by_name_and_vendor() -> None:
    """A hub exposed as a light is still shown as a hub."""
    device = {
        "type": "devices.types.light",
        "name": "Xiaomi Smart Home Hub 2",
        "device_info": {"manufacturer": "lumi", "model": "lumi.gateway.mgl001"},
    }
    assert is_hub_device(device)
    assert device_type_label(device) == "Хаб"


def test_yandex_remote_is_an_ir_remote() -> None:
    """A hub-style Yandex remote is an IR remote, not a hub."""
    device = {
        "type": "devices.types.hub",
        "name": "Пульт",
        "device_info": {"manufacturer": "Yandex", "model": "YNDX-0006"},
    }
    assert is_ir_remote_device(device)
    assert not is_hub_device(device)
    assert device_type_label(device) == "ИК-пульт"


def test_public_http_url_rejects_local_targets() -> None:
    """Literal local addresses and non-HTTP schemes must be rejected."""
    assert is_public_http_url("https://example.com/video")
    assert not is_public_http_url("http://127.0.0.1/video")
    assert not is_public_http_url("http://192.168.1.5/video")
    assert not is_public_http_url("http://localhost/video")
    assert not is_public_http_url("file:///etc/passwd")
    assert not is_public_http_url("not a url")


def test_video_descriptor_does_not_mutate_template() -> None:
    """Each descriptor gets its own payload."""
    first = video_descriptor("ivi", "one")
    second = video_descriptor("okko", "two")
    first_descriptor = first["serverActionEventPayload"]["payload"]["data"][
        "video_descriptor"
    ]
    second_descriptor = second["serverActionEventPayload"]["payload"]["data"][
        "video_descriptor"
    ]
    assert first_descriptor["provider_name"] == "ivi"
    assert first_descriptor["provider_item_id"] == "one"
    assert second_descriptor["provider_name"] == "okko"
    assert second_descriptor["provider_item_id"] == "two"


def test_audio_play_payload_shape() -> None:
    """Direct streams use the externalCommandBypass envelope."""
    payload = audio_play_payload(
        "https://example.com/video.mp4", "Фильм", "Канал", "", False
    )
    assert payload["command"] == "externalCommandBypass"
    assert isinstance(payload["data"], str)

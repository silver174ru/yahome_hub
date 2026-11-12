"""Constants for the YaHome Hub integration."""

from __future__ import annotations

DOMAIN = "yahome_hub"
NAME = "YaHome Hub"
VERSION = "0.5.1"

API_BASE = "https://api.iot.yandex.net/v1.0"
QUASAR_BASE = "https://quasar.yandex.net"
QUASAR_IOT_BASE = "https://iot.quasar.yandex.ru"
PASSPORT_TOKEN_URL = (
    "https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid"
)
MUSIC_TOKEN_URL = "https://oauth.mobile.yandex.net/1/token"

# Public mobile-app client identifiers used by the official Yandex app.
# They are not user secrets and contain no account data.
MOBILE_CLIENT_ID = "c0ebe342af7d48fbbbfcf2d2eedb8f9e"
MOBILE_CLIENT_SECRET = "ad0a908f0aa341a182a37ecd75bc319e"
MUSIC_CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d"
MUSIC_CLIENT_SECRET = "53bc75238f0c4d08a118e51fe9203300"

EXCLUDED_SPEAKER_PLATFORMS = {
    "alice_app_android",
    "iot_app_android",
    "ya360_mail_android",
}

MUSIC_SPEAKER_PLATFORMS = {
    "yandexstation",
    "yandexstation_2",
    "yandexmini",
    "yandexmini_2",
    "yandexmicro",
    "yandexmidi",
    "cucumber",
    "chiron",
    "pickle",
    "bergamot",
    "orion",
}

LED_SPEAKER_PLATFORMS = {
    "yandexstation_2",
    "yandexmini_2",
    "orion",
    "cucumber",
    "plum",
    "bergamot",
}

HDMI_SPEAKER_PLATFORMS = {
    "yandexstation",
    "yandexstation_2",
}

SPEAKER_SOURCE_STATION = "Станция"
SPEAKER_SOURCE_HDMI = "HDMI"

CONF_TOKEN = "token"
CONF_COOKIES = "cookies"
CONF_MUSIC_TOKEN = "music_token"
CONF_X_TOKEN = "x_token"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_ONLY_STATION_DEVICES = "only_station_devices"

COOKIES_URL = (
    "https://github.com/silver174ru/yahome_hub/blob/main/COOKIES.md"
)

DEFAULT_SCAN_INTERVAL = 30
DEFAULT_ONLY_STATION_DEVICES = False
MIN_SCAN_INTERVAL = 10
MAX_SCAN_INTERVAL = 300

CAP_ON_OFF = "devices.capabilities.on_off"
CAP_RANGE = "devices.capabilities.range"
CAP_COLOR_SETTING = "devices.capabilities.color_setting"
CAP_MODE = "devices.capabilities.mode"
CAP_TOGGLE = "devices.capabilities.toggle"
CAP_OPEN = "devices.capabilities.open"
CAP_MEDIA_PLAYBACK = "devices.capabilities.media_playback"
CAP_VOLUME = "devices.capabilities.volume"
CAP_CHANNEL = "devices.capabilities.channel"
CAP_WORK_SPEED = "devices.capabilities.work_speed"
CAP_VIDEO_STREAM = "devices.capabilities.video_stream"
CAP_CAMERA_STREAM = "devices.capabilities.camera_stream"
CAP_TILT = "devices.capabilities.tilt"
CAP_ROTATION = "devices.capabilities.rotation"
CAP_VIBRATION = "devices.capabilities.vibration"
CAP_TEMPERATURE_SETTING = "devices.capabilities.temperature_setting"

PROP_FLOAT = "devices.properties.float"
PROP_EVENT = "devices.properties.event"
PROP_STRING = "devices.properties.string"
PROP_BOOL = "devices.properties.bool"

DEVICE_TYPE_LIGHT = "devices.types.light"
DEVICE_TYPE_SOCKET = "devices.types.socket"
DEVICE_TYPE_SWITCH = "devices.types.switch"
DEVICE_TYPE_CLIMATE = "devices.types.climate"
DEVICE_TYPE_AIR_CONDITIONER = "devices.types.air_conditioner"
DEVICE_TYPE_THERMOSTAT = "devices.types.thermostat"
DEVICE_TYPE_THERMOSTAT_AC = "devices.types.thermostat.ac"
DEVICE_TYPE_HUMIDIFIER = "devices.types.humidifier"
DEVICE_TYPE_DEHUMIDIFIER = "devices.types.dehumidifier"
DEVICE_TYPE_PURIFIER = "devices.types.purifier"
DEVICE_TYPE_FAN = "devices.types.fan"
DEVICE_TYPE_VENTILATION = "devices.types.ventilation"
DEVICE_TYPE_CURTAIN = "devices.types.curtain"
DEVICE_TYPE_BLIND = "devices.types.blind"
DEVICE_TYPE_GATE = "devices.types.gate"
DEVICE_TYPE_DOOR = "devices.types.door"
DEVICE_TYPE_WINDOW = "devices.types.window"
DEVICE_TYPE_OPENABLE = "devices.types.openable"
DEVICE_TYPE_MEDIA = "devices.types.media_device"
DEVICE_TYPE_TV = "devices.types.tv"
DEVICE_TYPE_RECEIVER = "devices.types.receiver"
DEVICE_TYPE_SPEAKER = "devices.types.speaker"
DEVICE_TYPE_VACUUM = "devices.types.vacuum_cleaner"
DEVICE_TYPE_CAMERA = "devices.types.camera"
DEVICE_TYPE_SENSOR = "devices.types.sensor"
DEVICE_TYPE_SENSOR_MOTION = "devices.types.sensor.motion"
DEVICE_TYPE_SENSOR_OPEN = "devices.types.sensor.open"
DEVICE_TYPE_SENSOR_WATER_LEAK = "devices.types.sensor.water_leak"
DEVICE_TYPE_SENSOR_SMOKE = "devices.types.sensor.smoke"
DEVICE_TYPE_SENSOR_GAS = "devices.types.sensor.gas"
DEVICE_TYPE_SENSOR_VIBRATION = "devices.types.sensor.vibration"
DEVICE_TYPE_SENSOR_BUTTON = "devices.types.sensor.button"
DEVICE_TYPE_SENSOR_TEMPERATURE = "devices.types.sensor.temperature"
DEVICE_TYPE_SENSOR_HUMIDITY = "devices.types.sensor.humidity"
DEVICE_TYPE_SENSOR_ILLUMINATION = "devices.types.sensor.illumination"
DEVICE_TYPE_SENSOR_PRESSURE = "devices.types.sensor.pressure"
DEVICE_TYPE_SENSOR_CO2 = "devices.types.sensor.co2"
DEVICE_TYPE_SENSOR_PM25 = "devices.types.sensor.pm2.5"
DEVICE_TYPE_KETTLE = "devices.types.kettle"
DEVICE_TYPE_COFFEE_MAKER = "devices.types.coffee_maker"
DEVICE_TYPE_COOKING = "devices.types.cooking"
DEVICE_TYPE_IRON = "devices.types.iron"
DEVICE_TYPE_WASHING_MACHINE = "devices.types.washing_machine"
DEVICE_TYPE_DISHWASHER = "devices.types.dishwasher"
DEVICE_TYPE_REFRIGERATOR = "devices.types.refrigerator"
DEVICE_TYPE_REMOTE_CAR = "devices.types.remote_car"
DEVICE_TYPE_HUB = "devices.types.hub"
DEVICE_TYPE_HUB_YANDEX = "devices.types.hub.yandex.saturn"

COVER_TYPES = {
    DEVICE_TYPE_CURTAIN,
    DEVICE_TYPE_BLIND,
    DEVICE_TYPE_GATE,
    DEVICE_TYPE_DOOR,
    DEVICE_TYPE_WINDOW,
    DEVICE_TYPE_OPENABLE,
}

CLIMATE_TYPES = {
    DEVICE_TYPE_CLIMATE,
    DEVICE_TYPE_AIR_CONDITIONER,
    DEVICE_TYPE_THERMOSTAT,
    DEVICE_TYPE_THERMOSTAT_AC,
}

FAN_TYPES = {
    DEVICE_TYPE_FAN,
    DEVICE_TYPE_VENTILATION,
    DEVICE_TYPE_PURIFIER,
}

HUMIDIFIER_TYPES = {
    DEVICE_TYPE_HUMIDIFIER,
    DEVICE_TYPE_DEHUMIDIFIER,
}

MEDIA_TYPES = {
    DEVICE_TYPE_MEDIA,
    DEVICE_TYPE_TV,
    DEVICE_TYPE_RECEIVER,
    DEVICE_TYPE_SPEAKER,
}

DEVICE_TYPE_LABELS: dict[str, str] = {
    DEVICE_TYPE_LIGHT: "Свет",
    DEVICE_TYPE_SOCKET: "Розетка",
    DEVICE_TYPE_SWITCH: "Выключатель",
    DEVICE_TYPE_CLIMATE: "Климат",
    DEVICE_TYPE_AIR_CONDITIONER: "Кондиционер",
    DEVICE_TYPE_THERMOSTAT: "Термостат",
    DEVICE_TYPE_THERMOSTAT_AC: "Термостат",
    DEVICE_TYPE_HUMIDIFIER: "Увлажнитель",
    DEVICE_TYPE_DEHUMIDIFIER: "Осушитель",
    DEVICE_TYPE_PURIFIER: "Очиститель воздуха",
    DEVICE_TYPE_FAN: "Вентилятор",
    DEVICE_TYPE_VENTILATION: "Вентиляция",
    DEVICE_TYPE_CURTAIN: "Шторы",
    DEVICE_TYPE_BLIND: "Жалюзи",
    DEVICE_TYPE_GATE: "Ворота",
    DEVICE_TYPE_DOOR: "Дверь",
    DEVICE_TYPE_WINDOW: "Окно",
    DEVICE_TYPE_OPENABLE: "Открывающееся устройство",
    DEVICE_TYPE_MEDIA: "Медиа",
    DEVICE_TYPE_TV: "Телевизор",
    DEVICE_TYPE_RECEIVER: "Ресивер",
    DEVICE_TYPE_SPEAKER: "Колонка",
    DEVICE_TYPE_VACUUM: "Пылесос",
    DEVICE_TYPE_CAMERA: "Камера",
    DEVICE_TYPE_SENSOR: "Датчик",
    DEVICE_TYPE_SENSOR_MOTION: "Датчик движения",
    DEVICE_TYPE_SENSOR_OPEN: "Датчик открытия",
    DEVICE_TYPE_SENSOR_WATER_LEAK: "Датчик протечки",
    DEVICE_TYPE_SENSOR_SMOKE: "Датчик дыма",
    DEVICE_TYPE_SENSOR_GAS: "Датчик газа",
    DEVICE_TYPE_SENSOR_VIBRATION: "Датчик вибрации",
    DEVICE_TYPE_SENSOR_BUTTON: "Кнопка",
    DEVICE_TYPE_SENSOR_TEMPERATURE: "Датчик температуры",
    DEVICE_TYPE_SENSOR_HUMIDITY: "Датчик влажности",
    DEVICE_TYPE_SENSOR_ILLUMINATION: "Датчик освещённости",
    DEVICE_TYPE_SENSOR_PRESSURE: "Датчик давления",
    DEVICE_TYPE_SENSOR_CO2: "Датчик CO2",
    DEVICE_TYPE_SENSOR_PM25: "Датчик PM2.5",
    DEVICE_TYPE_KETTLE: "Чайник",
    DEVICE_TYPE_COFFEE_MAKER: "Кофемашина",
    DEVICE_TYPE_COOKING: "Плита",
    DEVICE_TYPE_IRON: "Утюг",
    DEVICE_TYPE_WASHING_MACHINE: "Стиральная машина",
    DEVICE_TYPE_DISHWASHER: "Посудомоечная машина",
    DEVICE_TYPE_REFRIGERATOR: "Холодильник",
    DEVICE_TYPE_REMOTE_CAR: "Автосигнализация",
    DEVICE_TYPE_HUB: "Хаб",
    DEVICE_TYPE_HUB_YANDEX: "Хаб",
}

DEVICE_TYPE_ICONS: dict[str, str] = {
    DEVICE_TYPE_LIGHT: "mdi:lightbulb",
    DEVICE_TYPE_SOCKET: "mdi:power-socket",
    DEVICE_TYPE_SWITCH: "mdi:light-switch",
    DEVICE_TYPE_CLIMATE: "mdi:air-conditioner",
    DEVICE_TYPE_AIR_CONDITIONER: "mdi:air-conditioner",
    DEVICE_TYPE_THERMOSTAT: "mdi:thermostat",
    DEVICE_TYPE_THERMOSTAT_AC: "mdi:thermostat",
    DEVICE_TYPE_HUMIDIFIER: "mdi:air-humidifier",
    DEVICE_TYPE_DEHUMIDIFIER: "mdi:air-humidifier-off",
    DEVICE_TYPE_PURIFIER: "mdi:air-purifier",
    DEVICE_TYPE_FAN: "mdi:fan",
    DEVICE_TYPE_VENTILATION: "mdi:air-vent",
    DEVICE_TYPE_CURTAIN: "mdi:curtains",
    DEVICE_TYPE_BLIND: "mdi:blinds",
    DEVICE_TYPE_GATE: "mdi:gate",
    DEVICE_TYPE_DOOR: "mdi:door",
    DEVICE_TYPE_WINDOW: "mdi:window-closed",
    DEVICE_TYPE_OPENABLE: "mdi:window-open",
    DEVICE_TYPE_MEDIA: "mdi:play-circle",
    DEVICE_TYPE_TV: "mdi:television",
    DEVICE_TYPE_RECEIVER: "mdi:audio-video",
    DEVICE_TYPE_SPEAKER: "mdi:speaker",
    DEVICE_TYPE_VACUUM: "mdi:robot-vacuum",
    DEVICE_TYPE_CAMERA: "mdi:cctv",
    DEVICE_TYPE_SENSOR: "mdi:access-point",
    DEVICE_TYPE_SENSOR_MOTION: "mdi:motion-sensor",
    DEVICE_TYPE_SENSOR_OPEN: "mdi:door-open",
    DEVICE_TYPE_SENSOR_WATER_LEAK: "mdi:water-alert",
    DEVICE_TYPE_SENSOR_SMOKE: "mdi:smoke-detector",
    DEVICE_TYPE_SENSOR_GAS: "mdi:gas-cylinder",
    DEVICE_TYPE_SENSOR_VIBRATION: "mdi:vibrate",
    DEVICE_TYPE_SENSOR_BUTTON: "mdi:gesture-tap-button",
    DEVICE_TYPE_SENSOR_TEMPERATURE: "mdi:thermometer",
    DEVICE_TYPE_SENSOR_HUMIDITY: "mdi:water-percent",
    DEVICE_TYPE_SENSOR_ILLUMINATION: "mdi:brightness-5",
    DEVICE_TYPE_SENSOR_PRESSURE: "mdi:gauge",
    DEVICE_TYPE_SENSOR_CO2: "mdi:molecule-co2",
    DEVICE_TYPE_SENSOR_PM25: "mdi:blur",
    DEVICE_TYPE_KETTLE: "mdi:kettle",
    DEVICE_TYPE_COFFEE_MAKER: "mdi:coffee-maker",
    DEVICE_TYPE_COOKING: "mdi:stove",
    DEVICE_TYPE_IRON: "mdi:iron",
    DEVICE_TYPE_WASHING_MACHINE: "mdi:washing-machine",
    DEVICE_TYPE_DISHWASHER: "mdi:dishwasher",
    DEVICE_TYPE_REFRIGERATOR: "mdi:fridge",
    DEVICE_TYPE_REMOTE_CAR: "mdi:car-connected",
    DEVICE_TYPE_HUB: "mdi:home-assistant",
    DEVICE_TYPE_HUB_YANDEX: "mdi:home-assistant",
}

CAPABILITY_NAMES: dict[str, str] = {
    "on": "Питание",
    "brightness": "Яркость",
    "temperature": "Температура",
    "humidity": "Влажность",
    "fan_speed": "Скорость вентилятора",
    "volume": "Громкость",
    "channel": "Канал",
    "open": "Положение",
    "swing": "Качание",
    "oscillation": "Колебание",
    "ionization": "Ионизация",
    "backlight": "Подсветка",
    "display": "Дисплей",
    "mute": "Без звука",
    "pause": "Пауза",
    "keep_warm": "Поддержание тепла",
    "water_level": "Уровень воды",
    "program": "Программа",
    "mode": "Режим",
    "direction": "Направление",
    "color_scene": "Сцена",
    "temperature_k": "Цветовая температура",
    "rgb": "Цвет",
    "hsv": "Цвет",
    "clean": "Уборка",
    "dock": "На базу",
    "locate": "Найти",
    "controls_locked": "Блокировка управления",
    "cleanup_mode": "Режим уборки",
    "work_speed": "Мощность уборки",
    "screen_brightness": "Яркость экрана",
    "do_not_disturb": "Не беспокоить",
    "sound": "Звук",
}

MODE_VALUE_LABELS: dict[str, str] = {
    "wet_cleaning": "Влажная уборка",
    "dry_cleaning": "Сухая уборка",
    "mixed_cleaning": "Уборка и мытьё",
    "turbo": "Турбо",
    "min": "Минимум",
    "max": "Максимум",
    "medium": "Средне",
    "low": "Низко",
    "high": "Высоко",
    "quiet": "Тихо",
    "silent": "Тихо",
    "strong": "Сильно",
    "auto": "Авто",
    "heat": "Обогрев",
    "cool": "Охлаждение",
    "dry": "Осушение",
    "fan_only": "Вентиляция",
    "heat_cool": "Авто",
    "on": "Вкл",
    "off": "Выкл",
    "horizontal": "Горизонтально",
    "vertical": "Вертикально",
    "both": "Оба",
    "forward": "Прямо",
    "reverse": "Обратно",
    "left": "Влево",
    "right": "Вправо",
    "up": "Вверх",
    "down": "Вниз",
}

SENSOR_MAP: dict[str, dict[str, object]] = {    "temperature": {
        "name": "Температура",
        "unit": "°C",
        "device_class": "temperature",
        "state_class": "measurement",
    },
    "humidity": {
        "name": "Влажность",
        "unit": "%",
        "device_class": "humidity",
        "state_class": "measurement",
    },
    "battery_level": {
        "name": "Батарея",
        "unit": "%",
        "device_class": "battery",
        "state_class": "measurement",
    },
    "pm1": {
        "name": "PM1",
        "unit": "µg/m³",
        "device_class": "pm1",
        "state_class": "measurement",
    },
    "pm2.5": {
        "name": "PM2.5",
        "unit": "µg/m³",
        "device_class": "pm25",
        "state_class": "measurement",
    },
    "pm10": {
        "name": "PM10",
        "unit": "µg/m³",
        "device_class": "pm10",
        "state_class": "measurement",
    },
    "co2": {
        "name": "CO2",
        "unit": "ppm",
        "device_class": "carbon_dioxide",
        "state_class": "measurement",
    },
    "co": {
        "name": "CO",
        "unit": "ppm",
        "device_class": "carbon_monoxide",
        "state_class": "measurement",
    },
    "tvoc": {
        "name": "TVOC",
        "unit": "µg/m³",
        "device_class": "volatile_organic_compounds",
        "state_class": "measurement",
    },
    "illumination": {
        "name": "Освещённость",
        "unit": "lx",
        "device_class": "illuminance",
        "state_class": "measurement",
    },
    "pressure": {
        "name": "Давление",
        "unit": "mmHg",
        "device_class": "pressure",
        "state_class": "measurement",
    },
    "water_level": {
        "name": "Уровень воды",
        "unit": "%",
        "device_class": "water",
        "state_class": "measurement",
    },
    "power": {
        "name": "Мощность",
        "unit": "W",
        "device_class": "power",
        "state_class": "measurement",
    },
    "energy": {
        "name": "Энергия",
        "unit": "kWh",
        "device_class": "energy",
        "state_class": "total_increasing",
    },
    "voltage": {
        "name": "Напряжение",
        "unit": "V",
        "device_class": "voltage",
        "state_class": "measurement",
    },
    "current": {
        "name": "Ток",
        "unit": "A",
        "device_class": "current",
        "state_class": "measurement",
    },
    "frequency": {
        "name": "Частота",
        "unit": "Hz",
        "device_class": "frequency",
        "state_class": "measurement",
    },
    "sound_level": {
        "name": "Уровень шума",
        "unit": "dB",
        "device_class": "sound_pressure",
        "state_class": "measurement",
    },
}

EVENT_MAP: dict[str, dict[str, object]] = {
    "motion": {"name": "Движение", "device_class": "motion"},
    "presence": {"name": "Присутствие", "device_class": "occupancy"},
    "open": {"name": "Открытие", "device_class": "opening"},
    "water_leak": {"name": "Протечка", "device_class": "moisture"},
    "smoke": {"name": "Дым", "device_class": "smoke"},
    "gas": {"name": "Газ", "device_class": "gas"},
    "vibration": {"name": "Вибрация", "device_class": "vibration"},
    "button": {"name": "Кнопка", "device_class": None},
    "door": {"name": "Дверь", "device_class": "door"},
    "window": {"name": "Окно", "device_class": "window"},
    "tamper": {"name": "Вскрытие", "device_class": "tamper"},
    "sound": {"name": "Звук", "device_class": "sound"},
    "light": {"name": "Свет", "device_class": "light"},
    "heat": {"name": "Перегрев", "device_class": "heat"},
    "cold": {"name": "Переохлаждение", "device_class": "cold"},
}

SENSOR_ICONS: dict[str, str] = {
    "temperature": "mdi:thermometer",
    "humidity": "mdi:water-percent",
    "battery_level": "mdi:battery",
    "pm1": "mdi:blur",
    "pm2.5": "mdi:blur",
    "pm10": "mdi:blur",
    "co2": "mdi:molecule-co2",
    "co": "mdi:molecule-co",
    "tvoc": "mdi:air-filter",
    "illumination": "mdi:brightness-5",
    "pressure": "mdi:gauge",
    "water_level": "mdi:water",
    "power": "mdi:flash",
    "energy": "mdi:lightning-bolt",
    "voltage": "mdi:sine-wave",
    "current": "mdi:current-ac",
    "frequency": "mdi:sine-wave",
    "sound_level": "mdi:volume-high",
}

EVENT_ICONS: dict[str, str] = {
    "motion": "mdi:motion-sensor",
    "presence": "mdi:account-check",
    "open": "mdi:door-open",
    "water_leak": "mdi:water-alert",
    "smoke": "mdi:smoke-detector",
    "gas": "mdi:gas-cylinder",
    "vibration": "mdi:vibrate",
    "button": "mdi:gesture-tap-button",
    "door": "mdi:door",
    "window": "mdi:window-closed",
    "tamper": "mdi:shield-alert",
    "sound": "mdi:volume-high",
    "light": "mdi:brightness-5",
    "heat": "mdi:thermometer-alert",
    "cold": "mdi:snowflake-alert",
}

ACTIVE_EVENT_VALUES = {
    "detected",
    "present",
    "occupied",
    "open",
    "opened",
    "leak",
    "smoke",
    "gas",
    "motion",
    "vibration",
    "pressed",
    "button_pressed",
    "click",
    "tampered",
    "sound",
    "light",
    "heat",
    "cold",
    "on",
    "true",
    "1",
}

INACTIVE_EVENT_VALUES = {
    "not_detected",
    "not_present",
    "unoccupied",
    "closed",
    "no_leak",
    "no_smoke",
    "no_gas",
    "no_motion",
    "no_vibration",
    "released",
    "not_tampered",
    "no_sound",
    "no_light",
    "no_heat",
    "no_cold",
    "off",
    "false",
    "0",
}

import { PANEL_STYLES } from "./yahome-hub-styles.js?v=0.5.2";

const PANEL_BUILD = "0.5.2";

class YaHomeHubPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._loading = true;
    this._error = null;
    this._room = "all";
    this._query = "";
    this._selected = null;
    this._tab = "devices";
    this._hubFilter = "hubs";
    this._speakerTab = "music";
    try {
      this._speakerTab =
        localStorage.getItem("yahome-hub-speaker-tab") || "music";
    } catch (err) {
      this._speakerTab = "music";
    }
    this._viz = "bars";
    try {
      this._viz = localStorage.getItem("yahome-hub-viz") || "bars";
    } catch (err) {
      this._viz = "bars";
    }
    this._unsub = null;
    this._stateUnsub = null;
    this._trackCache = {};
    this._lyricsCache = {};
    this._musicResults = [];
    this._musicLikes = [];
    this._musicPlaylists = [];
    this._musicPlaylist = null;
    this._musicPlaylistTracks = [];
    this._musicQueues = {};
    this._musicTracks = {};
    this._musicTab = "search";
    this._musicTarget = null;
    this._musicQuery = "";
    this._musicLoading = false;
    this._musicError = null;
    this._musicNotice = null;
    this._playerSkin = 2;
    try {
      const skin = Number(localStorage.getItem("yahome-hub-player-skin"));
      if (skin >= 1 && skin <= 8) this._playerSkin = skin;
    } catch (err) {
      this._playerSkin = 2;
    }
    this._fullPlayer = null;
    this._showLyrics = true;
    this._haVideo = null;
    this._settingsOpen = {};
    this._streamSource = null;
    this._streamTargets = [];
    this._streamQuery = "";
    this._streamSyncMode = "on";
    this._streamTemplate = "{{ volume_level / 2 }}";
    this._streamUseProxy = true;
    this._streamQuality = "high";
    this._streamCodecs = "mp3";
    this._streamMuteSource = true;
    this._streamBidirectional = true;
    this._panelSource = {};
    this._streamSessions = [];
    this._streamSessionsLoaded = false;
    this._streamSessionsLoading = false;
    this._streamSessionsError = null;
    this._miniPlayerClosed = false;
    this._miniVideoKey = "";
    this._videoModeKey = "";
    this._tickCount = 0;
    this._quickDevice = null;
    this._viewFilter = "all";
    this._favorites = [];
    this._lastCardId = null;
    this._diagnostics = {};
    this._diagLoading = {};
    this._sensorTimer = null;
    this._sensorBusy = false;
    this._cardFields = {};
    try {
      const stored = JSON.parse(
        localStorage.getItem("yahome-hub-favorites") || "[]"
      );
      if (Array.isArray(stored)) {
        this._favorites = stored.filter((id) => typeof id === "string");
      }
    } catch (err) {
      this._favorites = [];
    }
    try {
      const stored = JSON.parse(
        localStorage.getItem("yahome-hub-card-fields") || "{}"
      );
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        this._cardFields = stored;
      }
    } catch (err) {
      this._cardFields = {};
    }
    this._beatTimer = null;
    this._beatLastLabel = 0;
    this._beatAnchors = {};
    this._lyricsOffset = 0;
    try {
      const stored = Number(localStorage.getItem("yahome-hub-lyrics-offset"));
      if (Number.isFinite(stored)) {
        this._lyricsOffset = Math.max(-5, Math.min(5, stored));
      }
    } catch (err) {
      this._lyricsOffset = 0;
    }
    this._ticker = null;
    this._stateTimer = null;
    this._hassReady = false;
    this._toast = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!hass) return;
    if (!this._hassReady) {
      this._hassReady = true;
      this._subscribe();
      this._load();
    }
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (this._hass && !this._hassReady) {
      this._hassReady = true;
      this._subscribe();
      this._load();
    }
    this._render();
  }

  disconnectedCallback() {
    if (this._unsub) {
      this._unsub.then((unsub) => unsub()).catch(() => {});
      this._unsub = null;
    }
    if (this._stateUnsub) {
      this._stateUnsub.then((unsub) => unsub()).catch(() => {});
      this._stateUnsub = null;
    }
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
    if (this._beatTimer) {
      clearInterval(this._beatTimer);
      this._beatTimer = null;
    }
    if (this._sensorTimer) {
      clearInterval(this._sensorTimer);
      this._sensorTimer = null;
    }
    if (this._stateTimer) {
      clearTimeout(this._stateTimer);
      this._stateTimer = null;
    }
  }

  async _subscribe() {
    if (!this._hass || this._unsub) return;
    this._unsub = this._hass.connection.subscribeEvents(
      () =>
        this._load(
          (this._tab === "speakers" || this._fullPlayer) && !this._selected
        ),
      "yahome_hub_updated"
    );
    this._stateUnsub = this._hass.connection.subscribeEvents(
      (event) => this._onStateChanged(event),
      "state_changed"
    );
    this._hass
      .callWS({ type: "yahome_hub/lyrics_offset", offset: this._lyricsOffset })
      .catch(() => {});
  }

  _onStateChanged(event) {
    const entityId = event && event.data ? event.data.entity_id : "";
    if (!entityId) return;
    const media = entityId.startsWith("media_player.");
    const auxiliary =
      entityId.startsWith("select.") ||
      entityId.startsWith("camera.") ||
      entityId.startsWith("switch.") ||
      entityId.startsWith("light.");
    const uiOpen =
      this._tab === "speakers" ||
      this._tab === "devices" ||
      Boolean(this._fullPlayer);
    if (!media && !(auxiliary && uiOpen)) {
      return;
    }
    clearTimeout(this._stateTimer);
    this._stateTimer = setTimeout(() => {
      this._updatePlayerDom();
      this._syncExtras();
    }, 180);
  }

  async _load(silent = false) {
    if (!this._hass) return;
    const previous = this._data;
    try {
      this._error = null;
      this._data = await this._hass.callWS({ type: "yahome_hub/devices" });
    } catch (err) {
      this._error = err && err.message ? err.message : String(err);
    }
    this._loading = false;
    if (
      !previous ||
      !silent ||
      this._speakerSignature(previous) !== this._speakerSignature(this._data)
    ) {
      this._render();
    } else {
      this._updatePlayerDom();
    }
  }

  _speakerSignature(data) {
    return JSON.stringify({
      counts: data ? data.counts : null,
      speakers: ((data && data.speakers) || []).map((speaker) => [
        speaker.id,
        speaker.name,
        speaker.platform,
        speaker.entity_id,
        speaker.equalizer_entity,
        speaker.lyrics_entity,
        speaker.music_quality,
      ]),
    });
  }

  async _refresh() {
    if (!this._hass) return;
    this._loading = true;
    this._render();
    try {
      await this._hass.callWS({ type: "yahome_hub/refresh" });
      await this._load();
      this._showToast("Данные обновлены");
    } catch (err) {
      this._showToast("Ошибка обновления: " + this._message(err));
      this._loading = false;
      this._render();
    }
  }

  async _export() {
    if (!this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "yahome_hub/export" });
      this._showToast("База сохранена: " + result.path + " и " + result.sqlite);
    } catch (err) {
      this._showToast("Ошибка экспорта: " + this._message(err));
    }
  }

  async _action(device, capability, value) {
    if (!this._hass) return;
    try {
      await this._hass.callWS({
        type: "yahome_hub/action",
        device_id: device.id,
        capability_type: capability.type,
        instance: capability.instance || "",
        value: value,
      });
      await this._load();
    } catch (err) {
      this._showToast("Ошибка команды: " + this._message(err));
    }
  }

  async _scenario(id) {
    if (!this._hass) return;
    try {
      await this._hass.callWS({
        type: "yahome_hub/scenario",
        scenario_id: id,
      });
      this._showToast("Сценарий запущен");
    } catch (err) {
      this._showToast("Ошибка сценария: " + this._message(err));
    }
  }

  _message(err) {
    if (!err) return "неизвестная ошибка";
    if (typeof err === "string") return err;
    return err.message || JSON.stringify(err);
  }

  _colorPresets() {
    return [
      ["Тёплый белый", "#ffd9a0"],
      ["Холодный белый", "#d8ecff"],
      ["Красный", "#ff3b30"],
      ["Оранжевый", "#ff9500"],
      ["Жёлтый", "#ffd60a"],
      ["Зелёный", "#34c759"],
      ["Бирюзовый", "#30d5c8"],
      ["Голубой", "#32ade6"],
      ["Синий", "#3b82f6"],
      ["Фиолетовый", "#8b5cf6"],
      ["Розовый", "#ff4f9a"],
      ["Малиновый", "#e11d48"],
    ].map(([name, hex]) => ({ name, hex }));
  }

  _hexToRgbInt(hex) {
    const value = String(hex || "").replace("#", "");
    return parseInt(value.slice(0, 6), 16) || 0;
  }

  _hexToHsv(hex) {
    let value = String(hex || "").replace("#", "");
    if (value.length === 3) {
      value = value
        .split("")
        .map((char) => char + char)
        .join("");
    }
    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max ? delta / max : 0;
    return `${Math.round(h)},${Math.round(s * 100)},${Math.round(max * 100)}`;
  }

  _modeLabel(value) {
    const labels = {
      wet_cleaning: "Влажная уборка",
      dry_cleaning: "Сухая уборка",
      mixed_cleaning: "Уборка и мытьё",
      turbo: "Турбо",
      min: "Минимум",
      max: "Максимум",
      medium: "Средне",
      low: "Низко",
      high: "Высоко",
      quiet: "Тихо",
      silent: "Тихо",
      strong: "Сильно",
      auto: "Авто",
      heat: "Обогрев",
      cool: "Охлаждение",
      dry: "Осушение",
      fan_only: "Вентиляция",
      heat_cool: "Авто",
      on: "Вкл",
      off: "Выкл",
      horizontal: "Горизонтально",
      vertical: "Вертикально",
      both: "Оба",
      forward: "Прямо",
      reverse: "Обратно",
      left: "Влево",
      right: "Вправо",
      up: "Вверх",
      down: "Вниз",
    };
    return labels[String(value).toLowerCase()] || value;
  }

  _setControlStatus(speakerId, text) {
    const el = this.shadowRoot
      ? this.shadowRoot.querySelector(`[data-control-status="${speakerId}"]`)
      : null;
    if (el) el.textContent = text;
  }

  _showToast(text) {
    this._toast = text;
    this._render();
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this._toast = null;
      this._render();
    }, 3500);
  }

  _findCap(device, type, instance) {
    return (device.capabilities || []).find(
      (cap) =>
        cap.type === type &&
        (instance === undefined ||
          instance === null ||
          cap.instance === instance ||
          cap.instance === null ||
          cap.instance === undefined)
    );
  }

  _value(device, type, instance) {
    const cap = this._findCap(device, type, instance);
    return cap ? cap.value : null;
  }

  _isOn(device) {
    const value = this._value(device, "devices.capabilities.on_off", "on");
    return value === true || value === "true" || value === 1;
  }

  _stateText(device) {
    if (!device.online) return "Не в сети";
    if (device.primary_domain === "light" || device.primary_domain === "switch") {
      return this._isOn(device) ? "Включено" : "Выключено";
    }
    if (device.primary_domain === "vacuum") {
      return this._isOn(device) ? "Убирает" : "На базе";
    }
    if (device.primary_domain === "cover") {
      const open = this._value(device, "devices.capabilities.open", "open");
      return open === null || open === undefined ? "—" : `${open}%`;
    }
    if (device.primary_domain === "climate") {
      const temp = this._value(device, "devices.capabilities.range", "temperature");
      const current = (device.properties || []).find(
        (prop) => prop.instance === "temperature"
      );
      if (temp !== null && temp !== undefined) {
        return `${temp}°C`;
      }
      if (current) return `${current.value}°C`;
      return this._isOn(device) ? "Включено" : "Выключено";
    }
    if (device.primary_domain === "fan") {
      const speed = this._value(device, "devices.capabilities.range", "fan_speed");
      return speed !== null && speed !== undefined
        ? `${speed}%`
        : this._isOn(device)
        ? "Включено"
        : "Выключено";
    }
    if (device.primary_domain === "humidifier") {
      const humidity = this._value(device, "devices.capabilities.range", "humidity");
      return humidity !== null && humidity !== undefined ? `${humidity}%` : "—";
    }
    if (device.properties && device.properties.length) {
      return `${device.properties[0].name}: ${device.properties[0].value}`;
    }
    return "—";
  }

  _propIcon(instance) {
    const icons = {
      temperature: "mdi:thermometer",
      humidity: "mdi:water-percent",
      battery_level: "mdi:battery",
      motion: "mdi:motion-sensor",
      presence: "mdi:account-check",
      open: "mdi:door-open",
      water_leak: "mdi:water-alert",
      smoke: "mdi:smoke-detector",
      gas: "mdi:gas-cylinder",
      vibration: "mdi:vibrate",
      button: "mdi:gesture-tap-button",
      illumination: "mdi:brightness-5",
      pressure: "mdi:gauge",
      co2: "mdi:molecule-co2",
      pm25: "mdi:blur",
      power: "mdi:flash",
      energy: "mdi:lightning-bolt",
      voltage: "mdi:sine-wave",
      current: "mdi:current-ac",
      water_level: "mdi:water",
      sound_level: "mdi:volume-high",
    };
    return icons[instance] || "mdi:eye-outline";
  }

  _deviceColor(device) {
    const domain = device.primary_domain;
    if (domain === "light") return "#f6b73c";
    if (domain === "vacuum") return "#7c5cff";
    if (domain === "climate") return "#2aa7ff";
    if (domain === "fan") return "#22b8a7";
    if (domain === "humidifier") return "#35c4e8";
    if (domain === "cover") return "#a56bff";
    if (domain === "media_player") return "#ff6b6b";
    if (domain === "camera") return "#6b7cff";
    if (domain === "sensor") return "#4caf50";
    return "#6f7b8a";
  }

  _filteredDevices() {
    if (!this._data) return [];
    const query = this._query.trim().toLowerCase();
    return this._data.devices.filter((device) => {
      const roomOk =
        this._room === "all" ||
        (this._room === "none" && !device.room_name) ||
        device.room_name === this._room;
      if (!roomOk) return false;
      if (!this._matchesViewFilter(device)) return false;
      if (!query) return true;
      return (
        device.name.toLowerCase().includes(query) ||
        (device.type_label || "").toLowerCase().includes(query) ||
        (device.room_name || "").toLowerCase().includes(query)
      );
    });
  }

  _matchesViewFilter(device) {
    const filter = this._viewFilter;
    if (!filter || filter === "all") return true;
    if (filter === "online") return Boolean(device.online);
    if (filter === "offline") return !device.online;
    const domain = device.primary_domain || "";
    const type = (device.type || "").toLowerCase();
    if (filter === "light") {
      return (
        domain === "light" ||
        domain === "cover" ||
        /light|lamp|strip|sensor_switch/.test(type)
      );
    }
    if (filter === "climate") {
      return (
        domain === "climate" ||
        domain === "fan" ||
        domain === "humidifier" ||
        /climate|conditioner|heater|humidifier|fan/.test(type)
      );
    }
    if (filter === "media") {
      return domain === "media_player" || /media|tv|speaker/.test(type);
    }
    if (filter === "sensors") {
      return (
        domain === "sensor" ||
        domain === "binary_sensor" ||
        domain === "camera"
      );
    }
    if (filter === "switches") {
      return domain === "switch" || domain === "vacuum";
    }
    return true;
  }

  _filterCounts(devices) {
    return {
      all: devices.length,
      online: devices.filter((device) => device.online).length,
      light: devices.filter((device) => this._matchesViewFilterFor(device, "light"))
        .length,
      climate: devices.filter((device) =>
        this._matchesViewFilterFor(device, "climate")
      ).length,
      media: devices.filter((device) => this._matchesViewFilterFor(device, "media"))
        .length,
      sensors: devices.filter((device) =>
        this._matchesViewFilterFor(device, "sensors")
      ).length,
    };
  }

  _matchesViewFilterFor(device, filter) {
    const previous = this._viewFilter;
    this._viewFilter = filter;
    const result = this._matchesViewFilter(device);
    this._viewFilter = previous;
    return result;
  }

  _render() {
    if (!this.shadowRoot) return;
    const data = this._data;
    const selected = data
      ? data.devices.find((device) => device.id === this._selected)
      : null;
    const devices = this._filteredDevices();
    const counts = data ? data.counts : null;

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="shell">
        ${this._renderHeader(counts)}
        ${data ? this._renderTabs(data) : ""}
        ${this._error ? `<div class="error">${this._esc(this._error)}</div>` : ""}
        ${this._loading && !data ? this._renderLoading() : ""}
        ${
          data
            ? selected
              ? this._renderDetail(selected)
              : this._renderTabContent(data, devices)
            : ""
        }
        ${this._toast ? `<div class="toast">${this._esc(this._toast)}</div>` : ""}
      </div>
      ${data ? this._renderQuickSheet(data) : ""}
      ${data && this._fullPlayer ? this._renderFullPlayer(data) : ""}
      ${data ? this._renderMiniPlayer() : ""}
      ${this._haVideo ? this._renderHaVideo() : ""}
    `;
    this._attachEvents();
    this._enhanceSettings();
    this._updateMiniPlayer();
    this._startTicker();
    this._startBeatClock();
    this._startSensorPolling();
  }

  _enhanceSettings() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll(".test-panel .test-grid").forEach((grid) => {
      if (grid.getAttribute("data-settings-enhanced")) return;
      const blocks = [...grid.children].filter((item) =>
        item.classList.contains("test-block")
      );
      if (!blocks.length) return;
      blocks.forEach((section, index) => {
        if (section.tagName === "DETAILS") return;
        const heading = section.querySelector("h4");
        if (!heading) return;
        const title = heading.textContent.trim();
        const details = document.createElement("details");
        details.className = `${section.className} settings-group`;
        details.open =
          this._settingsOpen[title] !== undefined
            ? this._settingsOpen[title]
            : index < 3;
        details.addEventListener("toggle", () => {
          this._settingsOpen[title] = details.open;
        });
        const summary = document.createElement("summary");
        summary.appendChild(heading);
        details.appendChild(summary);
        while (section.firstChild) details.appendChild(section.firstChild);
        section.replaceWith(details);
      });
      const bar = document.createElement("div");
      bar.className = "settings-collapse-bar";
      bar.innerHTML =
        '<button class="ghost-btn" type="button">Развернуть все</button>';
      const button = bar.querySelector("button");
      button.addEventListener("click", () => {
        const groups = [...grid.querySelectorAll("details.settings-group")];
        const expand = groups.some((group) => !group.open);
        groups.forEach((group) => {
          group.open = expand;
        });
        button.textContent = expand ? "Свернуть все" : "Развернуть все";
      });
      grid.parentElement.insertBefore(bar, grid);
      grid.setAttribute("data-settings-enhanced", "1");
    });
  }

  _renderMiniPlayer() {
    return `<div class="mini-player" data-mini-player hidden>
      <button class="mini-cover" data-mini-open="" title="Открыть плеер">
        <img data-mini-cover alt="" />
        <span class="mini-badge" data-mini-badge><ha-icon icon="mdi:play"></ha-icon></span>
      </button>
      <div class="mini-info" data-mini-open="">
        <span class="mini-kicker" data-mini-kicker>Видео</span>
        <b data-mini-title>Видео</b>
        <span class="mini-meta" data-mini-meta></span>
        <span class="alice-live mini-alice" data-mini-alice><i></i><span data-mini-alice-label>Алиса · Свободна</span></span>
      </div>
      <div class="mini-progress"><span data-mini-progress></span></div>
      <div class="mini-controls">
        <button data-player-action="previous" data-mini-prev title="Предыдущее"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
        <button class="mini-play" data-player-action="playpause" data-mini-play title="Пауза"><ha-icon icon="mdi:pause"></ha-icon></button>
        <button data-player-action="next" data-mini-next title="Следующее"><ha-icon icon="mdi:skip-next"></ha-icon></button>
        <button data-video-close="" data-mini-video-close title="Закрыть видео"><ha-icon icon="mdi:close-circle-outline"></ha-icon></button>
        <button data-mini-open="" title="Развернуть"><ha-icon icon="mdi:arrow-expand"></ha-icon></button>
        <button data-mini-close title="Скрыть"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
    </div>`;
  }

  _updateMiniPlayer() {
    const root = this.shadowRoot;
    const el = root ? root.querySelector("[data-mini-player]") : null;
    if (!el) return;
    const found = this._activeMedia();
    const shell = root.querySelector(".shell");
    if (!found) {
      el.hidden = true;
      if (shell) shell.classList.remove("has-mini-player");
      this._miniVideoKey = "";
      return;
    }

    const { speaker, entity, info } = found;
    const key = `${info.kind}|${speaker.id}|${info.provider}|${info.title}`;
    if (this._miniVideoKey !== key) {
      this._miniVideoKey = key;
      this._miniPlayerClosed = false;
    }
    const visible = !this._fullPlayer && !this._miniPlayerClosed;
    el.hidden = !visible;
    if (shell) shell.classList.toggle("has-mini-player", visible);
    if (!visible) return;
    el.setAttribute("data-mini-speaker", speaker.id);
    el.classList.toggle("playing", info.playing);

    const cover = el.querySelector("[data-mini-cover]");
    if (cover) {
      if (info.thumbnail) {
        if (cover.getAttribute("src") !== info.thumbnail) {
          cover.setAttribute("src", info.thumbnail);
        }
        cover.hidden = false;
      } else {
        cover.removeAttribute("src");
        cover.hidden = true;
      }
    }
    const badge = el.querySelector("[data-mini-badge]");
    if (badge) {
      const icon =
        info.kind === "video"
          ? info.provider === "youtube"
            ? "mdi:youtube"
            : "mdi:play-circle"
          : info.mode === "radio"
          ? "mdi:radio"
          : "mdi:music";
      badge.innerHTML = `<ha-icon icon="${icon}"></ha-icon>`;
    }
    const kicker = el.querySelector("[data-mini-kicker]");
    if (kicker) {
      kicker.textContent =
        info.kind === "video"
          ? this._videoProviderLabel(info.provider)
          : info.mode === "radio"
          ? "Радио"
          : "Музыка";
    }
    const title = el.querySelector("[data-mini-title]");
    if (title) title.textContent = info.title;
    const meta = el.querySelector("[data-mini-meta]");
    if (meta) {
      meta.textContent =
        info.subtitle || (info.playing ? "Идёт воспроизведение" : "Пауза");
    }
    const aliceInfo = this._aliceInfo(entity.attributes || {});
    const aliceEl = el.querySelector("[data-mini-alice]");
    if (aliceEl) {
      aliceEl.hidden = false;
      aliceEl.className = `alice-live mini-alice ${aliceInfo.state.toLowerCase()}`;
      const aliceText = aliceEl.querySelector("[data-mini-alice-label]");
      const nextAlice = `Алиса · ${aliceInfo.label}`;
      if (aliceText && aliceText.textContent !== nextAlice) {
        aliceText.textContent = nextAlice;
      }
    }
    const play = el.querySelector("[data-mini-play]");
    if (play) {
      play.setAttribute("data-player-entity", entity.entity_id);
      const icon = play.querySelector("ha-icon");
      if (icon) icon.setAttribute("icon", info.playing ? "mdi:pause" : "mdi:play");
      play.title = info.playing ? "Пауза" : "Продолжить";
    }
    const prev = el.querySelector("[data-mini-prev]");
    if (prev) prev.setAttribute("data-player-entity", entity.entity_id);
    const next = el.querySelector("[data-mini-next]");
    if (next) next.setAttribute("data-player-entity", entity.entity_id);
    const closeVideo = el.querySelector("[data-mini-video-close]");
    if (closeVideo) {
      closeVideo.setAttribute("data-video-close", speaker.id);
      closeVideo.hidden = info.kind !== "video" || info.playing;
    }
    el.querySelectorAll("[data-mini-open]").forEach((button) =>
      button.setAttribute("data-mini-open", speaker.id)
    );
    const progress = el.querySelector("[data-mini-progress]");
    if (progress) {
      const pct = info.duration
        ? Math.min(100, Math.max(0, (info.position / info.duration) * 100))
        : 0;
      progress.style.width = `${pct}%`;
    }
  }

  _panelStreamTargets(excludeEntityId) {
    return Object.values(this._hass?.states || {})
      .filter((state) => {
        if (!state.entity_id.startsWith("media_player.")) return false;
        if (state.entity_id === excludeEntityId) return false;
        if (["unavailable", "unknown"].includes(state.state)) return false;
        return (
          (Number(state.attributes.supported_features || 0) & 512) === 512
        );
      })
      .map((state) => {
        const platform = this._hass?.entities?.[state.entity_id]?.platform || "";
        let name = state.attributes.friendly_name || state.entity_id;
        if (platform === "cast") {
          name = `${name} · Cast`;
        } else if (
          ["androidtv_remote", "androidtv", "firetv"].includes(platform)
        ) {
          name = `${name} · TV`;
        }
        return { entity_id: state.entity_id, name };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  _renderPanelSource(speaker, entity) {
    const attrs = entity.attributes || {};
    const targets = this._panelStreamTargets(entity.entity_id);
    if (!targets.length && !(attrs.source_list || []).length) return "";
    const options = [];
    for (const item of attrs.source_list || ["Станция"]) {
      if (!options.includes(item)) options.push(item);
    }
    for (const target of targets) {
      const value = `Трансляция: ${target.name}`;
      if (!options.includes(value)) options.push(value);
    }
    const selected =
      this._panelSource[entity.entity_id] || attrs.source || options[0];
    if (selected && !options.includes(selected)) options.push(selected);
    return `<div class="source-switch wide panel-source" title="Источник звука">
      <span><ha-icon icon="mdi:cast"></ha-icon> Источник</span>
      ${options
        .map((value) => {
          const stream = value.startsWith("Трансляция: ");
          const label = stream ? value.slice("Трансляция: ".length) : value;
          const icon = value === "HDMI"
            ? "mdi:television-speaker"
            : stream
            ? "mdi:cast"
            : "mdi:speaker";
          return `<button class="${
            value === selected ? "active" : ""
          }" data-source-select="${this._esc(
            speaker.id
          )}" data-entity="${this._esc(entity.entity_id)}" data-source="${this._esc(
            value
          )}" title="${this._esc(value)}">
            <ha-icon icon="${icon}"></ha-icon> ${this._esc(label)}
          </button>`;
        })
        .join("")}
    </div>`;
  }

  _renderSpeakerExtras(speaker, entity) {
    const attrs = entity.attributes || {};
    const hdmiSupported = Boolean(speaker.hdmi_supported);
    const ledSupported = Boolean(speaker.led_supported);
    const panelSource = this._renderPanelSource(speaker, entity);
    if (!hdmiSupported && !ledSupported && !panelSource) return "";
    const autoEntity = speaker.led_auto_entity
      ? this._hass.states[speaker.led_auto_entity]
      : null;
    const ledAuto = autoEntity ? autoEntity.state === "on" : true;
    return `<div class="speaker-extras">
      ${panelSource}
      ${
        ledSupported
          ? `<button class="extra-pill ${ledAuto ? "active" : ""}" data-led-auto="${
              speaker.id
            }" data-entity="${this._esc(
              entity.entity_id
            )}" data-auto-entity="${this._esc(
              speaker.led_auto_entity || ""
            )}" title="Автоматическая яркость подсветки">
              <ha-icon icon="mdi:brightness-auto"></ha-icon> LED авто
            </button>`
          : ""
      }
    </div>`;
  }

  _renderFullPlayer(data) {
    const speaker = (data.speakers || []).find(
      (item) => item.id === this._fullPlayer
    );
    if (!speaker || !speaker.entity_id) return "";
    return `<div class="player-modal" data-player-modal>
      <div class="player-modal-backdrop" data-close-player></div>
      <div class="player-modal-body">
        ${this._renderFullPlayerCard(speaker)}
      </div>
    </div>`;
  }

  _renderFullPlayerCard(speaker) {
    const entityId = speaker.entity_id;
    const entity = this._hass.states[entityId];
    if (!entity) return "";
    const attrs = entity.attributes || {};
    const playing = entity.state === "playing";
    const paused = entity.state === "paused";
    const trackId = String(attrs.media_content_id || "");
    const trackInfo = /^\d+$/.test(trackId) ? this._trackInfo(trackId) : null;
    const image = this._speakerImage(speaker);
    const video = this._videoInfo(speaker, entity);
    const cover =
      video.active && video.thumbnail
        ? video.thumbnail
        : attrs.entity_picture || (trackInfo && trackInfo.cover) || image;
    const title = attrs.media_title || "Готов к воспроизведению";
    const artist = attrs.media_artist || speaker.name;
    const album =
      attrs.media_album_name ||
      attrs.media_playlist ||
      (trackInfo && trackInfo.album) ||
      "";
    const duration = Number(attrs.media_duration) || 0;
    const position = this._currentPosition(entity);
    const volume =
      attrs.volume_level !== undefined && attrs.volume_level !== null
        ? Math.round(Number(attrs.volume_level) * 100)
        : 0;
    const muted = Boolean(attrs.is_volume_muted) || volume === 0;
    const lyrics = this._lyricsFor(speaker);
    const lyric = this._lyricLines(lyrics, position + this._lyricsOffset);
    const skin = this._playerSkin || 2;
    const modeInfo = this._playerMode(speaker, entity);
    const musicQuality = speaker.music_quality || "high";
    const aliceInfo = this._aliceInfo(attrs);
    const engineInfo = this._engineInfo(modeInfo);
    const canStop = Boolean(attrs.can_stop);
    const liveText = String(attrs.live_stream || "");
    const liveName = String(
      attrs.live_stream_subtitle || attrs.media_artist || ""
    );
    const kicker = video.active
      ? playing
        ? "Сейчас играет видео"
        : paused
        ? "Пауза · видео"
        : "Видео"
      : playing
      ? "Сейчас играет"
      : paused
      ? "Пауза"
      : entity.state === "off"
      ? "Выключена"
      : "Колонка";
    return `<article class="player full full-player skin-${skin} ${
      video.active ? "video-mode" : ""
    } mode-${modeInfo.mode} ${
      playing ? "playing" : ""
    } ${paused ? "paused" : ""}" data-player="${this._esc(
      speaker.id
    )}" data-player-entity="${this._esc(entityId)}" style="--beat-dur:${(
      60 / this._trackBpm(entity)
    ).toFixed(3)}s;--beat:0;${
      cover ? `--cover:url('${this._esc(cover)}')` : ""
    }">
      <div class="full-bg"></div>
      <div class="full-shade"></div>
      <div class="full-content">
        <header class="full-header">
          <div class="full-title">
            <div class="player-topline">
              <span class="engine-pill engine-${modeInfo.mode}" data-engine-pill title="Технический тип: ${this._esc(
                engineInfo.raw
              )}">
                <ha-icon icon="${engineInfo.icon}"></ha-icon>
                <b data-engine-label>${this._esc(engineInfo.label)}</b>
              </span>
              <span class="alice-live ${aliceInfo.state.toLowerCase()}" data-alice-live>
                <i></i><span data-alice-label>Алиса · ${this._esc(
                  aliceInfo.label
                )}</span>
              </span>
            </div>
            <span class="full-kicker" data-player-kicker><span class="beat-dot" data-beat-dot></span>${kicker}</span>
            <h2 data-player-title>${this._esc(title)}</h2>
            <p data-player-meta>${this._esc(artist)}${
      album ? ` · ${this._esc(album)}` : ""
    }</p>
            <div class="player-badges">
              <span class="live-badge" data-live-badge ${
                liveText ? "" : "hidden"
              }><ha-icon icon="mdi:radio"></ha-icon> <span data-live-name>${this._esc(
      liveName || liveText
    )}</span></span>
            </div>
          </div>
          <div class="full-actions">
            <button class="round-btn" data-music-scroll="${this._esc(
              speaker.id
            )}" title="Поиск музыки"><ha-icon icon="mdi:magnify"></ha-icon></button>
            ${
              video.active
                ? video.url
                  ? `<button class="round-btn video-link" data-video-open="${this._esc(
                      video.url
                    )}" title="Открыть видео"><ha-icon icon="mdi:open-in-new"></ha-icon></button>`
                  : ""
                : `<button class="round-btn" data-toggle-lyrics title="Текст песни"><ha-icon icon="mdi:text-box-music"></ha-icon></button>`
            }
            ${
              video.active
                ? `<button class="round-btn" data-video-close="${this._esc(
                    speaker.id
                  )}" title="Закрыть видео" ${
                    video.playing ? "hidden" : ""
                  }><ha-icon icon="mdi:close-circle-outline"></ha-icon></button>`
                : ""
            }
            <button class="round-btn" data-close-player title="Закрыть"><ha-icon icon="mdi:close"></ha-icon></button>
            <button class="round-btn power ${
              entity.state !== "off" ? "on" : ""
            }" data-player-power="${this._esc(
      entityId
    )}" title="Вкл/выкл"><ha-icon icon="mdi:power"></ha-icon></button>
          </div>
        </header>
        <div class="full-main">
          <div class="full-cover-wrap">
            <div class="player-cover big ${video.active ? "video" : ""}">
              ${
                cover
                  ? `<img data-player-cover src="${this._esc(
                      cover
                    )}" alt="" loading="lazy" />`
                  : `<ha-icon data-cover-fallback icon="mdi:speaker"></ha-icon>`
              }
              ${
                video.active
                  ? `<span class="video-chip"><ha-icon icon="${
                      video.provider === "youtube"
                        ? "mdi:youtube"
                        : "mdi:play-circle"
                    }"></ha-icon> ${this._esc(
                      this._videoProviderLabel(video.provider)
                    )}</span>`
                  : ""
              }
              ${
                !video.active && this._showLyrics
                  ? `<div class="lyrics-overlay">
                      <div class="lyrics-prev" data-lyrics-prev>${this._esc(
                        lyric.prev
                      )}</div>
                      <div class="lyrics-current-row">
                        <span class="lyrics-countdown" data-lyrics-countdown>${this._formatCountdown(
                          lyric.remaining
                        )}</span>
                        <div class="lyrics-current" data-lyrics-current>${this._esc(
                          lyric.current
                        )}</div>
                      </div>
                      <div class="lyrics-next" data-lyrics-next>${this._esc(
                        lyric.next
                      )}</div>
                    </div>`
                  : ""
              }
            </div>
          </div>
          <div class="full-side">
            <div class="beat-strip">
              <span class="beat-dot" data-beat-dot></span>
              <b data-bpm-label>${this._trackBpm(entity)} BPM</b>
              <span>ритм-синхронизация</span>
            </div>
            <div class="full-viz">${this._renderViz(playing)}</div>
            <div class="viz-switch full-viz-switch">
              ${this._vizOptions()
                .map(
                  ([id, label, icon]) =>
                    `<button class="${
                      this._viz === id ? "active" : ""
                    }" data-viz="${id}" title="${label}"><ha-icon icon="${icon}"></ha-icon></button>`
                )
                .join("")}
            </div>
            <div class="full-modes">
              <button class="mode-btn ${
                attrs.shuffle ? "active" : ""
              }" data-shuffle="${this._esc(
      entityId
    )}"><ha-icon icon="mdi:shuffle"></ha-icon> Перемешать</button>
              <select data-repeat="${this._esc(entityId)}">
                <option value="off" ${
                  attrs.repeat === "off" ? "selected" : ""
                }>Без повтора</option>
                <option value="all" ${
                  attrs.repeat === "all" ? "selected" : ""
                }>Повторять всё</option>
                <option value="one" ${
                  attrs.repeat === "one" ? "selected" : ""
                }>Повторять трек</option>
              </select>
              ${this._renderQualitySwitch(speaker, musicQuality, entityId)}
            </div>
            ${this._renderSpeakerExtras(speaker, entity)}
            <div class="full-skin-row">
              <span>Вид плеера</span>
              <div class="full-skin-grid">${[
                [1, "Классика"],
                [2, "Полночь"],
                [3, "Винил"],
                [4, "Стекло"],
                [5, "Неон"],
                [6, "Минимал"],
                [7, "Аврора"],
                [8, "Студия"],
              ]
                .map(
                  ([skin, name]) =>
                    `<button class="skin-swatch skin-${skin} ${
                      this._playerSkin === skin ? "active" : ""
                    }" data-player-skin="${skin}" title="${name}">
                      <span></span><small>${name}</small>
                    </button>`
                )
                .join("")}</div>
            </div>
          </div>
        </div>
        <div class="radio-card full-radio" data-radio-card ${liveText ? "" : "hidden"}>
          <ha-icon icon="mdi:radio"></ha-icon>
          <div class="radio-copy">
            <span data-radio-live>${this._esc(liveText || "Прямой эфир")}</span>
            <b data-radio-name>${this._esc(liveName)}</b>
          </div>
          <div class="radio-bars"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="full-seek">
          <input type="range" min="0" max="${duration}" step="1" value="${position}"
            data-seek-entity="${this._esc(
              entityId
            )}" data-player-seek data-duration="${duration}" ${
      duration ? "" : "disabled"
    } />
          <div class="times">
            <span data-current-for="${this._esc(
              entityId
            )}" data-player-current>${this._formatTime(position)}</span>
            <span data-player-duration>${this._formatTime(duration)}</span>
          </div>
        </div>
        <div class="full-controls">
          <div class="transport">
            <button class="icon-btn" data-player-action="previous" data-player-entity="${this._esc(
              entityId
            )}" title="Предыдущий трек"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
            <button class="icon-btn play" data-player-action="playpause" data-player-entity="${this._esc(
              entityId
            )}" data-player-play title="${playing ? "Пауза" : "Играть"}">
              <ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon>
            </button>
            <button class="icon-btn" data-player-action="next" data-player-entity="${this._esc(
              entityId
            )}" title="Следующий трек"><ha-icon icon="mdi:skip-next"></ha-icon></button>
            <button class="icon-btn stop" data-player-action="stop" data-player-entity="${this._esc(
              entityId
            )}" data-player-stop title="${
      canStop ? "Остановить" : "Нет активного действия"
    }" ${canStop ? "" : "disabled"}><ha-icon icon="mdi:stop"></ha-icon></button>
          </div>
          <div class="volume-control">
            <button class="volume-toggle" data-player-mute="${this._esc(
              entityId
            )}" title="${muted ? "Включить звук" : "Выключить звук"}">
              <ha-icon icon="${muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
            </button>
            <input type="range" min="0" max="100" step="1" value="${volume}"
              data-volume-entity="${this._esc(
                entityId
              )}" data-player-volume />
            <span data-volume-for="${this._esc(
              entityId
            )}" data-player-volume-label>${volume}%</span>
          </div>
        </div>
        <div class="lyrics-sync">
          <span>Синхронизация текста</span>
          <button class="sync-btn" data-lyrics-offset="-0.5">−0.5</button>
          <b data-lyrics-offset-label>${this._lyricsOffset.toFixed(
            1
          )} с</b>
          <button class="sync-btn" data-lyrics-offset="0.5">+0.5</button>
        </div>
        ${this._renderVideoBlock(speaker, entity, video)}
        ${this._renderMusicHub(speaker.id, true)}
      </div>
    </article>`;
  }

  _renderVideoBlock(speaker, entity, video) {
    const active = Boolean(video && video.active);
    const provider = active
      ? this._videoProviderLabel(video.provider)
      : "Видео и сервисы";
    return `<div class="video-hub ${active ? "active" : ""}" data-video-hub="${this._esc(
      speaker.id
    )}">
      <div class="video-hub-head">
        <div class="video-hub-title">
          <span class="video-badge"><ha-icon icon="mdi:youtube-tv"></ha-icon> Видео и сервисы</span>
          <p>${
            active
              ? `${this._esc(provider)} · ${this._esc(video.title)}`
              : "Вставьте ссылку YouTube, Rutube, Кинопоиска, IVI, Okko, Wink, Start, Premier, VK Видео, Яндекс Эфира или прямой mp4/m3u8 — колонка включит видео."
          }</p>
        </div>
        ${
          active && this._canPreviewVideo(video)
            ? `<button class="video-open" data-ha-video="${this._esc(
                speaker.id
              )}"><ha-icon icon="mdi:play-box-outline"></ha-icon> В HA</button>`
            : ""
        }
        ${
          active && video.url
            ? `<a class="video-open" href="${this._esc(
                video.url
              )}" target="_blank" rel="noopener"><ha-icon icon="mdi:open-in-new"></ha-icon> Открыть</a>`
            : ""
        }
        ${
          active
            ? `<button class="video-close" data-video-close="${this._esc(
                speaker.id
              )}" ${video.playing ? "hidden" : ""}><ha-icon icon="mdi:close-circle-outline"></ha-icon> Закрыть видео</button>`
            : ""
        }
      </div>
      <div class="video-form">
        <input type="url" data-video-url="${this._esc(
          speaker.id
        )}" placeholder="https://youtu.be/…, https://rutube.ru/video/… или прямая ссылка" />
        <button class="video-play" data-video-play="${this._esc(
          speaker.id
        )}" data-entity="${this._esc(
      entity.entity_id
    )}"><ha-icon icon="mdi:play"></ha-icon> Включить</button>
      </div>
      <div class="video-services">
        <span>YouTube</span><span>Rutube</span><span>Кинопоиск</span><span>IVI</span><span>Okko</span><span>Wink</span><span>Start</span><span>Premier</span><span>VK Видео</span><span>Яндекс Эфир</span><span>mp4 / m3u8</span>
      </div>
      ${
        active && this._canPreviewVideo(video)
          ? `<div class="video-note">«В HA» — предпросмотр в браузере. Телевизор продолжает играть свой поток; это не зеркало экрана.</div>`
          : ""
      }
      <div class="video-status" data-video-status="${this._esc(speaker.id)}"></div>
    </div>`;
  }

  _renderTabs(data) {
    const tabs = [
      ["devices", "Устройства", "mdi:home-automation", data.counts.devices],
      ["speakers", "Колонки", "mdi:speaker", data.counts.speakers],
      ["stream", "Трансляция", "mdi:cast", null],
      ["hub", "Яндекс хаб", "mdi:home-assistant", null],
    ];
    return `<nav class="tabs">${tabs
      .map(
        ([id, label, icon, count]) => `
        <button class="tab ${this._tab === id ? "active" : ""}" data-tab="${id}">
          <ha-icon icon="${icon}"></ha-icon>
          <span>${label}</span>
          ${count !== null ? `<b>${count}</b>` : ""}
        </button>`
      )
      .join("")}</nav>`;
  }

  _renderTabContent(data, devices) {
    if (this._tab === "speakers") {
      return `${this._renderSpeakerTabs()}${
        this._speakerTab === "speaker"
          ? this._renderSpeakerControls(data.speakers || [])
          : this._speakerTab === "features"
          ? this._renderSpeakerFeatures(data.speakers || [])
          : this._renderSpeakerPlayers(data.speakers || [])
      }`;
    }
    if (this._tab === "hub") {
      return this._renderHub(data);
    }
    if (this._tab === "stream") {
      return this._renderStreamTab(data);
    }
    return `${this._renderMediaOverview()}${this._renderDashboard(devices)}`;
  }

  _renderMediaOverview() {
    const speakers = this._musicSpeakers();
    if (!speakers.length) return "";
    const targetId = this._musicTargetId(speakers[0].id);
    return `<section class="overview-media">
      <div class="overview-media-head">
        <div>
          <h3>Медиа</h3>
          <p>Яндекс Музыка и плееры колонок — поиск, очередь, лайки и плейлисты.</p>
        </div>
      </div>
      ${this._renderMusicHub(targetId)}
      <div class="players">${speakers
        .map((speaker) => this._renderSpeakerPlayer(speaker))
        .join("")}</div>
    </section>`;
  }

  _renderHub(data) {
    const filters = [
      ["hubs", "Хабы", "mdi:home-assistant"],
      ["zigbee", "Zigbee", "mdi:zigbee"],
      ["meters", "Счётчики", "mdi:meter-electric"],
      ["ir", "ИК-пульты", "mdi:remote"],
      ["auto", "Авто", "mdi:car-connected"],
    ];
    const devices = this._hubDevices(data.devices || [], this._hubFilter);
    const updated = data.updated
      ? new Date(data.updated).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    const counts = data.counts || {};
    return `
      ${this._renderHealth(data)}
      <div class="section hub-intro">
        <div class="hub-title">
          <div class="device-icon" style="--accent:#5b6cff"><ha-icon icon="mdi:home-assistant"></ha-icon></div>
          <div>
            <h3>Яндекс хаб</h3>
            <p class="muted">Хабы, Zigbee-датчики, счётчики, ИК-пульты и автомобильные сигнализации. У хаба свои данные и свои устройства — он не является колонкой.</p>
          </div>
        </div>
        <div class="hub-health">
          <span>Обновлено ${this._esc(updated)}</span>
          <span>${counts.online ?? 0}/${counts.devices ?? 0} устройств онлайн</span>
          <span>${counts.speakers ?? 0} колонка</span>
          <span>${counts.hubs ?? 0} хаба</span>
        </div>
        <div class="chips hub-chips">
          ${filters
            .map(
              ([id, label, icon]) =>
                `<button class="chip ${this._hubFilter === id ? "active" : ""}" data-hub-filter="${id}">
                  <ha-icon icon="${icon}"></ha-icon> ${label}
                </button>`
            )
            .join("")}
        </div>
      </div>
      ${
        this._hubFilter === "hubs"
          ? this._renderHubGrid(devices)
          : `<div class="grid">
              ${devices.map((device) => this._renderCard(device)).join("")}
            </div>`
      }
      ${
        devices.length === 0
          ? `<div class="empty">В этой категории пока нет устройств. Добавьте их в приложении «Дом с Алисой» — они появятся здесь автоматически.</div>`
          : ""
      }
      <div class="section hub-note">
        <ha-icon icon="mdi:information-outline"></ha-icon>
        <p class="muted">Сопряжение новых Zigbee-устройств и обучение ИК-пультов выполняется в приложении «Дом с Алисой». Здесь доступны их состояние и все команды, которые Яндекс разрешает через API.</p>
      </div>
    `;
  }

  _renderHealth(data) {
    const health = data.health;
    if (!health) return "";
    const cloud = health.cloud || {};
    const speakers = health.speakers || [];
    const localOk = speakers.some((speaker) => speaker.local_connected);
    const localNames = speakers
      .map(
        (speaker) =>
          `${speaker.name}: ${
            speaker.local_connected ? "локально" : "облако"
          }`
      )
      .join(" · ");
    let cloudText = "активно";
    let cloudClass = "ok";
    let cloudHint = "Токен и cookies в порядке";
    if (cloud.rate_limited_for > 0) {
      cloudText = `лимит ${Math.max(
        1,
        Math.ceil(cloud.rate_limited_for / 60)
      )} мин`;
      cloudClass = "warn";
      cloudHint = "Яндекс ограничил частоту запросов";
    } else if (cloud.auth_error_for > 0) {
      cloudText = "токен отклонён";
      cloudClass = "bad";
      cloudHint = "Нужна повторная авторизация";
    } else if (!cloud.configured) {
      cloudText = "не настроено";
      cloudClass = "warn";
      cloudHint = "Нет Quasar-токена";
    }
    const age = health.last_success_age;
    const updated =
      age === null || age === undefined
        ? "—"
        : age < 60
        ? `${Math.round(age)} с назад`
        : `${Math.round(age / 60)} мин назад`;
    const stateAge = speakers
      .map(
        (speaker) =>
          `${speaker.name}: ${
            speaker.last_state_age === null ||
            speaker.last_state_age === undefined
              ? "нет данных"
              : `${Math.max(0, Math.round(speaker.last_state_age))} с`
          }`
      )
      .join(" · ");
    return `<div class="health-card">
      <div class="health-head">
        <div class="health-title">
          <ha-icon icon="mdi:heart-pulse"></ha-icon>
          <b>Состояние</b>
          <span class="health-build">v${this._esc(PANEL_BUILD)}</span>
        </div>
        <button class="ghost-btn" data-action="refresh">Проверить снова</button>
      </div>
      <div class="health-grid">
        <div class="health-tile ${localOk ? "ok" : "warn"}">
          <span>Локальная связь</span>
          <b>${localOk ? "подключена" : "нет"}</b>
          <small>${this._esc(localNames || "колонки не найдены")}</small>
        </div>
        <div class="health-tile ${cloudClass}">
          <span>Облако</span>
          <b>${this._esc(cloudText)}</b>
          <small>${this._esc(cloudHint)}</small>
        </div>
        <div class="health-tile">
          <span>Данные</span>
          <b>${this._esc(updated)}</b>
          <small>${this._esc(stateAge || "состояние ещё не получено")}</small>
        </div>
      </div>
    </div>`;
  }

  _renderHubGrid(devices) {
    if (!devices.length) return "";
    return `<div class="hub-grid">${devices
      .map((device) => {
        const children = (this._data?.devices || []).filter(
          (item) => item.station_id && item.station_id === device.id
        );
        const room = device.room_name || "Без комнаты";
        const vendor =
          device.manufacturer || device.model
            ? `${device.manufacturer || ""}${
                device.model ? ` · ${device.model}` : ""
              }`
            : "Яндекс";
        const firmware = [
          device.sw_version ? `ПО ${device.sw_version}` : "",
          device.hw_version ? `HW ${device.hw_version}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const stats = [];
        if (device.capabilities.length) {
          stats.push(`<span><b>${device.capabilities.length}</b> команд</span>`);
        }
        if (device.properties.length) {
          stats.push(`<span><b>${device.properties.length}</b> датчиков</span>`);
        }
        if (children.length) {
          stats.push(`<span><b>${children.length}</b> устройств</span>`);
        }
        const statsHtml = stats.length
          ? stats.join("")
          : `<span>Свои данные: состояние, комната, производитель</span>`;
        return `<article class="hub-card" data-device="${this._esc(device.id)}">
          <div class="hub-card-head">
            <div class="device-icon" style="--accent:#5b6cff">
              <ha-icon icon="${this._esc(device.icon || "mdi:home-assistant")}"></ha-icon>
            </div>
            <span class="status ${device.online ? "online" : "offline"}"></span>
          </div>
          <h3>${this._esc(device.name)}</h3>
          <p class="muted">${this._esc(device.type_label)} · ${this._esc(room)}</p>
          <div class="hub-vendor">${this._esc(vendor)}</div>
          ${
            firmware
              ? `<div class="hub-firmware">${this._esc(firmware)}</div>`
              : ""
          }
          <div class="hub-stats">${statsHtml}</div>
          <button class="ghost-btn" data-device="${this._esc(
            device.id
          )}">Открыть данные</button>
        </article>`;
      })
      .join("")}</div>`;
  }

  _isMeter(device) {
    return (device.properties || []).some((prop) =>
      ["energy", "power", "voltage", "current", "frequency", "water_level"].includes(
        prop.instance
      )
    );
  }

  _isCarAlarm(device) {
    return Boolean(device.is_car_alarm);
  }

  _isHub(device) {
    return Boolean(device.is_hub);
  }

  _isIrRemote(device) {
    return Boolean(device.is_ir_remote);
  }

  _hubDevices(devices, kind) {
    if (kind === "hubs") {
      return devices.filter((device) => this._isHub(device));
    }
    if (kind === "auto") {
      return devices.filter((device) => this._isCarAlarm(device));
    }
    if (kind === "meters") {
      return devices.filter(
        (device) =>
          this._isMeter(device) &&
          !this._isCarAlarm(device) &&
          !this._isHub(device)
      );
    }
    if (kind === "ir") {
      return devices.filter((device) => this._isIrRemote(device));
    }
    return devices.filter(
      (device) =>
        /sensor|button/i.test(device.type || "") &&
        !this._isMeter(device) &&
        !this._isCarAlarm(device) &&
        !this._isHub(device) &&
        !this._isIrRemote(device)
    );
  }

  _streamPlayers() {
    return Object.values(this._hass?.states || {})
      .filter((state) => state.entity_id.startsWith("media_player."))
      .sort((left, right) =>
        this._streamEntityName(left.entity_id).localeCompare(
          this._streamEntityName(right.entity_id),
          "ru"
        )
      );
  }

  _streamSourceEntity() {
    const players = this._streamPlayers();
    if (this._streamSource) {
      const selected = players.find(
        (state) => state.entity_id === this._streamSource
      );
      if (selected) return selected.entity_id;
    }
    const speaker = (this._data?.speakers || []).find(
      (item) => item.entity_id && this._hass.states[item.entity_id]
    );
    if (speaker) return speaker.entity_id;
    return (
      players.find((state) => state.state !== "unavailable")?.entity_id ||
      players[0]?.entity_id ||
      null
    );
  }

  _streamTargetEntities() {
    const source = this._streamSourceEntity();
    return this._streamPlayers().filter(
      (state) => state.entity_id !== source
    );
  }

  _streamEntityName(entityId) {
    const state = this._hass?.states?.[entityId];
    const name =
      state?.attributes?.friendly_name ||
      entityId.split(".").slice(1).join(".") ||
      entityId;
    const platform = this._hass?.entities?.[entityId]?.platform || "";
    if (platform === "cast") return `${name} · Cast`;
    if (["androidtv_remote", "androidtv", "firetv"].includes(platform)) {
      return `${name} · TV`;
    }
    return name;
  }

  _streamStateLabel(value) {
    const labels = {
      playing: "играет",
      paused: "пауза",
      idle: "ожидает",
      off: "выкл",
      unavailable: "недоступно",
      unknown: "неизвестно",
      buffering: "буферизация",
    };
    return labels[value] || value;
  }

  _streamFeatures(state) {
    return Number(state?.attributes?.supported_features || 0);
  }

  _streamHas(state, feature) {
    return (this._streamFeatures(state) & feature) === feature;
  }

  _renderStreamTab(data) {
    const source = this._streamSourceEntity();
    const sourceState = source ? this._hass.states[source] : null;
    const targets = this._streamTargetEntities();
    if (!this._streamSessionsLoaded && !this._streamSessionsLoading) {
      window.setTimeout(() => this._loadStreamSessions(), 0);
    }
    const sourceOptions = targets.length || source
      ? this._streamPlayers()
          .map(
            (player) =>
              `<option value="${this._esc(player.entity_id)}" ${
                player.entity_id === source ? "selected" : ""
              }>${this._esc(this._streamEntityName(player.entity_id))} · ${this._esc(
                this._streamStateLabel(player.state)
              )}</option>`
          )
          .join("")
      : `<option value="">Нет медиаплееров</option>`;
    const volume =
      sourceState && typeof sourceState.attributes.volume_level === "number"
        ? Math.round(Number(sourceState.attributes.volume_level) * 100)
        : null;
    const mediaTitle = sourceState?.attributes?.media_title || "";
    const mediaArtist = sourceState?.attributes?.media_artist || "";
    const noMedia =
      sourceState?.state === "playing" &&
      !sourceState?.attributes?.media_content_id;
    const sessionCount = this._streamSessions.length;
    return `<div class="stream-tab">
      <div class="stream-hero">
        <div class="stream-hero-icon"><ha-icon icon="mdi:cast-audio"></ha-icon></div>
        <div class="stream-hero-copy">
          <h2>Трансляция музыки</h2>
          <p>Выберите колонку-источник и устройства, на которые нужно передать текущий трек. Громкость можно синхронизировать или задать шаблоном.</p>
        </div>
        <span class="stream-status ${sessionCount ? "active" : ""}" data-stream-status>${sessionCount ? `${sessionCount} активно` : "Готово"}</span>
      </div>
      <div class="stream-grid">
        <div class="section stream-card">
          <div class="stream-card-head">
            <h3><ha-icon icon="mdi:speaker-wireless"></ha-icon> Источник</h3>
            <span class="stream-kicker">Яндекс Станция</span>
          </div>
          <label class="stream-field">
            <span>Колонка</span>
            <select data-stream-source>${sourceOptions}</select>
          </label>
          <div class="stream-source-meta">
            ${
              sourceState
                ? `<span class="stream-state">${this._esc(
                    this._streamStateLabel(sourceState.state)
                  )}</span>${
                    volume !== null
                      ? `<span class="stream-volume">${volume}%</span>`
                      : ""
                  }${
                    noMedia
                      ? `<span class="stream-now">Источник не отдаёт текущий трек</span>`
                      : mediaTitle
                      ? `<span class="stream-now">${this._esc(
                          mediaTitle
                        )}${mediaArtist ? ` · ${this._esc(mediaArtist)}` : ""}</span>`
                      : `<span class="stream-now">нет активного трека</span>`
                  }`
                : `<span class="stream-now">Выберите источник</span>`
            }
          </div>

          <div class="stream-param-line">
            <span>Синхронизация громкости</span>
            <div class="stream-segmented">
              <button type="button" data-stream-sync="off" class="${
                this._streamSyncMode === "off" ? "active" : ""
              }">Выкл</button>
              <button type="button" data-stream-sync="on" class="${
                this._streamSyncMode === "on" ? "active" : ""
              }">Вкл</button>
              <button type="button" data-stream-sync="template" class="${
                this._streamSyncMode === "template" ? "active" : ""
              }">Шаблон</button>
            </div>
          </div>
          <div class="stream-template-wrap ${
            this._streamSyncMode === "template" ? "" : "hidden"
          }" data-stream-template-wrap>
            <input type="text" data-stream-template value="${this._esc(
              this._streamTemplate
            )}" placeholder="{{ volume_level / 2 }}" />
            <div class="stream-presets">
              <button type="button" data-stream-template-preset="{{ volume_level }}">100%</button>
              <button type="button" data-stream-template-preset="{{ volume_level * 0.75 }}">75%</button>
              <button type="button" data-stream-template-preset="{{ volume_level / 2 }}">50%</button>
              <button type="button" data-stream-template-preset="{{ volume_level / 3 }}">33%</button>
            </div>
            <small>Доступно: volume_level, target_volume, entity_id, media_title.</small>
          </div>

          <div class="stream-param-line stream-clickable" data-stream-proxy>
            <span>Прокси Home Assistant</span>
            <b data-stream-proxy-label>${this._streamUseProxy ? "включён" : "выключен"}</b>
          </div>
          <label class="stream-param-line">
            <span>Качество</span>
            <select class="stream-quality" data-stream-quality>
              <option value="high|mp3" ${
                this._streamQuality === "high" && this._streamCodecs === "mp3"
                  ? "selected"
                  : ""
              }>MP3 320</option>
              <option value="medium|mp3" ${
                this._streamQuality === "medium" && this._streamCodecs === "mp3"
                  ? "selected"
                  : ""
              }>MP3 192</option>
              <option value="low|mp3" ${
                this._streamQuality === "low" && this._streamCodecs === "mp3"
                  ? "selected"
                  : ""
              }>MP3 128</option>
              <option value="high|aac" ${
                this._streamCodecs === "aac" ? "selected" : ""
              }>AAC 256</option>
              <option value="high|flac" ${
                this._streamCodecs === "flac" ? "selected" : ""
              }>FLAC</option>
            </select>
          </label>
          <div class="stream-param-line stream-clickable" data-stream-mute>
            <span>Заглушить Станцию</span>
            <b data-stream-mute-label>${this._streamMuteSource ? "включено" : "выключено"}</b>
          </div>
          <div class="stream-param-line stream-clickable" data-stream-bidirectional>
            <span>Двустороннее управление</span>
            <b data-stream-bidirectional-label>${this._streamBidirectional ? "включено" : "выключено"}</b>
          </div>
          <div class="stream-param-line">
            <span>Выбрано устройств</span>
            <b data-stream-count>${this._streamTargets.length}</b>
          </div>
        </div>

        <div class="section stream-card">
          <div class="stream-card-head">
            <h3><ha-icon icon="mdi:speaker-multiple"></ha-icon> Устройства</h3>
            <span class="stream-kicker" data-stream-count-label>${this._streamTargets.length} выбрано</span>
          </div>
          <div class="stream-search">
            <ha-icon icon="mdi:magnify"></ha-icon>
            <input type="search" data-stream-search value="${this._esc(
              this._streamQuery
            )}" placeholder="Поиск устройств по имени или entity_id" />
          </div>
          <div class="stream-selected" data-stream-selected>${this._renderStreamSelected()}</div>
          <div class="stream-target-list" data-stream-list>${this._renderStreamTargets()}</div>
        </div>
      </div>

      ${this._renderStreamHint()}
      <div class="stream-actions">
        <button class="action-btn" data-stream-start>Запустить трансляцию</button>
        <button class="ghost-btn" data-stream-stop-all>Остановить все</button>
        <button class="ghost-btn" data-stream-refresh>Обновить сессии</button>
      </div>

      <div class="section stream-card">
        <div class="stream-card-head">
          <h3><ha-icon icon="mdi:playlist-play"></ha-icon> Активные сессии</h3>
          <span class="stream-kicker">${sessionCount} шт.</span>
        </div>
        <div data-stream-sessions>${this._renderStreamSessions()}</div>
      </div>
    </div>`;
  }

  _renderStreamHint() {
    const hasCast = this._streamTargetEntities().some(
      (state) => this._hass.entities?.[state.entity_id]?.platform === "cast"
    );
    if (hasCast) return "";
    return `<div class="stream-hint">
      <ha-icon icon="mdi:cellphone-link"></ha-icon>
      <div>
        <b>Карточка управления на телефоне</b>
        <span>Она появляется автоматически только у Cast-устройств. Добавьте
        Google Cast в Home Assistant и выберите Cast-колонку. Android TV
        Remote открывает браузер, а не системную медиа-карточку.</span>
      </div>
    </div>`;
  }

  _renderStreamTargets() {
    const source = this._streamSourceEntity();
    const query = this._streamQuery.trim().toLowerCase();
    const players = this._streamTargetEntities().filter((state) => {
      if (!query) return true;
      return `${this._streamEntityName(state.entity_id)} ${state.entity_id}`
        .toLowerCase()
        .includes(query);
    });
    if (!source) {
      return `<div class="stream-empty">Сначала выберите источник.</div>`;
    }
    if (!players.length) {
      return `<div class="stream-empty">Устройства не найдены. Измените запрос.</div>`;
    }
    return players
      .map((state) => {
        const id = state.entity_id;
        const selected = this._streamTargets.includes(id);
        const supportsUrl = this._streamHas(state, 512);
        const supportsVolume = this._streamHas(state, 4);
        const unavailable = ["unavailable", "unknown"].includes(state.state);
        const disabled = unavailable || !supportsUrl;
        const name = this._streamEntityName(id);
        const platform = this._hass.entities?.[id]?.platform || "";
        const tvTarget = ["androidtv_remote", "androidtv", "firetv"].includes(
          platform
        );
        const castTarget = platform === "cast";
        const lower = `${id} ${name}`.toLowerCase();
        const icon = /tv|телевиз|пристав/.test(lower)
          ? "mdi:television"
          : /sonos|speaker|колон|акуст/.test(lower)
          ? "mdi:speaker"
          : "mdi:cast";
        const volume =
          typeof state.attributes.volume_level === "number"
            ? `${Math.round(Number(state.attributes.volume_level) * 100)}%`
            : "";
        return `<button type="button" class="stream-target ${
          selected ? "selected" : ""
        } ${disabled ? "disabled" : ""}" data-stream-target="${this._esc(
          id
        )}" data-stream-disabled="${disabled ? "1" : "0"}" aria-pressed="${selected}" title="${
          tvTarget
            ? "Android TV откроет ссылку в приложении; фоновое аудио не гарантируется"
            : ""
        }">
          <span class="stream-device-icon"><ha-icon icon="${icon}"></ha-icon></span>
          <span class="stream-device-copy">
            <b>${this._esc(name)}</b>
            <small>${this._esc(id)} · ${this._esc(
              this._streamStateLabel(state.state)
            )}${volume ? ` · ${volume}` : ""}</small>
          </span>
          <span class="stream-device-badges">
            ${
              supportsUrl
                ? `<i>${tvTarget ? "TV" : castTarget ? "CAST" : "URL"}</i>`
                : `<i class="off">NO URL</i>`
            }
            ${supportsVolume ? `<i>VOL</i>` : ""}
          </span>
          <span class="stream-check"><ha-icon icon="${
            selected ? "mdi:check-circle" : "mdi:circle-outline"
          }"></ha-icon></span>
        </button>`;
      })
      .join("");
  }

  _renderStreamSelected() {
    if (!this._streamTargets.length) {
      return `<span class="stream-muted">Получатели не выбраны</span>`;
    }
    return this._streamTargets
      .map(
        (id) => `<button type="button" class="stream-chip" data-stream-unselect="${this._esc(
          id
        )}">${this._esc(this._streamEntityName(id))}<ha-icon icon="mdi:close"></ha-icon></button>`
      )
      .join("");
  }

  _renderStreamSessions() {
    if (this._streamSessionsError) {
      return `<div class="stream-empty error">${this._esc(
        this._streamSessionsError
      )}</div>`;
    }
    if (this._streamSessionsLoading && !this._streamSessions.length) {
      return `<div class="stream-empty">Загружаю сессии…</div>`;
    }
    if (!this._streamSessions.length) {
      return `<div class="stream-empty">Активных сессий нет. Выберите устройства и запустите трансляцию.</div>`;
    }
    return this._streamSessions
      .map((session) => {
        const sourceName = this._streamEntityName(
          session.source_entity_id
        );
        const targets = (session.target_entity_ids || []).map((id) =>
          this._streamEntityName(id)
        );
        const sync =
          session.sync_volume === false
            ? "выкл"
            : session.sync_volume === true
            ? "вкл"
            : `шаблон: ${session.sync_volume}`;
        return `<div class="stream-session">
          <div class="stream-session-head">
            <div><b>${this._esc(sourceName)}</b><small>${this._esc(
              session.session_id
            )}</small></div>
            <button class="ghost-btn danger" data-stream-stop="${this._esc(
              session.session_id
            )}">Стоп</button>
          </div>
          <div class="stream-session-targets">${targets
            .map((name) => `<span>${this._esc(name)}</span>`)
            .join("")}</div>
          <div class="stream-session-meta">Громкость: ${this._esc(
            sync
          )} · Прокси: ${session.use_proxy ? "вкл" : "выкл"} · ${
            session.codecs || "mp3"
          }</div>
        </div>`;
      })
      .join("");
  }

  async _loadStreamSessions() {
    if (!this._hass || this._streamSessionsLoading) return;
    this._streamSessionsLoading = true;
    try {
      const result = await this._hass.callWS({
        type: "yahome_hub/streams",
      });
      this._streamSessions = result.streams || [];
      this._streamSessionsLoaded = true;
      this._streamSessionsError = null;
    } catch (err) {
      this._streamSessionsLoaded = true;
      this._streamSessionsError = this._message(err);
    } finally {
      this._streamSessionsLoading = false;
      this._renderStreamSessions();
      this._updateStreamStatus();
    }
  }

  _updateStreamStatus() {
    const root = this.shadowRoot;
    if (!root) return;
    const status = root.querySelector("[data-stream-status]");
    if (status) {
      const count = this._streamSessions.length;
      status.textContent = count ? `${count} активно` : "Готово";
      status.classList.toggle("active", count > 0);
    }
    const count = root.querySelector("[data-stream-count]");
    if (count) count.textContent = String(this._streamTargets.length);
    const label = root.querySelector("[data-stream-count-label]");
    if (label) label.textContent = `${this._streamTargets.length} выбрано`;
    const start = root.querySelector("[data-stream-start]");
    if (start) {
      const sourceState = this._hass.states[this._streamSourceEntity()];
      const noMedia =
        sourceState?.state === "playing" &&
        !sourceState?.attributes?.media_content_id;
      start.disabled =
        !this._streamSourceEntity() ||
        !this._streamTargets.length ||
        Boolean(noMedia);
    }
  }

  _applyStreamParamsDom() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-stream-sync]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.getAttribute("data-stream-sync") === this._streamSyncMode
      );
    });
    const wrap = root.querySelector("[data-stream-template-wrap]");
    if (wrap) wrap.classList.toggle("hidden", this._streamSyncMode !== "template");
    const proxy = root.querySelector("[data-stream-proxy-label]");
    if (proxy) proxy.textContent = this._streamUseProxy ? "включён" : "выключен";
    const mute = root.querySelector("[data-stream-mute-label]");
    if (mute) mute.textContent = this._streamMuteSource ? "включено" : "выключено";
    const bidirectional = root.querySelector(
      "[data-stream-bidirectional-label]"
    );
    if (bidirectional) {
      bidirectional.textContent = this._streamBidirectional
        ? "включено"
        : "выключено";
    }
    const quality = root.querySelector("[data-stream-quality]");
    if (quality) {
      const value = `${this._streamQuality}|${this._streamCodecs}`;
      if (quality.value !== value) quality.value = value;
    }
    const input = root.querySelector("[data-stream-template]");
    if (input && input.value !== this._streamTemplate) {
      input.value = this._streamTemplate;
    }
  }

  async _startStream() {
    if (!this._hass) return;
    const source = this._streamSourceEntity();
    if (!source) {
      this._showToast("Выберите источник");
      return;
    }
    if (!this._streamTargets.length) {
      this._showToast("Выберите хотя бы одно устройство");
      return;
    }
    const sync =
      this._streamSyncMode === "off"
        ? false
        : this._streamSyncMode === "on"
        ? true
        : this._streamTemplate.trim() || "{{ volume_level }}";
    const button = this.shadowRoot?.querySelector("[data-stream-start]");
    if (button) {
      button.disabled = true;
      button.textContent = "Запускаю…";
    }
    try {
      await this._hass.callService("yahome_hub", "stream_music", {
        source_entity_id: source,
        target_entity_ids: [...this._streamTargets],
        sync_volume: sync,
        use_proxy: this._streamUseProxy,
        quality: this._streamQuality,
        codecs: this._streamCodecs,
        mute_source: this._streamMuteSource,
        bidirectional: this._streamBidirectional,
      });
      this._showToast("Трансляция запущена");
      await this._loadStreamSessions(true);
    } catch (err) {
      this._showToast("Ошибка трансляции: " + this._message(err));
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Запустить трансляцию";
      }
      this._updateStreamStatus();
    }
  }

  async _stopStream(sessionId) {
    if (!this._hass) return;
    try {
      await this._hass.callService("yahome_hub", "stop_stream_music", {
        session_id: sessionId,
      });
      this._showToast("Трансляция остановлена");
      await this._loadStreamSessions(true);
    } catch (err) {
      this._showToast("Ошибка: " + this._message(err));
    }
  }

  async _stopAllStreams() {
    if (!this._hass) return;
    try {
      await this._hass.callService("yahome_hub", "stop_stream_music", {});
      this._showToast("Все трансляции остановлены");
      await this._loadStreamSessions(true);
    } catch (err) {
      this._showToast("Ошибка: " + this._message(err));
    }
  }

  _attachStreamEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    const source = root.querySelector("[data-stream-source]");
    if (source) {
      source.addEventListener("change", () => {
        this._streamSource = source.value;
        this._streamTargets = this._streamTargets.filter(
          (id) => id !== source.value
        );
        const list = root.querySelector("[data-stream-list]");
        if (list) list.innerHTML = this._renderStreamTargets();
        const selected = root.querySelector("[data-stream-selected]");
        if (selected) selected.innerHTML = this._renderStreamSelected();
        this._updateStreamStatus();
      });
    }
    const search = root.querySelector("[data-stream-search]");
    if (search) {
      search.addEventListener("input", () => {
        this._streamQuery = search.value;
        const list = root.querySelector("[data-stream-list]");
        if (list) list.innerHTML = this._renderStreamTargets();
      });
    }
    const list = root.querySelector("[data-stream-list]");
    if (list) {
      list.addEventListener("click", (event) => {
        const card = event.target.closest("[data-stream-target]");
        if (!card) return;
        if (card.getAttribute("data-stream-disabled") === "1") {
          this._showToast("Устройство недоступно или не принимает URL");
          return;
        }
        const id = card.getAttribute("data-stream-target");
        if (this._streamTargets.includes(id)) {
          this._streamTargets = this._streamTargets.filter(
            (item) => item !== id
          );
        } else {
          this._streamTargets.push(id);
        }
        list.innerHTML = this._renderStreamTargets();
        const selected = root.querySelector("[data-stream-selected]");
        if (selected) selected.innerHTML = this._renderStreamSelected();
        this._updateStreamStatus();
      });
    }
    const selected = root.querySelector("[data-stream-selected]");
    if (selected) {
      selected.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-stream-unselect]");
        if (!chip) return;
        const id = chip.getAttribute("data-stream-unselect");
        this._streamTargets = this._streamTargets.filter(
          (item) => item !== id
        );
        const list = root.querySelector("[data-stream-list]");
        if (list) list.innerHTML = this._renderStreamTargets();
        selected.innerHTML = this._renderStreamSelected();
        this._updateStreamStatus();
      });
    }
    const sessions = root.querySelector("[data-stream-sessions]");
    if (sessions) {
      sessions.addEventListener("click", (event) => {
        const stop = event.target.closest("[data-stream-stop]");
        if (stop) this._stopStream(stop.getAttribute("data-stream-stop"));
      });
    }
    root.querySelectorAll("[data-stream-sync]").forEach((button) => {
      button.addEventListener("click", () => {
        this._streamSyncMode = button.getAttribute("data-stream-sync");
        this._applyStreamParamsDom();
      });
    });
    root.querySelectorAll("[data-stream-template-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        this._streamTemplate = button.getAttribute(
          "data-stream-template-preset"
        );
        this._streamSyncMode = "template";
        this._applyStreamParamsDom();
      });
    });
    const template = root.querySelector("[data-stream-template]");
    if (template) {
      template.addEventListener("input", () => {
        this._streamTemplate = template.value;
      });
    }
    const proxy = root.querySelector("[data-stream-proxy]");
    if (proxy) {
      proxy.addEventListener("click", () => {
        this._streamUseProxy = !this._streamUseProxy;
        this._applyStreamParamsDom();
      });
    }
    const mute = root.querySelector("[data-stream-mute]");
    if (mute) {
      mute.addEventListener("click", () => {
        this._streamMuteSource = !this._streamMuteSource;
        this._applyStreamParamsDom();
      });
    }
    const bidirectional = root.querySelector("[data-stream-bidirectional]");
    if (bidirectional) {
      bidirectional.addEventListener("click", () => {
        this._streamBidirectional = !this._streamBidirectional;
        this._applyStreamParamsDom();
      });
    }
    const quality = root.querySelector("[data-stream-quality]");
    if (quality) {
      quality.addEventListener("change", () => {
        const [q, c] = quality.value.split("|");
        this._streamQuality = q;
        this._streamCodecs = c;
        this._applyStreamParamsDom();
      });
    }
    const start = root.querySelector("[data-stream-start]");
    if (start) start.addEventListener("click", () => this._startStream());
    const stopAll = root.querySelector("[data-stream-stop-all]");
    if (stopAll) {
      stopAll.addEventListener("click", () => this._stopAllStreams());
    }
    const refresh = root.querySelector("[data-stream-refresh]");
    if (refresh) {
      refresh.addEventListener("click", () => this._loadStreamSessions(true));
    }
    this._updateStreamStatus();
  }

  _renderHeader(counts) {
    return `
      <header class="top">
        <div class="brand">
          <div class="logo">
            <img src="/yahome_hub/icon.png" alt="YaHome Hub" />
          </div>
          <div>
            <h1>YaHome Hub</h1>
            <p>Все устройства и датчики Яндекса в одном месте <span class="build-badge">v${PANEL_BUILD}</span></p>
          </div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" data-action="refresh" title="Обновить">
            <ha-icon icon="mdi:refresh"></ha-icon>
          </button>
          <button class="icon-btn" data-action="export" title="Экспорт базы">
            <ha-icon icon="mdi:database-export"></ha-icon>
          </button>
        </div>
      </header>
      ${
        counts
          ? `<div class="stats">
              <div class="stat"><span>${counts.devices}</span><small>устройств</small></div>
              <div class="stat"><span>${counts.online}</span><small>онлайн</small></div>
              <div class="stat"><span>${counts.scenarios}</span><small>сценариев</small></div>
              <div class="stat"><span>${counts.speakers}</span><small>колонок</small></div>
              <div class="stat"><span>${counts.hubs ?? 0}</span><small>хабов</small></div>
            </div>`
          : ""
      }
    `;
  }

  _renderLoading() {
    return `<div class="loading"><div class="spinner"></div><p>Загружаю устройства…</p></div>`;
  }

  _renderDashboard(devices) {
    const data = this._data;
    const rooms = (data.rooms || []).filter((room) => room.count > 0);
    const allDevices = data.devices || [];
    const counts = this._filterCounts(allDevices);
    const filters = [
      ["all", "Все", "mdi:view-grid-outline", counts.all],
      ["online", "В сети", "mdi:wifi", counts.online],
      ["light", "Свет", "mdi:lightbulb-group-outline", counts.light],
      ["climate", "Климат", "mdi:thermostat", counts.climate],
      ["media", "Медиа", "mdi:play-circle-outline", counts.media],
      ["sensors", "Датчики", "mdi:gauge", counts.sensors],
    ];
    const favorites = allDevices.filter((device) =>
      this._favorites.includes(device.id)
    );
    return `
      <div class="toolbar">
        <div class="search">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input id="search" type="search" placeholder="Поиск устройства…" value="${this._esc(
            this._query
          )}" />
          <span class="search-count">${devices.length}</span>
        </div>
        <div class="quick-filters">
          ${filters
            .map(
              ([id, label, icon, count]) =>
                `<button class="filter-pill ${
                  this._viewFilter === id ? "active" : ""
                }" data-view-filter="${id}">
                  <ha-icon icon="${icon}"></ha-icon>
                  <span>${label}</span>
                  <b>${count}</b>
                </button>`
            )
            .join("")}
        </div>
        <div class="chips">
          <button class="chip ${this._room === "all" ? "active" : ""}" data-room="all">Все комнаты</button>
          ${rooms
            .map(
              (room) =>
                `<button class="chip ${
                  this._room === room.name ? "active" : ""
                }" data-room="${this._esc(room.name)}">${this._esc(
                  room.name
                )} <b>${room.count}</b></button>`
            )
            .join("")}
          <button class="chip ${
            this._room === "none" ? "active" : ""
          }" data-room="none">Без комнаты</button>
        </div>
      </div>
      ${this._renderScenesStrip(data.scenarios)}
      ${
        this._room === "all" && !this._query.trim() && favorites.length
          ? this._renderFavorites(favorites)
          : ""
      }
      <div class="grid">
        ${devices.map((device) => this._renderCard(device)).join("")}
      </div>
      ${
        devices.length === 0
          ? `<div class="empty">Ничего не найдено. Измени фильтр или запрос.</div>`
          : ""
      }
    `;
  }

  _renderScenesStrip(scenarios) {
    if (!scenarios || !scenarios.length) return "";
    return `<section class="scenes-strip">
      <div class="section-title">
        <div><h3>Сценарии</h3><p class="muted">Быстрый запуск одним касанием</p></div>
      </div>
      <div class="scenes-row">${scenarios
        .map(
          (scenario) =>
            `<button class="scene-pill" data-scenario="${this._esc(
              scenario.id
            )}">
              <span class="scene-icon"><ha-icon icon="mdi:play"></ha-icon></span>
              <span>${this._esc(scenario.name)}</span>
            </button>`
        )
        .join("")}</div>
    </section>`;
  }

  _renderFavorites(devices) {
    return `<section class="favorites-strip">
      <div class="section-title">
        <div><h3>Избранное</h3><p class="muted">Закреплённые устройства и быстрый доступ</p></div>
      </div>
      <div class="favorites-row">${devices
        .map((device) => {
          const color = this._deviceColor(device);
          const on = this._isOn(device);
          return `<button class="favorite-tile ${
            on ? "on" : ""
          }" data-device="${this._esc(device.id)}" style="--accent:${color}">
            <span class="favorite-icon"><ha-icon icon="${this._esc(
              device.icon || "mdi:home-automation"
            )}"></ha-icon></span>
            <span class="favorite-meta">
              <b>${this._esc(device.name)}</b>
              <small data-state-device="${this._esc(
                device.id
              )}">${this._esc(this._stateText(device))}</small>
            </span>
            <span class="status ${device.online ? "online" : "offline"}"></span>
          </button>`;
        })
        .join("")}</div>
    </section>`;
  }

  _renderCard(device) {
    const color = this._deviceColor(device);
    const on = this._isOn(device);
    const favorite = this._favorites.includes(device.id);
    const hasPower = device.capabilities.some(
      (cap) => cap.type === "devices.capabilities.on_off"
    );
    return `
      <div class="card-shell ${favorite ? "is-favorite" : ""}" data-card-shell="${this._esc(
      device.id
    )}">
        <div class="card-rail card-rail-left">
          <button class="rail-btn ${favorite ? "active" : ""}" data-fav="${this._esc(
      device.id
    )}" title="${favorite ? "Убрать из избранного" : "В избранное"}">
            <ha-icon icon="${favorite ? "mdi:star" : "mdi:star-outline"}"></ha-icon>
            <span>${favorite ? "В избранном" : "Избранное"}</span>
          </button>
        </div>
        <div class="card-rail card-rail-right">
          <button class="rail-btn" data-quick="${this._esc(
            device.id
          )}" title="Быстрое управление">
            <ha-icon icon="mdi:tune-variant"></ha-icon>
            <span>Быстро</span>
          </button>
          ${
            hasPower
              ? `<button class="rail-btn rail-power ${
                  on ? "active" : ""
                }" data-toggle="${this._esc(device.id)}" title="Вкл/выкл">
                  <ha-icon icon="mdi:power"></ha-icon><span>Питание</span>
                </button>`
              : ""
          }
        </div>
        <article class="card ${on ? "is-on" : ""} ${
      favorite ? "favorite" : ""
    }" data-device="${this._esc(device.id)}" data-card="${this._esc(
      device.id
    )}">
          <div class="card-glow"></div>
          <div class="card-head">
            <div class="device-icon" style="--accent:${color}">
              <ha-icon icon="${this._esc(device.icon || "mdi:home-automation")}"></ha-icon>
            </div>
            <div class="card-head-right">
              ${
                favorite
                  ? `<ha-icon class="fav-mark" icon="mdi:star"></ha-icon>`
                  : ""
              }
              <span class="status ${device.online ? "online" : "offline"}"></span>
            </div>
          </div>
          <h3>${this._esc(device.name)}</h3>
          <p class="muted">${this._esc(device.type_label)} · ${this._esc(
      device.room_name || "Без комнаты"
    )}${
      device.is_car_alarm
        ? ` · ${this._esc(device.manufacturer || "Starline")}`
        : ""
    }</p>
          ${this._renderCardReadings(device)}
          <div class="card-foot">
            <span class="state" data-state-device="${this._esc(
              device.id
            )}">${this._esc(this._stateText(device))}</span>
            <div class="card-actions-row">
              <button class="mini-action" data-quick="${this._esc(
                device.id
              )}" title="Быстрое управление"><ha-icon icon="mdi:tune-variant"></ha-icon></button>
              ${
                hasPower
                  ? `<button class="power ${on ? "on" : ""}" data-toggle="${
                      device.id
                    }" title="Вкл/выкл"><ha-icon icon="mdi:power"></ha-icon></button>`
                  : ""
              }
            </div>
          </div>
        </article>
      </div>
    `;
  }

  _renderMiniControl(device) {
    const caps = device.capabilities || [];
    const brightness = caps.find(
      (cap) =>
        cap.kind === "range" &&
        ["brightness", "brightness_percent"].includes(cap.instance)
    );
    if (brightness) {
      const value = Number(brightness.value);
      const min = Number(brightness.min ?? 0);
      const max = Number(brightness.max ?? 100);
      const safeValue = Number.isFinite(value)
        ? Math.max(min, Math.min(max, value))
        : min;
      return `<div class="mini-slider">
        <ha-icon icon="mdi:brightness-6"></ha-icon>
        <input type="range" min="${min}" max="${max}" step="${
        brightness.step || 1
      }" value="${safeValue}" data-mini-brightness="${this._esc(
        device.id
      )}" data-mini-type="${this._esc(brightness.type)}" data-mini-instance="${this._esc(
        brightness.instance
      )}" data-mini-unit="${this._esc(brightness.unit || "")}" />
        <span>${Math.round(safeValue)}${this._esc(
        brightness.unit || "%"
      )}</span>
      </div>`;
    }
    const target = caps.find(
      (cap) =>
        cap.kind === "range" &&
        ["temperature", "target_temperature"].includes(cap.instance)
    );
    if (target) {
      return `<div class="mini-chip"><ha-icon icon="mdi:thermometer"></ha-icon>${
        target.value ?? "—"
      }${this._esc(target.unit || "°C")}</div>`;
    }
    const sensor = (device.properties || []).find(
      (prop) => prop.instance && prop.value !== undefined
    );
    if (sensor) {
      return `<div class="mini-chip"><ha-icon icon="mdi:gauge"></ha-icon>${
        sensor.value
      }${this._esc(sensor.unit || "")}</div>`;
    }
    return "";
  }

  _renderQuickSheet(data) {
    if (!this._quickDevice) return "";
    const device = (data.devices || []).find(
      (item) => item.id === this._quickDevice
    );
    if (!device) return "";
    const color = this._deviceColor(device);
    const on = this._isOn(device);
    const favorite = this._favorites.includes(device.id);
    const hasPower = device.capabilities.some(
      (cap) => cap.type === "devices.capabilities.on_off"
    );
    return `<div class="sheet-backdrop" data-close-sheet>
      <section class="quick-sheet" role="dialog" aria-modal="true">
        <div class="sheet-grabber"></div>
        <header class="sheet-head">
          <div class="device-icon big" style="--accent:${color}">
            <ha-icon icon="${this._esc(device.icon || "mdi:home-automation")}"></ha-icon>
          </div>
          <div class="sheet-title">
            <h2>${this._esc(device.name)}</h2>
            <p class="muted">${this._esc(device.type_label)} · ${this._esc(
      device.room_name || "Без комнаты"
    )} · ${device.online ? "в сети" : "не в сети"}</p>
          </div>
          <button class="sheet-close" data-close-sheet title="Закрыть"><ha-icon icon="mdi:close"></ha-icon></button>
        </header>
        <div class="sheet-quick-actions">
          ${
            hasPower
              ? `<button class="sheet-power ${on ? "on" : ""}" data-toggle="${this._esc(
                  device.id
                )}"><ha-icon icon="mdi:power"></ha-icon><span>${
                  on ? "Выключить" : "Включить"
                }</span></button>`
              : `<div class="sheet-power ghost"><ha-icon icon="mdi:information-outline"></ha-icon><span>Только датчик</span></div>`
          }
          <button class="sheet-action ${favorite ? "active" : ""}" data-fav="${this._esc(
      device.id
    )}"><ha-icon icon="${
      favorite ? "mdi:star" : "mdi:star-outline"
    }"></ha-icon><span>${favorite ? "В избранном" : "В избранное"}</span></button>
          <button class="sheet-action" data-sheet-open="${this._esc(
            device.id
          )}"><ha-icon icon="mdi:arrow-expand"></ha-icon><span>Открыть</span></button>
        </div>
        ${
          device.capabilities.length
            ? `<div class="sheet-section"><h3>Управление</h3><div class="controls">${device.capabilities
                .map((cap) => this._renderControl(device, cap))
                .join("")}</div></div>`
            : ""
        }
        ${
          (device.properties || []).length
            ? `<div class="sheet-section">${this._renderProperties(device)}</div>`
            : ""
        }
      </section>
    </div>`;
  }

  _renderDetail(device) {
    const color = this._deviceColor(device);
    return `
      <div class="detail">
        <button class="back" data-action="back">
          <ha-icon icon="mdi:arrow-left"></ha-icon> Назад
        </button>
        <div class="detail-head">
          <div class="device-icon big" style="--accent:${color}">
            <ha-icon icon="${this._esc(device.icon || "mdi:home-automation")}"></ha-icon>
          </div>
          <div>
            <h2>${this._esc(device.name)}</h2>
            <p class="muted">${this._esc(device.type_label)} · ${this._esc(
              device.room_name || "Без комнаты"
            )}</p>
            <span class="status-text ${device.online ? "online" : "offline"}">
              ${device.online ? "В сети" : "Не в сети"}
            </span>
          </div>
        </div>
        ${this._renderCardFieldPicker(device)}
        ${
          device.is_hub || device.is_car_alarm
            ? this._renderDeviceInfo(device)
            : ""
        }
        ${this._renderControls(device)}
        ${this._renderProperties(device)}
      </div>
    `;
  }

  _renderDeviceInfo(device) {
    const rows = [
      ["Тип", device.type_label],
      ["Комната", device.room_name || "Без комнаты"],
      ["Производитель", device.manufacturer || "Яндекс"],
      ["Модель", device.model],
      ["ПО", device.sw_version],
      ["Железо", device.hw_version],
      ["ID", device.id],
    ].filter(([, value]) => value);
    return `<div class="section">
      <h3>Сведения</h3>
      <div class="device-info-grid">
        ${rows
          .map(
            ([label, value]) => `<div class="device-info-row">
              <span>${this._esc(label)}</span>
              <b>${this._esc(value)}</b>
            </div>`
          )
          .join("")}
      </div>
    </div>`;
  }

  _renderControls(device) {
    const caps = device.capabilities || [];
    if (!caps.length) {
      return `<div class="section"><h3>Управление</h3><p class="muted">У устройства нет управляемых возможностей.</p></div>`;
    }
    return `<div class="section"><h3>Управление</h3><div class="controls">${caps
      .map((cap) => this._renderControl(device, cap))
      .join("")}</div></div>`;
  }

  _renderControl(device, cap) {
    const label = this._esc(cap.name || cap.instance || cap.type);
    if (cap.kind === "on_off") {
      const on = cap.value === true || cap.value === "true" || cap.value === 1;
      return `
        <div class="control-row">
          <div><strong>${label}</strong><small>${on ? "Включено" : "Выключено"}</small></div>
          <button class="switch ${on ? "on" : ""}" data-cap-toggle="${this._esc(
            device.id
          )}" data-cap-type="${this._esc(cap.type)}" data-cap-instance="${this._esc(
            cap.instance || ""
          )}" data-cap-value="${on ? "false" : "true"}">
            <span></span>
          </button>
        </div>`;
    }
    if (cap.kind === "toggle") {
      const on = cap.value === true || cap.value === "true" || cap.value === 1;
      return `
        <div class="control-row">
          <div><strong>${label}</strong><small>${on ? "Включено" : "Выключено"}</small></div>
          <button class="switch ${on ? "on" : ""}" data-cap-toggle="${this._esc(
            device.id
          )}" data-cap-type="${this._esc(cap.type)}" data-cap-instance="${this._esc(
            cap.instance || ""
          )}" data-cap-value="${on ? "false" : "true"}">
            <span></span>
          </button>
        </div>`;
    }
    if (cap.kind === "range" || cap.kind === "open") {
      const min = cap.min !== undefined ? cap.min : 0;
      const max = cap.max !== undefined ? cap.max : 100;
      const step = cap.step !== undefined ? cap.step : 1;
      const value = cap.value !== null && cap.value !== undefined ? cap.value : min;
      return `
        <div class="control-block">
          <div class="control-label">
            <strong>${label}</strong>
            <span data-value-for="${this._esc(device.id)}-${this._esc(
              cap.instance || ""
            )}">${value}${cap.unit ? " " + this._esc(cap.unit) : ""}</span>
          </div>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
            data-range-device="${this._esc(device.id)}"
            data-range-type="${this._esc(cap.type)}"
            data-range-instance="${this._esc(cap.instance || "")}"
            data-range-unit="${this._esc(cap.unit || "")}"
            data-value-target="${this._esc(device.id)}-${this._esc(
              cap.instance || ""
            )}" />
        </div>`;
    }
    if (cap.kind === "mode" || cap.kind === "work_speed") {
      const current =
        cap.value !== null && cap.value !== undefined ? String(cap.value) : "";
      return `
        <div class="control-block">
          <div class="control-label"><strong>${label}</strong></div>
          <select data-select-device="${this._esc(device.id)}"
            data-select-type="${this._esc(cap.type)}"
            data-select-kind="${this._esc(cap.kind)}"
            data-select-action-instance="${this._esc(
              cap.action_instance || cap.instance || ""
            )}"
            data-select-instance="${this._esc(cap.instance || "")}">
            ${(cap.options || [])
              .map(
                (option) =>
                  `<option value="${this._esc(option.value)}" ${
                    option.value === current ? "selected" : ""
                  }>${this._esc(
                    option.name && option.name !== option.value
                      ? option.name
                      : this._modeLabel(option.value)
                  )}</option>`
              )
              .join("")}
          </select>
        </div>`;
    }
    if (cap.kind === "color") {
      const scenes = cap.color_scenes || [];
      const temperature = cap.temperature_k || null;
      const model =
        cap.color_model === "hsv"
          ? "hsv"
          : cap.color_model === "rgb"
          ? "rgb"
          : "";
      return `
        <div class="control-block color-control">
          <div class="control-label"><strong>${label}</strong>${
            model
              ? `<span class="color-model">${model.toUpperCase()}</span>`
              : ""
          }</div>
          ${
            model
              ? `<div class="color-presets">${this._colorPresets()
                  .map(
                    (color) =>
                      `<button class="color-dot" style="--c:${color.hex}" data-color-preset="${color.hex}" data-color-device="${this._esc(
                        device.id
                      )}" data-color-instance="${model}" title="${this._esc(
                        color.name
                      )}"></button>`
                  )
                  .join("")}</div>
                <label class="color-native">Свой цвет
                  <input type="color" value="#6c7cff"
                    data-color-picker="${this._esc(device.id)}"
                    data-color-instance="${model}" />
                </label>`
              : ""
          }
          ${
            scenes.length
              ? `<div class="control-label sub"><span>Режимы и сцены</span></div>
                 <div class="scene-presets">${scenes
                   .map(
                     (scene) =>
                       `<button class="scene-preset" data-color-scene="${this._esc(
                         device.id
                       )}" data-scene-id="${this._esc(scene.id)}">${this._esc(
                         scene.name
                       )}</button>`
                   )
                   .join("")}</div>`
              : ""
          }
          ${
            temperature
              ? `<div class="control-label sub"><span>Цветовая температура</span><span>${temperature.min}–${temperature.max} K</span></div>
                 <input type="range" min="${temperature.min}" max="${temperature.max}" step="100" value="${temperature.min}"
                   data-color-device="${this._esc(device.id)}"
                   data-color-instance="temperature_k" />`
              : ""
          }
        </div>`;
    }
    if (cap.kind === "media") {
      return `
        <div class="control-row">
          <div><strong>${label}</strong><small>${this._esc(
            String(cap.value ?? "—")
          )}</small></div>
          <div class="media-buttons">
            <button class="icon-btn" data-media-device="${this._esc(
              device.id
            )}" data-media-action="play" title="Play"><ha-icon icon="mdi:play"></ha-icon></button>
            <button class="icon-btn" data-media-device="${this._esc(
              device.id
            )}" data-media-action="pause" title="Pause"><ha-icon icon="mdi:pause"></ha-icon></button>
            <button class="icon-btn" data-media-device="${this._esc(
              device.id
            )}" data-media-action="stop" title="Stop"><ha-icon icon="mdi:stop"></ha-icon></button>
          </div>
        </div>`;
    }
    if (cap.kind === "volume") {
      const value = cap.value !== null && cap.value !== undefined ? cap.value : 0;
      return `
        <div class="control-block">
          <div class="control-label"><strong>${label}</strong><span>${value}%</span></div>
          <input type="range" min="0" max="100" step="1" value="${value}"
            data-volume-device="${this._esc(device.id)}" />
        </div>`;
    }
    return `<div class="control-row"><div><strong>${label}</strong><small>${this._esc(
      String(cap.value ?? "—")
    )}</small></div></div>`;
  }

  _renderProperties(device) {
    const props = device.properties || [];
    if (!props.length) return "";
    return `<div class="section"><h3>Датчики</h3><div class="props">${props
      .map(
        (prop) => `
        <div class="prop">
          <span><ha-icon icon="${this._propIcon(prop.instance)}"></ha-icon>${this._esc(
          prop.name
        )}</span>
          <b data-prop-device="${this._esc(
            device.id
          )}" data-prop-instance="${this._esc(
            prop.instance
          )}">${this._esc(String(prop.value ?? "—"))}${
            prop.unit ? " " + this._esc(prop.unit) : ""
          }</b>
        </div>`
      )
      .join("")}</div></div>`;
  }

  _renderScenarios(scenarios) {
    if (!scenarios || !scenarios.length) return "";
    return `<div class="section"><h3>Сценарии</h3><div class="scenarios">${scenarios
      .map(
        (scenario) => `
        <button class="scenario" data-scenario="${this._esc(scenario.id)}">
          <ha-icon icon="mdi:play-circle"></ha-icon>
          <span>${this._esc(scenario.name)}</span>
        </button>`
      )
      .join("")}</div></div>`;
  }

  _skinName(skin) {
    return (
      {
        1: "Классика",
        2: "Полночь",
        3: "Винил",
        4: "Стекло",
        5: "Неон",
        6: "Минимал",
        7: "Аврора",
        8: "Студия",
      }[skin] || "Классика"
    );
  }

  _musicSpeakers() {
    return (this._data?.speakers || []).filter(
      (speaker) => speaker.entity_id && this._hass.states[speaker.entity_id]
    );
  }

  _musicTargetId(targetId) {
    const speakers = this._musicSpeakers();
    if (!speakers.length) return null;
    if (targetId && speakers.some((speaker) => speaker.id === targetId)) {
      return targetId;
    }
    if (
      this._musicTarget &&
      speakers.some((speaker) => speaker.id === this._musicTarget)
    ) {
      return this._musicTarget;
    }
    return speakers[0].id;
  }

  _cacheTracks(tracks) {
    for (const track of tracks || []) {
      if (track && track.id) this._musicTracks[track.id] = track;
    }
  }

  _renderMusicHub(targetId, compact = false) {
    const target = this._musicTargetId(targetId);
    if (!target) return "";
    const speakers = this._musicSpeakers();
    const speaker = speakers.find((item) => item.id === target);
    const entityId = speaker?.entity_id || "";
    const queue = this._musicQueues[target] || { tracks: [], index: -1 };
    const tabs = [
      ["search", "Поиск"],
      ["queue", "Очередь"],
      ["likes", "Лайки"],
      ["playlists", "Плейлисты"],
    ];
    return `<section class="music-hub ${compact ? "compact" : ""}" data-music-hub="${this._esc(
      target
    )}" data-compact="${compact ? "1" : "0"}">
      <div class="music-hub-head">
        <div>
          <h3>Яндекс Музыка</h3>
          <p>Поиск, очередь, лайки и плейлисты</p>
        </div>
        ${
          speakers.length > 1
            ? `<select data-music-target-select>${speakers
                .map(
                  (item) =>
                    `<option value="${this._esc(item.id)}" ${
                      item.id === target ? "selected" : ""
                    }>${this._esc(item.name)}</option>`
                )
                .join("")}</select>`
            : ""
        }
      </div>
      <div class="music-search-bar">
        <input data-music-query value="${this._esc(
          this._musicQuery
        )}" placeholder="Трек, исполнитель или ссылка">
        <button class="action-btn" data-music-action="search">Найти</button>
      </div>
      <div class="music-tabs">
        ${tabs
          .map(
            ([id, label]) =>
              `<button class="${this._musicTab === id ? "active" : ""}" data-music-action="tab" data-music-tab="${id}">${label}${
                id === "queue" && queue.tracks.length
                  ? ` <b>${queue.tracks.length}</b>`
                  : ""
              }</button>`
          )
          .join("")}
      </div>
      ${
        this._musicNotice
          ? `<div class="music-hint notice">${this._esc(
              this._musicNotice
            )}</div>`
          : ""
      }
      <div class="music-content">${this._renderMusicContent(
        target,
        entityId
      )}</div>
    </section>`;
  }

  _renderMusicContent(targetId, entityId) {
    if (this._musicLoading) {
      return `<div class="music-hint">Загружаю...</div>`;
    }
    if (this._musicError) {
      return `<div class="music-hint error-text">${this._esc(
        this._musicError
      )}</div>`;
    }
    if (this._musicTab === "queue") {
      return this._renderQueue(targetId, entityId);
    }
    if (this._musicTab === "likes") {
      if (!this._musicLikes.length) {
        return `<button class="action-btn" data-music-action="load-likes" data-target-id="${this._esc(
          targetId
        )}">Загрузить лайки</button>`;
      }
      return this._renderTrackList(
        this._musicLikes,
        targetId,
        entityId,
        "likes"
      );
    }
    if (this._musicTab === "playlists") {
      if (this._musicPlaylist) {
        return `<div class="playlist-head">
            <button class="ghost-btn" data-music-action="back-playlists">← Плейлисты</button>
            <b>${this._esc(this._musicPlaylist.title || "Плейлист")}</b>
          </div>
          ${this._renderTrackList(
            this._musicPlaylistTracks,
            targetId,
            entityId,
            "playlist"
          )}`;
      }
      if (!this._musicPlaylists.length) {
        return `<button class="action-btn" data-music-action="load-playlists" data-target-id="${this._esc(
          targetId
        )}">Загрузить плейлисты</button>`;
      }
      return `<div class="playlist-grid">${this._musicPlaylists
        .map(
          (playlist) =>
            `<button class="playlist-card" data-music-action="open-playlist" data-kind="${this._esc(
              playlist.kind
            )}" data-target-id="${this._esc(targetId)}">
              <img src="${this._esc(playlist.cover || "")}" alt="">
              <b>${this._esc(playlist.title)}</b>
              <small>${playlist.track_count} треков</small>
            </button>`
        )
        .join("")}</div>`;
    }
    if (!this._musicResults.length) {
      return `<div class="music-hint">Введите название песни, исполнителя или ссылку — результаты появятся здесь.</div>`;
    }
    return this._renderTrackList(
      this._musicResults,
      targetId,
      entityId,
      "search"
    );
  }

  _renderTrackList(tracks, targetId, entityId, kind) {
    if (!tracks.length) {
      return `<div class="music-hint">Здесь пока пусто.</div>`;
    }
    return `<div class="track-list">${tracks
      .map(
        (track, index) =>
          `<div class="track-row" data-music-action="play" data-track-id="${this._esc(
            track.id
          )}" data-track-index="${index}" data-track-kind="${kind}" data-target-id="${this._esc(
            targetId
          )}" data-target-entity="${this._esc(entityId)}">
            <img class="track-cover" src="${this._esc(
              track.cover || ""
            )}" alt="">
            <div class="track-meta">
              <b>${this._esc(track.title)}</b>
              <small>${this._esc(track.artist || "")}${
            track.album ? ` · ${this._esc(track.album)}` : ""
          }</small>
            </div>
            <span class="track-duration">${this._formatTime(
              track.duration
            )}</span>
            <button class="track-btn" data-music-action="play" data-track-id="${this._esc(
              track.id
            )}" data-track-index="${index}" data-track-kind="${kind}" data-target-id="${this._esc(
            targetId
          )}" data-target-entity="${this._esc(
            entityId
          )}" title="Играть"><ha-icon icon="mdi:play"></ha-icon></button>
            <button class="track-btn" data-music-action="add" data-track-id="${this._esc(
              track.id
            )}" data-target-id="${this._esc(
            targetId
          )}" data-target-entity="${this._esc(
            entityId
          )}" title="В очередь"><ha-icon icon="mdi:playlist-plus"></ha-icon></button>
          </div>`
      )
      .join("")}</div>`;
  }

  _renderQueue(targetId, entityId) {
    const queue = this._musicQueues[targetId] || {
      tracks: [],
      index: -1,
    };
    if (!queue.tracks.length) {
      return `<div class="music-hint">Очередь пуста. Добавьте треки из поиска, лайков или плейлистов.</div>`;
    }
    return `<div class="queue-head">
        <button class="action-btn" data-music-action="play-queue" data-target-id="${this._esc(
          targetId
        )}" data-target-entity="${this._esc(entityId)}">Играть очередь</button>
        <button class="ghost-btn" data-music-action="prev" data-target-id="${this._esc(
          targetId
        )}" data-target-entity="${this._esc(entityId)}">←</button>
        <button class="ghost-btn" data-music-action="next" data-target-id="${this._esc(
          targetId
        )}" data-target-entity="${this._esc(entityId)}">→</button>
        <button class="ghost-btn" data-music-action="clear-queue" data-target-id="${this._esc(
          targetId
        )}" data-target-entity="${this._esc(entityId)}">Очистить</button>
      </div>
      <div class="track-list">${queue.tracks
        .map(
          (track, index) =>
            `<div class="track-row ${
              index === queue.index ? "current" : ""
            }" data-music-action="play-queue-index" data-track-index="${index}" data-target-id="${this._esc(
              targetId
            )}" data-target-entity="${this._esc(entityId)}">
              <img class="track-cover" src="${this._esc(
                track.cover || ""
              )}" alt="">
              <div class="track-meta">
                <b>${this._esc(track.title)}</b>
                <small>${this._esc(track.artist || "")}</small>
              </div>
              <button class="track-btn" data-music-action="play-queue-index" data-track-index="${index}" data-target-id="${this._esc(
              targetId
            )}" data-target-entity="${this._esc(
              entityId
            )}" title="Играть"><ha-icon icon="mdi:play"></ha-icon></button>
              <button class="track-btn" data-music-action="remove-queue" data-track-index="${index}" data-target-id="${this._esc(
              targetId
            )}" data-target-entity="${this._esc(
              entityId
            )}" title="Убрать"><ha-icon icon="mdi:close"></ha-icon></button>
            </div>`
        )
        .join("")}</div>`;
  }

  _renderMusicHubDom(targetId) {
    const containers = this.shadowRoot
      ? this.shadowRoot.querySelectorAll(
          `[data-music-hub="${targetId}"]`
        )
      : [];
    containers.forEach((container) => {
      const compact = container.getAttribute("data-compact") === "1";
      container.innerHTML = this._renderMusicHub(targetId, compact);
    });
  }

  _vizOptions() {
    return [
      ["bars", "Спектр", "mdi:equalizer"],
      ["wave", "Волна", "mdi:sine-wave"],
      ["orbit", "Орбита", "mdi:orbit"],
      ["dots", "Точки", "mdi:dots-hexagon"],
      ["pulse", "Пульс", "mdi:pulse"],
      ["spectrum", "Радиус", "mdi:radar"],
      ["mirror", "Тоннель", "mdi:image-filter-center-focus"],
      ["rings", "Кольца", "mdi:circle-double"],
      ["rain", "Дождь", "mdi:weather-rainy"],
      ["blocks", "Блоки", "mdi:view-grid"],
    ];
  }

  _renderSpeakerPlayers(speakers) {
    const withEntity = speakers.filter(
      (speaker) => speaker.entity_id && this._hass.states[speaker.entity_id]
    );
    const viz = this._vizOptions();
    if (!speakers.length) {
      return `<div class="empty">Колонки не найдены. Проверьте cookies и токен в настройках интеграции.</div>`;
    }
    const targetId = this._musicTargetId(withEntity[0]?.id);
    const targetSpeaker =
      withEntity.find((speaker) => speaker.id === targetId) ||
      withEntity[0];
    const targetEntity = targetSpeaker
      ? this._hass.states[targetSpeaker.entity_id]
      : null;
    return `
      <div class="speakers-section">
        ${this._renderMusicHub(targetId)}
        ${
          targetSpeaker && targetEntity
            ? this._renderVideoBlock(
                targetSpeaker,
                targetEntity,
                this._videoInfo(targetSpeaker, targetEntity)
              )
            : ""
        }
        <div class="speaker-toolbar">
          <div>
            <h3>Музыка</h3>
            <p class="muted">Обложка, трек, перемотка, громкость, поиск музыки и режимы — прямо здесь. Настройки самой колонки — на вкладке «Колонка».</p>
          </div>
          <div class="viz-switch" title="Визуализация">
            ${viz
              .map(
                ([id, label, icon]) =>
                  `<button class="${this._viz === id ? "active" : ""}" data-viz="${id}">
                    <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
                  </button>`
              )
              .join("")}
          </div>
        </div>
        <div class="players">
          ${withEntity
            .map((speaker) => this._renderSpeakerPlayer(speaker))
            .join("")}
        </div>
      </div>
    `;
  }

  _renderSpeakerTabs() {
    const tabs = [
      ["music", "Музыка", "mdi:music-note"],
      ["speaker", "Колонка", "mdi:speaker"],
      ["features", "Возможности", "mdi:radar"],
    ];
    return `<div class="subtabs">${tabs
      .map(
        ([id, label, icon]) =>
          `<button class="${this._speakerTab === id ? "active" : ""}" data-speaker-tab="${id}">
            <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
          </button>`
      )
      .join("")}</div>`;
  }

  _renderSpeakerFeatures(speakers) {
    const withEntity = speakers.filter((speaker) => speaker.id);
    if (!withEntity.length) {
      return `<div class="empty">Колонки не найдены.</div>`;
    }
    withEntity.forEach((speaker) => {
      if (!this._diagnostics[speaker.id] && !this._diagLoading[speaker.id]) {
        this._loadSpeakerDiagnostics(speaker.id);
      }
    });
    return `<div class="features-view">
      <div class="section feature-intro">
        <div class="feature-intro-head">
          <div class="device-icon" style="--accent:#5b6cff"><ha-icon icon="mdi:radar"></ha-icon></div>
          <div>
            <h2>Возможности Яндекс Станции</h2>
            <p class="muted">Здесь показан реальный поток состояния и конфигурации колонки. Функции с зелёной отметкой «добавлено» уже доступны в карточке «Колонка»; остальные можно добавить следующими.</p>
          </div>
        </div>
      </div>
      ${withEntity
        .map((speaker) => this._renderFeatureCard(speaker))
        .join("")}
    </div>`;
  }

  async _loadSpeakerDiagnostics(speakerId) {
    if (this._diagLoading[speakerId]) return;
    this._diagLoading[speakerId] = true;
    try {
      const result = await this._hass.callWS({
        type: "yahome_hub/speaker_diagnostics",
        speaker_id: speakerId,
      });
      this._diagnostics[speakerId] = {
        ...result,
        fetched_at: Date.now(),
      };
    } catch (err) {
      this._diagnostics[speakerId] = {
        error: this._message(err),
        fetched_at: Date.now(),
      };
    } finally {
      delete this._diagLoading[speakerId];
      if (
        this._tab === "speakers" &&
        (this._speakerTab === "features" || this._speakerTab === "speaker")
      ) {
        this._render();
      }
    }
  }

  _featureFormat(value) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") {
      return JSON.stringify(value).slice(0, 160);
    }
    return String(value);
  }

  _speakerFeatureItems(diag) {
    const state = diag.state || {};
    const config = diag.config || {};
    const player = state.playerState || {};
    const entityInfo = player.entityInfo || {};
    const extra = player.extra || {};
    const items = [];
    const add = (id, icon, title, value, description) =>
      items.push({ id, icon, title, value, description });
    if (state.aliceState !== undefined) {
      const labels = {
        IDLE: "свободна",
        LISTENING: "слушает",
        THINKING: "думает",
        SPEAKING: "говорит",
      };
      add(
        "alice_state",
        "mdi:account-voice",
        "Статус Алисы",
        labels[state.aliceState] || state.aliceState,
        "Живой индикатор на карточке колонки: слушает, думает или говорит. Обновляется вместе с потоком состояния."
      );
    }
    if (state.canStop !== undefined) {
      add(
        "can_stop",
        "mdi:stop-circle-outline",
        "Остановка текущего действия",
        state.canStop ? "доступна" : "нет активного действия",
        "Кнопка «Стоп» добавлена в карточку колонки и в настройки станции. Если действия нет — показывает «нет активного действия»."
      );
    }
    if (state.timeSinceLastVoiceActivity !== undefined) {
      add(
        "voice_activity",
        "mdi:timer-sand",
        "Время с последней голосовой команды",
        `${state.timeSinceLastVoiceActivity} с`,
        "Можно показывать, как давно вы обращались к Алисе, и строить сценарии по активности."
      );
    }
    if (entityInfo.next || entityInfo.prev) {
      add(
        "track_neighbors",
        "mdi:skip-next-circle-outline",
        "Следующий и предыдущий трек",
        [entityInfo.next?.id, entityInfo.prev?.id].filter(Boolean).join(" / ") || "—",
        "Показывать названия соседних треков и запускать их одним касанием без открытия поиска."
      );
    }
    if (entityInfo.type) {
      add(
        "source_type",
        "mdi:source-branch",
        "Источник подбора",
        entityInfo.type,
        "Что сейчас является источником: Artist, Playlist, Album и т.п. Полезно для карточки «сейчас играет»."
      );
    }
    if (player.playlistId || player.playlistType) {
      add(
        "playlist_context",
        "mdi:playlist-music",
        "Плейлист и контекст воспроизведения",
        `${player.playlistType || "—"} · ${player.playlistId || "—"}`,
        "Показывать текущий плейлист, его тип и описание; можно добавить переход к плейлисту."
      );
    }
    add(
      "live_stream",
      "mdi:radio",
      "Live-поток",
      player.liveStreamText || "нет активного потока",
      "Блок «Прямой эфир» показывает радиостанцию или live-передачу на карточке колонки."
    );
    add(
      "video_mode",
      "mdi:youtube-tv",
      "Видео и видеосервисы",
      extra.item?.type ||
        (player.type && player.type !== "Track"
          ? player.type
          : "готово к видео"),
      "Колонка играет видео с отдельной обложкой 16:9. Поддерживаются YouTube, Rutube, Кинопоиск, IVI, Okko, Wink, Start, Premier, VK Видео, Яндекс Эфир, прямые mp4/m3u8 и другие сервисы через yt-dlp. Мини-плеер и кнопка закрытия видео появляются автоматически."
    );
    if (player.playerType) {
      const engineLabels = {
        music_thin: "Музыка",
        video: "Видео",
        radio: "Радио",
      };
      add(
        "player_engine",
        "mdi:engine-outline",
        "Тип плеера",
        `${engineLabels[player.playerType] || "Плеер"} · ${
          player.playerType
        }`,
        "Тип плеера автоматически переключает управление: music_thin — музыкальные кнопки, video — видео-режим, radio — радио без перемотки и shuffle."
      );
    }
    if (config.audio_player?.music_quality) {
      add(
        "music_quality",
        "mdi:equalizer",
        "Качество музыки",
        config.audio_player.music_quality,
        "Select high / low добавлен в настройки колонки. Влияет на качество и трафик Яндекс Музыки."
      );
    }
    if (config.dndMode) {
      add(
        "dnd",
        "mdi:bell-off-outline",
        "Режим «Не беспокоить»",
        `${config.dndMode.enabled ? "вкл" : "выкл"} · ${
          config.dndMode.starts || "—"
        }–${config.dndMode.ends || "—"}`,
        "Switch и time-селекторы добавлены в настройки колонки: начало, конец и пропуск входящих звонков."
      );
    }
    if (config.led?.time_visualization) {
      add(
        "clock_style",
        "mdi:clock-outline",
        "Формат и размер часов",
        `${config.led.time_visualization.format || "24h"} · ${
          config.led.time_visualization.size || "large"
        }`,
        "Селекторы 12/24 часа и размера часов добавлены в настройки колонки."
      );
    }
    if (config.standby) {
      add(
        "standby",
        "mdi:power-sleep",
        "Глубокий сон",
        `${
          config.standby.deepStandbyEnabled ? "вкл" : "выкл"
        } · ${config.standby.deepStandbyTimeoutMinutes || "—"} мин`,
        "Switch и выбор таймаута добавлены в настройки колонки."
      );
    }
    if (config.locale) {
      add(
        "locale",
        "mdi:translate",
        "Язык интерфейса",
        config.locale,
        "Select языка добавлен в настройки колонки: ru-RU, en-US, ar-SA, kk-KZ, tr-TR."
      );
    }
    if (config.timezone?.timezone_name) {
      add(
        "timezone",
        "mdi:map-clock-outline",
        "Часовой пояс",
        config.timezone.timezone_name,
        "Поле часового пояса добавлено в настройки колонки; используется для времени и будильников."
      );
    }
    if (config.location?.latitude !== undefined) {
      add(
        "location",
        "mdi:map-marker-outline",
        "Геолокация",
        `${config.location.latitude}, ${config.location.longitude}`,
        "Широта и долгота добавлены в настройки колонки; нужны для погоды и локальных сценариев."
      );
    }
    if (config.calls_settings) {
      add(
        "calls",
        "mdi:phone-in-talk-outline",
        "Звонки и Drop-in",
        JSON.stringify(config.calls_settings).slice(0, 120),
        "Select-политики входящих звонков, Drop-in и радионяни добавлены в настройки колонки."
      );
    }
    if (config.radio_nanny_enabled !== undefined) {
      add(
        "radio_nanny",
        "mdi:baby-carriage",
        "Радионяня",
        config.radio_nanny_enabled ? "включена" : "выключена",
        "Switch радионяни добавлен в настройки колонки: колонка слушает комнату и передаёт звук на телефон."
      );
    }
    if (config.allow_non_self_calls !== undefined) {
      add(
        "non_self_calls",
        "mdi:phone-plus-outline",
        "Звонки с других аккаунтов",
        config.allow_non_self_calls ? "разрешены" : "запрещены",
        "Switch добавлен в настройки колонки: разрешать звонки с аккаунтов, которые не являются владельцем."
      );
    }
    if (config.intonationSpotting) {
      add(
        "intonation",
        "mdi:waveform",
        "Распознавание интонаций",
        config.intonationSpotting.enabled ? "включено" : "выключено",
        "Switch добавлен в настройки колонки: Алиса анализирует интонацию голоса."
      );
    }
    if (config.tv_beta !== undefined || config.tv_max !== undefined) {
      add(
        "tv_mode",
        "mdi:television",
        "ТВ-режим",
        `tv_beta: ${config.tv_beta ? "да" : "нет"} · tv_max: ${
          config.tv_max ? "да" : "нет"
        }`,
        "Switches ТВ-режима добавлены в настройки колонки; связаны с HDMI-источником."
      );
    }
    if (config.beta !== undefined) {
      add(
        "beta",
        "mdi:flask-outline",
        "Бета-канал",
        config.beta ? "включён" : "выключен",
        "Switch добавлен в настройки колонки: бета-прошивка и экспериментальные функции Яндекса."
      );
    }
    return items;
  }

  _renderTestPanel(speaker, diag, settings = false) {
    const state = diag.state || {};
    const config = diag.config || {};
    const player = state.playerState || {};
    const entityInfo = player.entityInfo || {};
    const dnd = config.dndMode || {};
    const clock = (config.led || {}).time_visualization || {};
    const standby = config.standby || {};
    const calls = config.calls_settings || {};
    const location = config.location || {};
    const locale = config.locale || "ru-RU";
    const quality = (config.audio_player || {}).music_quality || "high";
    const timezone = (config.timezone || {}).timezone_name || "";
    const aliceState = String(state.aliceState || "").toUpperCase();
    const aliceLabel =
      {
        IDLE: "Свободна",
        LISTENING: "Слушает",
        THINKING: "Думает",
        SPEAKING: "Говорит",
      }[aliceState] ||
      aliceState ||
      "—";
    const liveText = String(player.liveStreamText || "");
    const liveName = String(player.subtitle || "");
    const option = (value, current, label) =>
      `<option value="${this._esc(value)}" ${
        String(value) === String(current) ? "selected" : ""
      }>${this._esc(label || value)}</option>`;
    const boolSwitch = (path, value, label, warning = false) =>
      `<label class="test-switch ${warning ? "warning" : ""}">
        <span>${this._esc(label)}</span>
        <input type="checkbox" data-test-config="${this._esc(
          speaker.id
        )}" data-test-path="${this._esc(path)}" data-test-kind="bool" ${
        value ? "checked" : ""
      } />
        <b>${value ? "вкл" : "выкл"}</b>
      </label>`;
    return `<div class="test-panel ${settings ? "settings-panel" : ""}">
      ${
        settings
          ? ""
          : `<div class="test-warning">
        <ha-icon icon="mdi:flask-outline"></ha-icon>
        <div><b>Тестовый режим</b><p>Эти настройки читаются и записываются напрямую в конфигурацию Станции. Некоторые из них могут изменить поведение колонки. Если что-то пойдёт не так — верните прежнее значение.</p></div>
      </div>`
      }
      <div class="test-grid">
        <section class="test-block">
          <h4><ha-icon icon="mdi:account-voice"></ha-icon> Алиса и плеер</h4>
          <div class="test-status-row"><span>Состояние Алисы</span><b class="alice-state ${aliceState.toLowerCase()}">${this._esc(
            aliceLabel
          )}</b></div>
          <div class="test-status-row"><span>Последняя активность</span><b>${
            state.timeSinceLastVoiceActivity !== undefined
              ? `${state.timeSinceLastVoiceActivity} с`
              : "—"
          }</b></div>
          <div class="test-status-row"><span>Остановка</span><b>${
            state.canStop ? "доступна" : "нет активного действия"
          }</b></div>
          <div class="test-status-row"><span>Тип плеера</span><b>${this._esc(
            player.playerType || "—"
          )}</b></div>
          <div class="test-status-row"><span>Источник</span><b>${this._esc(
            entityInfo.type || "—"
          )}</b></div>
          <div class="test-status-row"><span>Плейлист</span><b>${this._esc(
            player.playlistType || "—"
          )} · ${this._esc(player.playlistId || "—")}</b></div>
          <div class="test-live ${liveText ? "active" : ""}">
            <ha-icon icon="mdi:radio"></ha-icon>
            <div class="test-live-copy">
              <span>Прямой эфир</span>
              <b>${this._esc(liveText || "нет активного потока")}</b>
              ${liveName ? `<small>${this._esc(liveName)}</small>` : ""}
            </div>
            <div class="radio-bars"><i></i><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="test-actions">
            <button class="test-btn" data-test-stop="${this._esc(
              speaker.entity_id || ""
            )}" ${state.canStop ? "" : "disabled"}>Стоп</button>
            <button class="test-btn" data-test-track="previous" data-test-entity="${this._esc(
              speaker.entity_id || ""
            )}">← Предыдущий</button>
            <button class="test-btn" data-test-track="next" data-test-entity="${this._esc(
              speaker.entity_id || ""
            )}">Следующий →</button>
          </div>
          <div class="test-next-prev">Соседние треки: ${this._esc(
            [entityInfo.prev?.id, entityInfo.next?.id]
              .filter(Boolean)
              .join(" / ") || "—"
          )}</div>
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:music-note"></ha-icon> Музыка</h4>
          <label class="test-field"><span>Качество музыки</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="audio_player.music_quality" data-test-kind="string">
              ${option("high", quality, "Высокое")}
              ${option("low", quality, "Низкое")}
            </select>
          </label>
          <div class="test-hint">Влияет на качество и расход трафика Яндекс Музыки.</div>
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:bell-off-outline"></ha-icon> Не беспокоить</h4>
          ${boolSwitch("dndMode.enabled", dnd.enabled, "Режим DND")}
          ${boolSwitch(
            "dndMode.features.allowIncomingCalls",
            (dnd.features || {}).allowIncomingCalls,
            "Пропускать входящие звонки"
          )}
          <label class="test-field"><span>Начало</span>
            <input type="time" value="${this._esc(
              String(dnd.starts || "23:00").slice(0, 5)
            )}" data-test-time="${this._esc(
              speaker.id
            )}" data-test-path="dndMode.starts" data-test-current="${this._esc(
      dnd.starts || ""
    )}" />
          </label>
          <label class="test-field"><span>Конец</span>
            <input type="time" value="${this._esc(
              String(dnd.ends || "09:00").slice(0, 5)
            )}" data-test-time="${this._esc(
              speaker.id
            )}" data-test-path="dndMode.ends" data-test-current="${this._esc(
      dnd.ends || ""
    )}" />
          </label>
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:clock-outline"></ha-icon> Часы на экране</h4>
          <label class="test-field"><span>Формат</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="led.time_visualization.format" data-test-kind="string">
              ${option("24h", clock.format, "24 часа")}
              ${option("12h", clock.format, "12 часов")}
            </select>
          </label>
          <label class="test-field"><span>Размер</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="led.time_visualization.size" data-test-kind="string">
              ${option("large", clock.size, "Большой")}
              ${option("small", clock.size, "Маленький")}
            </select>
          </label>
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:power-sleep"></ha-icon> Глубокий сон</h4>
          ${boolSwitch(
            "standby.deepStandbyEnabled",
            standby.deepStandbyEnabled,
            "Глубокий сон"
          )}
          <label class="test-field"><span>Таймаут, мин</span>
            <input type="number" min="1" max="1440" value="${
              standby.deepStandbyTimeoutMinutes || 240
            }" data-test-config="${this._esc(
      speaker.id
    )}" data-test-path="standby.deepStandbyTimeoutMinutes" data-test-kind="number" />
          </label>
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:translate"></ha-icon> Язык и регион</h4>
          <label class="test-field"><span>Язык</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="locale" data-test-kind="string">
              ${option("ru-RU", locale, "Русский")}
              ${option("en-US", locale, "English")}
              ${option("ar-SA", locale, "العربية")}
              ${option("kk-KZ", locale, "Қазақша")}
              ${option("tr-TR", locale, "Türkçe")}
            </select>
          </label>
          <label class="test-field"><span>Часовой пояс</span>
            <input type="text" value="${this._esc(
              timezone
            )}" data-test-timezone="${this._esc(speaker.id)}" />
            <button class="test-btn" data-test-timezone-save="${this._esc(
              speaker.id
            )}">Сохранить</button>
          </label>
          <div class="test-row-2">
            <label class="test-field"><span>Широта</span>
              <input type="number" step="0.000001" value="${
                location.latitude ?? ""
              }" data-test-lat="${this._esc(speaker.id)}" />
            </label>
            <label class="test-field"><span>Долгота</span>
              <input type="number" step="0.000001" value="${
                location.longitude ?? ""
              }" data-test-lon="${this._esc(speaker.id)}" />
            </label>
          </div>
          <button class="test-btn" data-test-location-save="${this._esc(
            speaker.id
          )}">Сохранить геолокацию</button>
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:phone-in-talk-outline"></ha-icon> Звонки и Drop-in</h4>
          <label class="test-field"><span>Входящие звонки</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="calls_settings.incoming_policy" data-test-kind="string">
              ${option("allow_device_owner_and_guests", calls.incoming_policy, "Владелец и гости")}
              ${option("allow_device_owner", calls.incoming_policy, "Только владелец")}
              ${option("allow_all", calls.incoming_policy, "Все")}
              ${option("deny_all", calls.incoming_policy, "Запретить")}
            </select>
          </label>
          <label class="test-field"><span>Drop-in</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="calls_settings.incoming_dropin_policy" data-test-kind="string">
              ${option("allow_device_owner_and_guests", calls.incoming_dropin_policy, "Владелец и гости")}
              ${option("allow_device_owner", calls.incoming_dropin_policy, "Только владелец")}
              ${option("deny_all", calls.incoming_dropin_policy, "Запретить")}
            </select>
          </label>
          <label class="test-field"><span>Радионяня</span>
            <select data-test-config="${this._esc(
              speaker.id
            )}" data-test-path="calls_settings.incoming_radionanny_policy" data-test-kind="string">
              ${option("allow_device_owner", calls.incoming_radionanny_policy, "Только владелец")}
              ${option("allow_device_owner_and_guests", calls.incoming_radionanny_policy, "Владелец и гости")}
              ${option("deny_all", calls.incoming_radionanny_policy, "Запретить")}
            </select>
          </label>
          ${boolSwitch(
            "radio_nanny_enabled",
            config.radio_nanny_enabled,
            "Радионяня включена"
          )}
          ${boolSwitch(
            "allow_non_self_calls",
            config.allow_non_self_calls,
            "Звонки с других аккаунтов"
          )}
        </section>
        <section class="test-block">
          <h4><ha-icon icon="mdi:flask-outline"></ha-icon> Экспериментальные</h4>
          ${boolSwitch(
            "intonationSpotting.enabled",
            (config.intonationSpotting || {}).enabled,
            "Распознавание интонаций"
          )}
          ${boolSwitch("tv_beta", config.tv_beta, "ТВ-режим (бета)")}
          ${boolSwitch("tv_max", config.tv_max, "ТВ-режим (Макс)")}
          <div class="test-hint">ТВ-режим связан с HDMI-источником и экспериментальным управлением телевизором.</div>
          ${boolSwitch("beta", config.beta, "Бета-канал", true)}
          <div class="test-hint">Бета-канал подключает колонку к экспериментальным функциям Яндекса и может быть нестабильным.</div>
        </section>
      </div>
    </div>`;
  }

  _renderFeatureCard(speaker) {
    const diag = this._diagnostics[speaker.id];
    const loading = this._diagLoading[speaker.id];
    if (!diag) {
      return `<article class="feature-card"><div class="feature-loading">
        <div class="spinner"></div>
        <h3>${this._esc(speaker.name)}</h3>
        <p class="muted">${
          loading ? "Сканирую поток колонки…" : "Подключаюсь к колонке…"
        }</p>
      </div></article>`;
    }
    if (diag.error) {
      return `<article class="feature-card"><div class="feature-error">
        <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
        <div><h3>${this._esc(speaker.name)}</h3><p class="muted">${this._esc(
          diag.error
        )}</p></div>
      </div></article>`;
    }
    const added = [
      ["Музыка и плеер", "play/pause, следующий/предыдущий трек, перемотка, громкость, mute"],
      ["Очередь, лайки, плейлисты", "поиск и запуск треков Яндекс Музыки, локальная очередь"],
      ["Текст песни", "три строки: прошлая, текущая, следующая, с отсчётом"],
      ["TTS и диалог", "озвучивание текста и общение с Алисой"],
      ["LED и авто-яркость", "яркость кольца, автоматический режим"],
      ["Экран", "часы / эквалайзер"],
      ["HDMI", "источник звука «Станция / HDMI»"],
      ["Эквалайзер", "пресеты и ручные полосы"],
      ["Будильники", "календарь будильников Станции"],
      ["Media Browser", "лайки, плейлисты и очередь в HA"],
    ];
    const found = this._speakerFeatureItems(diag);
    const implemented = new Set([
      "alice_state",
      "can_stop",
      "live_stream",
      "video_mode",
      "player_engine",
      "music_quality",
      "dnd",
      "clock_style",
      "standby",
      "locale",
      "timezone",
      "location",
      "calls",
      "radio_nanny",
      "non_self_calls",
      "intonation",
      "tv_mode",
      "beta",
    ]);
    const state = diag.state || {};
    const config = diag.config || {};
    return `<article class="feature-card">
      <header class="feature-card-head">
        <div class="device-icon" style="--accent:#5b6cff"><ha-icon icon="mdi:speaker-wireless"></ha-icon></div>
        <div>
          <h3>${this._esc(speaker.name)}</h3>
          <p class="muted">${this._esc(
            speaker.platform || ""
          )} · обновлено ${new Date(
      diag.fetched_at || Date.now()
    ).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <button class="ghost-btn" data-diag-refresh="${
          speaker.id
        }">Сканировать снова</button>
      </header>
      <div class="feature-summary">
        <div><b>${Object.keys(state).length}</b><span>ключей состояния</span></div>
        <div><b>${Object.keys(config).length}</b><span>ключей конфигурации</span></div>
        <div><b>${found.length}</b><span>найдено функций</span></div>
      </div>
      <h4 class="feature-section-title">Уже добавлено</h4>
      <div class="feature-added">${added
        .map(
          ([title, desc]) =>
            `<div class="feature-added-item"><ha-icon icon="mdi:check-circle"></ha-icon><div><b>${title}</b><small>${desc}</small></div></div>`
        )
        .join("")}</div>
      <h4 class="feature-section-title">Найдено в потоке</h4>
      <div class="feature-list">${found
        .map((item) => {
          const done = implemented.has(item.id);
          return `<div class="feature-item" data-feature-id="${item.id}">
              <div class="feature-item-icon"><ha-icon icon="${item.icon}"></ha-icon></div>
              <div class="feature-item-body">
                <div class="feature-item-title"><b>${item.title}</b><span>${this._esc(
            this._featureFormat(item.value)
          )}</span></div>
                <p>${item.description}</p>
              </div>
              <span class="feature-badge ${done ? "added" : ""}">${
            done ? "добавлено" : "не добавлено"
          }</span>
            </div>`;
        })
        .join("")}</div>
      <h4 class="feature-section-title">Тестовое управление</h4>
      ${this._renderTestPanel(speaker, diag)}
      <details class="feature-raw">
        <summary>Сырые данные потока и конфигурации</summary>
        <div class="feature-raw-grid">
          <div><h5>Состояние</h5><pre>${this._esc(
            JSON.stringify(state, null, 2)
          )}</pre></div>
          <div><h5>Конфигурация</h5><pre>${this._esc(
            JSON.stringify(config, null, 2)
          )}</pre></div>
        </div>
      </details>
    </article>`;
  }

  _renderStationSettings(speaker, diag) {
    const state = diag.state || {};
    const config = diag.config || {};
    const player = state.playerState || {};
    const entityInfo = player.entityInfo || {};
    const dnd = config.dndMode || {};
    const clock = (config.led || {}).time_visualization || {};
    const standby = config.standby || {};
    const calls = config.calls_settings || {};
    const location = config.location || {};
    const locale = config.locale || "ru-RU";
    const quality = (config.audio_player || {}).music_quality || "high";
    const timezone = (config.timezone || {}).timezone_name || "";
    const entity = this._hass.states[speaker.entity_id];
    const modeInfo = this._playerMode(speaker, entity);
    const aliceInfo = this._aliceInfo(entity?.attributes || {});
    const liveText = String(player.liveStreamText || "");
    const liveName = String(player.subtitle || "");
    const esc = (value) => this._esc(value);
    const option = (value, current, label) =>
      `<option value="${esc(value)}" ${
        String(value) === String(current) ? "selected" : ""
      }>${esc(label || value)}</option>`;
    const switchRow = (path, value, label, warning = false) =>
      `<label class="settings-switch ${warning ? "warning" : ""}">
        <span>${esc(label)}</span>
        <input type="checkbox" data-test-config="${esc(
          speaker.id
        )}" data-test-path="${esc(path)}" data-test-kind="bool" ${
        value ? "checked" : ""
      } />
        <b>${value ? "вкл" : "выкл"}</b>
      </label>`;
    const timeRow = (path, value, label) =>
      `<label class="settings-row"><span>${esc(label)}</span>
        <input class="settings-time" type="time" value="${esc(
          String(value || "").slice(0, 5)
        )}" data-test-time="${esc(
        speaker.id
      )}" data-test-path="${esc(path)}" data-test-current="${esc(
        value || ""
      )}" />
      </label>`;
    const label = (value) => esc(value || "—");
    return `<div class="station-settings">
      <div class="settings-grid">
        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:account-voice"></ha-icon><h5>Алиса и плеер</h5></div>
          <div class="settings-status-row"><span>Алиса</span><b class="alice-state ${aliceInfo.state.toLowerCase()}">${esc(
      aliceInfo.label
    )}</b></div>
          <div class="settings-status-row"><span>Тип плеера</span><b>${esc(
            modeInfo.label
          )} <small>${esc(modeInfo.engine)}</small></b></div>
          <div class="settings-status-row"><span>Остановка</span><b>${
            state.canStop ? "доступна" : "нет активного действия"
          }</b></div>
          <div class="settings-status-row"><span>Источник</span><b>${label(
            entityInfo.type
          )}</b></div>
          <div class="settings-actions">
            <button class="settings-btn" data-test-stop="${esc(
              speaker.entity_id || ""
            )}" ${state.canStop ? "" : "disabled"}>Стоп</button>
            <button class="settings-btn" data-test-track="previous" data-test-entity="${esc(
              speaker.entity_id || ""
            )}">← Назад</button>
            <button class="settings-btn" data-test-track="next" data-test-entity="${esc(
              speaker.entity_id || ""
            )}">Вперёд →</button>
          </div>
          <div class="settings-live ${liveText ? "active" : ""}">
            <ha-icon icon="mdi:radio"></ha-icon>
            <div><span>Прямой эфир</span><b>${esc(
              liveText || "нет активного потока"
            )}</b>${liveName ? `<small>${esc(liveName)}</small>` : ""}</div>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:music-note"></ha-icon><h5>Музыка</h5></div>
          ${this._renderQualitySwitch(speaker, quality, speaker.entity_id)}
          <div class="settings-hint">Качество Яндекс Музыки: высокое или экономное.</div>
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:bell-off-outline"></ha-icon><h5>Не беспокоить</h5></div>
          ${switchRow("dndMode.enabled", dnd.enabled, "Режим DND")}
          ${switchRow(
            "dndMode.features.allowIncomingCalls",
            (dnd.features || {}).allowIncomingCalls,
            "Пропускать входящие звонки"
          )}
          ${timeRow("dndMode.starts", dnd.starts, "Начало")}
          ${timeRow("dndMode.ends", dnd.ends, "Конец")}
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:clock-outline"></ha-icon><h5>Экран</h5></div>
          <label class="settings-row"><span>Формат часов</span>
            <select class="settings-select" data-test-config="${esc(
              speaker.id
            )}" data-test-path="led.time_visualization.format" data-test-kind="string">
              ${option("24h", clock.format, "24 часа")}
              ${option("12h", clock.format, "12 часов")}
            </select>
          </label>
          <label class="settings-row"><span>Размер</span>
            <select class="settings-select" data-test-config="${esc(
              speaker.id
            )}" data-test-path="led.time_visualization.size" data-test-kind="string">
              ${option("large", clock.size, "Большой")}
              ${option("small", clock.size, "Маленький")}
            </select>
          </label>
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:power-sleep"></ha-icon><h5>Глубокий сон</h5></div>
          ${switchRow(
            "standby.deepStandbyEnabled",
            standby.deepStandbyEnabled,
            "Глубокий сон"
          )}
          <label class="settings-row"><span>Таймаут, мин</span>
            <input class="settings-input" type="number" min="1" max="1440" value="${
              standby.deepStandbyTimeoutMinutes || 240
            }" data-test-config="${esc(
      speaker.id
    )}" data-test-path="standby.deepStandbyTimeoutMinutes" data-test-kind="number" />
          </label>
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:translate"></ha-icon><h5>Язык и регион</h5></div>
          <label class="settings-row"><span>Язык</span>
            <select class="settings-select" data-test-config="${esc(
              speaker.id
            )}" data-test-path="locale" data-test-kind="string">
              ${option("ru-RU", locale, "Русский")}
              ${option("en-US", locale, "English")}
              ${option("ar-SA", locale, "العربية")}
              ${option("kk-KZ", locale, "Қазақша")}
              ${option("tr-TR", locale, "Türkçe")}
            </select>
          </label>
          <label class="settings-row"><span>Часовой пояс</span>
            <input class="settings-input" type="text" value="${esc(
              timezone
            )}" data-test-timezone="${esc(speaker.id)}" />
          </label>
          <button class="settings-btn" data-test-timezone-save="${esc(
            speaker.id
          )}">Сохранить часовой пояс</button>
          <div class="settings-row-2">
            <label class="settings-row"><span>Широта</span>
              <input class="settings-input" type="number" step="0.000001" value="${
                location.latitude ?? ""
              }" data-test-lat="${esc(speaker.id)}" />
            </label>
            <label class="settings-row"><span>Долгота</span>
              <input class="settings-input" type="number" step="0.000001" value="${
                location.longitude ?? ""
              }" data-test-lon="${esc(speaker.id)}" />
            </label>
          </div>
          <button class="settings-btn" data-test-location-save="${esc(
            speaker.id
          )}">Сохранить геолокацию</button>
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:phone-in-talk-outline"></ha-icon><h5>Звонки и Drop-in</h5></div>
          <label class="settings-row"><span>Входящие</span>
            <select class="settings-select" data-test-config="${esc(
              speaker.id
            )}" data-test-path="calls_settings.incoming_policy" data-test-kind="string">
              ${option(
                "allow_device_owner_and_guests",
                calls.incoming_policy,
                "Владелец и гости"
              )}
              ${option(
                "allow_device_owner",
                calls.incoming_policy,
                "Только владелец"
              )}
              ${option("allow_all", calls.incoming_policy, "Все")}
              ${option("deny_all", calls.incoming_policy, "Запретить")}
            </select>
          </label>
          <label class="settings-row"><span>Drop-in</span>
            <select class="settings-select" data-test-config="${esc(
              speaker.id
            )}" data-test-path="calls_settings.incoming_dropin_policy" data-test-kind="string">
              ${option(
                "allow_device_owner_and_guests",
                calls.incoming_dropin_policy,
                "Владелец и гости"
              )}
              ${option(
                "allow_device_owner",
                calls.incoming_dropin_policy,
                "Только владелец"
              )}
              ${option("deny_all", calls.incoming_dropin_policy, "Запретить")}
            </select>
          </label>
          <label class="settings-row"><span>Радионяня</span>
            <select class="settings-select" data-test-config="${esc(
              speaker.id
            )}" data-test-path="calls_settings.incoming_radionanny_policy" data-test-kind="string">
              ${option(
                "allow_device_owner",
                calls.incoming_radionanny_policy,
                "Только владелец"
              )}
              ${option(
                "allow_device_owner_and_guests",
                calls.incoming_radionanny_policy,
                "Владелец и гости"
              )}
              ${option(
                "deny_all",
                calls.incoming_radionanny_policy,
                "Запретить"
              )}
            </select>
          </label>
          ${switchRow(
            "radio_nanny_enabled",
            config.radio_nanny_enabled,
            "Радионяня включена"
          )}
          ${switchRow(
            "allow_non_self_calls",
            config.allow_non_self_calls,
            "Звонки с других аккаунтов"
          )}
        </section>

        <section class="settings-card">
          <div class="settings-card-head"><ha-icon icon="mdi:flask-outline"></ha-icon><h5>Эксперименты</h5></div>
          ${switchRow(
            "intonationSpotting.enabled",
            (config.intonationSpotting || {}).enabled,
            "Распознавание интонаций"
          )}
          ${switchRow("tv_beta", config.tv_beta, "ТВ-режим (бета)")}
          ${switchRow("tv_max", config.tv_max, "ТВ-режим (Макс)")}
          ${switchRow("beta", config.beta, "Бета-канал", true)}
          <div class="settings-hint">ТВ-режим связан с HDMI. Бета-канал может быть нестабильным.</div>
        </section>
      </div>
    </div>`;
  }

  _renderSpeakerControls(speakers) {
    const withEntity = speakers.filter(
      (speaker) => speaker.entity_id && this._hass.states[speaker.entity_id]
    );
    if (!withEntity.length) {
      return `<div class="empty">Колонки не найдены. Проверьте cookies и токен в настройках интеграции.</div>`;
    }
    withEntity.forEach((speaker) => {
      if (!this._diagnostics[speaker.id] && !this._diagLoading[speaker.id]) {
        this._loadSpeakerDiagnostics(speaker.id);
      }
    });
    return `
      <div class="speaker-controls">
        ${withEntity
          .map((speaker) => this._renderSpeakerControlsCard(speaker))
          .join("")}
      </div>
      <div class="section speaker-note">
        <ha-icon icon="mdi:home-assistant"></ha-icon>
        <p class="muted">Yandex Smart Home — отдельная интеграция для показа устройств Home Assistant в Алисе. Установите и настройте её в
          <a href="/config/integrations" target="_blank">Настройки → Устройства и службы</a>.
          YaHome Hub не включает её автоматически.</p>
      </div>`;
  }

  _renderLedAutoButton(speaker, entityId) {
    const autoEntity = speaker.led_auto_entity
      ? this._hass.states[speaker.led_auto_entity]
      : null;
    const active = autoEntity ? autoEntity.state === "on" : true;
    return `<button class="auto-mode-btn ${active ? "active" : ""}" data-led-auto="${
      speaker.id
    }" data-entity="${this._esc(entityId)}" data-auto-entity="${this._esc(
      speaker.led_auto_entity || ""
    )}">
      <ha-icon icon="mdi:brightness-auto"></ha-icon>
      <span>Авто-яркость</span>
      <b>${active ? "вкл" : "выкл"}</b>
    </button>`;
  }

  _renderSourceButtons(speaker, entityId) {
    return this._renderPanelSource(
      speaker,
      this._hass.states[entityId] || { entity_id: entityId, attributes: {} }
    );
  }

  _renderSpeakerControlsCard(speaker) {
    const entityId = speaker.entity_id;
    const entity = this._hass.states[entityId];
    const eqEntity = speaker.equalizer_entity
      ? this._hass.states[speaker.equalizer_entity]
      : null;
    const eqOptions = eqEntity ? eqEntity.attributes.options || [] : [];
    const eqValue = eqEntity ? eqEntity.state : "";
    const calendar = speaker.calendar_entity
      ? this._hass.states[speaker.calendar_entity]
      : null;
    const lyricsState = speaker.lyrics_entity
      ? this._hass.states[speaker.lyrics_entity]
      : null;
    const lyricsPreview =
      (lyricsState && lyricsState.attributes
        ? lyricsState.attributes.entity_picture
        : "") || "";
    const sensors = speaker.sensors || [];
    const ledState = speaker.led_entity
      ? this._hass.states[speaker.led_entity]
      : null;
    const ledValue = ledState?.attributes?.brightness
      ? Math.round((Number(ledState.attributes.brightness) / 255) * 100)
      : 60;
    const screenState = speaker.screen_entity
      ? this._hass.states[speaker.screen_entity]
      : null;
    const screenValue = screenState?.state === "Эквалайзер" ? "equalizer" : "clock";
    const cardMode = this._playerMode(speaker, entity);
    const cardAlice = this._aliceInfo(entity.attributes || {});
    return `<article class="speaker-control">
      <div class="speaker-control-head">
        <div class="device-icon" style="--accent:#5b6cff"><ha-icon icon="mdi:speaker-wireless"></ha-icon></div>
        <div>
          <h3>${this._esc(speaker.name)}</h3>
          <p class="muted">${this._esc(speaker.platform || "")} · ${
      entity.state === "off" ? "выключена" : "онлайн"
    }</p>
          <div class="player-topline card-topline">
            <span class="engine-pill engine-${cardMode.mode}">
              <ha-icon icon="${this._engineInfo(cardMode).icon}"></ha-icon>
              <b>${this._esc(cardMode.label)}</b>
            </span>
            <span class="alice-live ${cardAlice.state.toLowerCase()}" data-card-alice="${this._esc(
      speaker.id
    )}"><i></i><span data-card-alice-label>Алиса · ${this._esc(
      cardAlice.label
    )}</span></span>
          </div>
        </div>
      </div>
      <div class="speaker-grid">
        <div class="control-block">
          <h4>Озвучить текст</h4>
          <textarea data-tts-text="${this._esc(speaker.id)}" placeholder="Что сказать?"></textarea>
          <div class="control-line">
            <input type="range" min="0" max="100" value="70" data-tts-volume="${this._esc(
              speaker.id
            )}">
            <button class="action-btn" data-tts-send="${this._esc(
              speaker.id
            )}" data-entity="${this._esc(entityId)}">Озвучить</button>
          </div>
        </div>
        ${
          speaker.led_supported
            ? `<div class="control-block">
                <h4>Подсветка</h4>
                ${this._renderLedAutoButton(speaker, entityId)}
                <label>Яркость <input type="range" min="0" max="100" value="${ledValue}" data-led-brightness="${this._esc(
                  speaker.id
                )}"></label>
                <label>Экран <select data-led-visualization="${this._esc(
                  speaker.id
                )}"><option value="clock" ${
                  screenValue === "clock" ? "selected" : ""
                }>Часы</option><option value="equalizer" ${
                  screenValue === "equalizer" ? "selected" : ""
                }>Эквалайзер</option></select></label>
                <button class="action-btn" data-led-apply="${this._esc(
                  speaker.id
                )}" data-entity="${this._esc(entityId)}">Применить</button>
              </div>`
            : ""
        }
        ${
          eqOptions.length
            ? `<div class="control-block">
                <h4>Эквалайзер</h4>
                <select class="eq-select" data-eq-entity="${this._esc(
                  speaker.equalizer_entity
                )}">${eqOptions
                .map(
                  (option) =>
                    `<option value="${this._esc(option)}" ${
                      option === eqValue ? "selected" : ""
                    }>${this._esc(this._eqLabel(option))}</option>`
                )
                .join("")}</select>
              </div>`
            : ""
        }
        <div class="control-block">
          <h4>Будильники</h4>
          <p class="muted">${calendar ? this._esc(calendar.state) : "Нет календаря"}</p>
          ${
            speaker.calendar_entity
              ? `<button class="ghost-btn" data-more-info="${this._esc(
                  speaker.calendar_entity
                )}">Открыть</button>`
              : ""
          }
        </div>
        <div class="control-block">
          <h4>Текст песни</h4>
          ${
            speaker.lyrics_entity && lyricsPreview
              ? `<img class="lyrics-preview" src="${this._esc(
                  lyricsPreview
                )}" alt="">`
              : `<p class="muted">Камера недоступна</p>`
          }
          ${
            speaker.lyrics_entity
              ? `<button class="ghost-btn" data-more-info="${this._esc(
                  speaker.lyrics_entity
                )}">Открыть камеру</button>`
              : ""
          }
        </div>
        <div class="control-block">
          <h4>Алиса</h4>
          <div class="chat-line">
            <input data-chat-input="${this._esc(
              speaker.id
            )}" placeholder="Спросить Алису...">
            <button class="action-btn" data-chat-send="${this._esc(
              speaker.id
            )}" data-entity="${this._esc(speaker.conversation_entity || "")}">→</button>
          </div>
          <div class="chat-response" data-chat-response="${this._esc(
            speaker.id
          )}"></div>
        </div>
        <div class="control-block">
          <h4>Датчики</h4>
          ${
            sensors.length
              ? `<div class="sensor-grid">${sensors
                  .map(
                    (sensor) =>
                      `<div class="sensor-tile"><span>${this._esc(
                        this._sensorLabel(sensor.instance)
                      )}</span><b>${this._esc(
                        String(sensor.value ?? "—")
                      )}</b></div>`
                  )
                  .join("")}</div>`
              : `<p class="muted">Эта модель не отдаёт датчики температуры, влажности и освещённости.</p>`
          }
        </div>
      </div>
      <div class="speaker-settings" data-speaker-settings="${this._esc(
        speaker.id
      )}">
        <div class="settings-head">
          <div>
            <h4>Настройки станции</h4>
            <p class="muted">Алиса, плеер, музыка, DND, часы, сон, язык, звонки и эксперименты.</p>
          </div>
          <button class="ghost-btn" data-settings-refresh="${this._esc(
            speaker.id
          )}">Обновить</button>
        </div>
        ${
          this._diagnostics[speaker.id] && !this._diagnostics[speaker.id].error
            ? this._renderStationSettings(
                speaker,
                this._diagnostics[speaker.id]
              )
            : `<div class="settings-loading"><div class="spinner"></div><span>${
                this._diagLoading[speaker.id]
                  ? "Сканирую настройки колонки…"
                  : "Настройки ещё не загружены"
              }</span></div>`
        }
      </div>
      <div class="control-status" data-control-status="${this._esc(
        speaker.id
      )}"></div>
    </article>`;
  }

  _sensorLabel(instance) {
    const labels = {
      temperature: "Температура",
      humidity: "Влажность",
      illumination: "Освещённость",
      motion: "Движение",
      battery_level: "Батарея",
      pressure: "Давление",
      co2: "CO₂",
      pm25: "PM2.5",
      water_leak: "Протечка",
      smoke: "Дым",
      gas: "Газ",
      open: "Открыто",
    };
    return labels[instance] || instance || "Датчик";
  }

  _renderSpeakerFallback(speaker) {
    return `
      <article class="player compact">
        <div class="player-cover"><ha-icon icon="mdi:speaker-wireless"></ha-icon></div>
        <div class="player-meta">
          <span class="player-kicker">${this._esc(
            speaker.platform || "Устройство с Алисой"
          )}</span>
          <h3>${this._esc(speaker.name)}</h3>
          <p class="muted">Нет доступной медиасессии</p>
        </div>
      </article>`;
  }

  _speakerImage(speaker) {
    if (
      String(speaker.platform || "").includes("yandexstation_2") ||
      String(speaker.name || "").includes("Станция Макс")
    ) {
      return "/yahome_hub/station-max.svg";
    }
    return "";
  }

  _videoPlaceholder() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101828"/><stop offset="1" stop-color="#3b2b52"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="640" cy="320" r="72" fill="none" stroke="#8f9bff" stroke-width="10"/><path d="M620 285 L690 320 L620 355 Z" fill="#8f9bff"/><text x="640" y="470" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#cbd5e1" text-anchor="middle">ВИДЕО</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  _videoProviderLabel(provider) {
    const labels = {
      youtube: "YouTube",
      rutube: "Rutube",
      kinopoisk: "Кинопоиск",
      ivi: "IVI",
      okko: "Okko",
      wink: "Wink",
      start: "Start",
      premier: "Premier",
      yavideo: "VK Видео",
      strm: "Яндекс Эфир",
      video: "Видео",
    };
    return labels[String(provider || "").toLowerCase()] || "Видео";
  }

  _canPreviewVideo(video) {
    if (!video) return false;
    if (
      (video.provider === "youtube" || video.provider === "rutube") &&
      video.videoId
    ) {
      return true;
    }
    return /\.(mp4|webm)(?:$|[?#])/i.test(String(video.url || ""));
  }

  _openHaVideo(speakerId) {
    const speaker = (this._data?.speakers || []).find(
      (item) => item.id === speakerId
    );
    const entity = speaker ? this._hass.states[speaker.entity_id] : null;
    if (!speaker || !entity) return;
    const info = this._videoInfo(speaker, entity);
    this._haVideo = {
      provider: info.provider,
      videoId: info.videoId,
      url: info.url,
      title: info.title,
    };
    this._render();
  }

  _renderHaVideo() {
    const video = this._haVideo;
    if (!video) return "";
    let content = "";
    if (video.provider === "youtube" && video.videoId) {
      content = `<iframe src="https://www.youtube-nocookie.com/embed/${this._esc(
        video.videoId
      )}?rel=0&modestbranding=1" title="${this._esc(
        video.title
      )}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else if (video.provider === "rutube" && video.videoId) {
      content = `<iframe src="https://rutube.ru/play/embed/${this._esc(
        video.videoId
      )}/" title="${this._esc(
        video.title
      )}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else if (/\.(mp4|webm)(?:$|[?#])/i.test(String(video.url || ""))) {
      content = `<video controls src="${this._esc(
        video.url
      )}" title="${this._esc(video.title)}"></video>`;
    } else {
      content = `<div class="ha-video-note">Этот поток нельзя встроить в браузер. Откройте источник на телевизоре.</div>`;
    }
    return `<div class="ha-video-modal">
      <div class="ha-video-backdrop" data-ha-video-close></div>
      <div class="ha-video-body">
        <div class="ha-video-head">
          <div>
            <b>${this._esc(video.title || "Видео")}</b>
            <span>Предпросмотр в HA · не зеркало телевизора</span>
          </div>
          <button class="ha-video-close" data-ha-video-close title="Закрыть">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="ha-video-frame">${content}</div>
        <div class="ha-video-foot">
          <span>Телевизор продолжает играть свой поток.</span>
          ${
            video.url
              ? `<a href="${this._esc(
                  video.url
                )}" target="_blank" rel="noopener">Открыть источник</a>`
              : ""
          }
        </div>
      </div>
    </div>`;
  }

  _videoInfo(speaker, entity) {
    const attrs = (entity && entity.attributes) || {};
    const state = entity ? entity.state : "";
    const contentId = String(attrs.media_content_id || "");
    const title = String(attrs.media_title || "Видео");
    const source = `${contentId} ${attrs.video_url || ""}`;
    let provider = String(attrs.video_provider || "").toLowerCase();
    let videoId = String(attrs.video_id || "");
    if (!videoId) {
      const match = source.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/))([0-9A-Za-z_-]{11})/
      );
      if (match) videoId = match[1];
    }
    if (!provider) {
      if (/youtu/i.test(source) || /youtube/i.test(title)) {
        provider = "youtube";
      } else if (/rutube/i.test(source)) {
        provider = "rutube";
      } else if (/kinopoisk/i.test(source)) {
        provider = "kinopoisk";
      } else if (/ivi\.ru/i.test(source)) {
        provider = "ivi";
      } else if (/okko\.tv/i.test(source)) {
        provider = "okko";
      } else if (/wink\.ru/i.test(source)) {
        provider = "wink";
      } else if (/start\.ru/i.test(source)) {
        provider = "start";
      } else if (/premier\.one/i.test(source)) {
        provider = "premier";
      } else if (/vk\.com|ok\.ru/i.test(source)) {
        provider = "yavideo";
      }
    }
    if (!provider && /^[0-9A-Za-z_-]{11}$/.test(videoId)) {
      provider = "youtube";
    }
    const contentType = String(attrs.media_content_type || "").toLowerCase();
    const detected =
      Boolean(attrs.yahome_video || attrs.video) ||
      contentType === "video" ||
      contentType === "tvshow" ||
      Boolean(provider) ||
      Boolean(videoId);
    const active =
      detected && (state === "playing" || state === "paused");
    let thumbnail =
      attrs.video_thumbnail ||
      (provider === "youtube" && videoId
        ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
        : "") ||
      attrs.entity_picture ||
      "";
    if (!thumbnail && active) {
      thumbnail = this._videoPlaceholder();
    }
    let url = String(attrs.video_url || "");
    if (!url && provider === "youtube" && videoId) {
      url = `https://youtu.be/${videoId}`;
    }
    if (!url && /^https?:\/\//i.test(contentId)) {
      url = contentId;
    }
    return {
      active,
      playing: state === "playing",
      paused: state === "paused",
      provider,
      videoId,
      thumbnail,
      url,
      title,
      subtitle: attrs.media_artist || attrs.media_series_title || "",
      position: this._currentPosition(entity),
      duration: Number(attrs.media_duration) || 0,
    };
  }

  _playerMode(speaker, entity) {
    const attrs = (entity && entity.attributes) || {};
    const video = this._videoInfo(speaker, entity);
    const engine = String(attrs.player_engine || "").toLowerCase();
    const contentType = String(attrs.media_content_type || "").toLowerCase();
    if (video.active) {
      return {
        mode: "video",
        engine: engine || "video",
        label: "Видео",
      };
    }
    if (engine.includes("radio") || contentType === "radio") {
      return {
        mode: "radio",
        engine: engine || "radio",
        label: "Радио",
      };
    }
    if (
      engine ||
      contentType === "music" ||
      (entity && (entity.state === "playing" || entity.state === "paused"))
    ) {
      return {
        mode: "music",
        engine: engine || "music_thin",
        label: "Музыка",
      };
    }
    return { mode: "idle", engine, label: "Ожидание" };
  }

  _aliceInfo(attrs) {
    const state = String((attrs && attrs.alice_state) || "IDLE").toUpperCase();
    const labels = {
      IDLE: "Свободна",
      LISTENING: "Слушает",
      THINKING: "Думает",
      SPEAKING: "Говорит",
    };
    return { state, label: labels[state] || "Свободна" };
  }

  _engineInfo(modeInfo) {
    const icons = {
      music: "mdi:music-note",
      video: "mdi:movie-open",
      radio: "mdi:radio",
      idle: "mdi:power",
    };
    return {
      label: modeInfo.label,
      raw: modeInfo.engine || "",
      icon: icons[modeInfo.mode] || "mdi:play",
    };
  }

  _renderQualitySwitch(speaker, quality, entityId) {
    const value = quality === "low" ? "low" : "high";
    return `<div class="quality-switch" data-quality-group="${this._esc(
      speaker.id
    )}">
      <span class="quality-label"><ha-icon icon="mdi:equalizer"></ha-icon> Качество</span>
      <button class="${
        value === "high" ? "active" : ""
      }" data-quality-value="high" data-quality-speaker="${this._esc(
      speaker.id
    )}" data-entity="${this._esc(
      entityId
    )}" title="Высокое качество">Высокое</button>
      <button class="${
        value === "low" ? "active" : ""
      }" data-quality-value="low" data-quality-speaker="${this._esc(
      speaker.id
    )}" data-entity="${this._esc(
      entityId
    )}" title="Экономный трафик">Низкое</button>
    </div>`;
  }

  _activeVideo() {
    const speakers = (this._data && this._data.speakers) || [];
    let paused = null;
    for (const speaker of speakers) {
      const entity = this._hass.states[speaker.entity_id];
      if (!entity) continue;
      const info = this._videoInfo(speaker, entity);
      if (!info.active) continue;
      if (info.playing) return { speaker, entity, info };
      if (!paused) paused = { speaker, entity, info };
    }
    return paused;
  }

  _activeMedia() {
    const video = this._activeVideo();
    if (video && video.info.playing) {
      return {
        speaker: video.speaker,
        entity: video.entity,
        info: { ...video.info, kind: "video" },
      };
    }
    const pausedVideo = video
      ? {
          speaker: video.speaker,
          entity: video.entity,
          info: { ...video.info, kind: "video" },
        }
      : null;
    let paused = null;
    for (const speaker of this._musicSpeakers()) {
      const entity = this._hass.states[speaker.entity_id];
      if (!entity || !["playing", "paused"].includes(entity.state)) continue;
      const mode = this._playerMode(speaker, entity);
      if (mode.mode === "video") continue;
      const attrs = entity.attributes || {};
      const info = {
        kind: "media",
        active: true,
        mode: mode.mode,
        provider: mode.mode === "radio" ? "radio" : "music",
        title: attrs.media_title || speaker.name,
        subtitle:
          attrs.media_artist ||
          attrs.live_stream_subtitle ||
          attrs.media_album_name ||
          "",
        thumbnail: attrs.entity_picture || this._speakerImage(speaker) || "",
        playing: entity.state === "playing",
        duration: Number(attrs.media_duration) || 0,
        position: this._currentPosition(entity) || 0,
      };
      if (info.playing) return { speaker, entity, info };
      if (!paused) paused = { speaker, entity, info };
    }
    return paused || pausedVideo;
  }

  _lyricLines(lyrics, position) {
    const empty = {
      prev: "",
      current: "",
      next: "",
      remaining: null,
      start: null,
      end: null,
    };
    if (!lyrics) return empty;
    const timed = [];
    const plain = [];
    for (const raw of String(lyrics).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)$/);
      if (match) {
        const seconds =
          Number(match[1]) * 60 +
          Number(match[2]) +
          (match[3]
            ? Number(match[3]) / (match[3].length === 2 ? 100 : 1000)
            : 0);
        timed.push({ seconds, text: match[4].trim() });
      } else if (!line.startsWith("[")) {
        plain.push(line);
      }
    }
    const pos = Math.max(0, Number(position) || 0);
    if (timed.length) {
      let index = 0;
      for (let i = 0; i < timed.length; i += 1) {
        if (timed[i].seconds <= pos) index = i;
        else break;
      }
      const start = timed[index].seconds;
      const end = timed[index + 1]?.seconds ?? null;
      return {
        prev: timed[index - 1]?.text || "",
        current: timed[index]?.text || "",
        next: timed[index + 1]?.text || "",
        remaining: end !== null ? Math.max(0, end - pos) : null,
        start,
        end,
      };
    }
    if (plain.length) {
      const index = Math.floor(pos / 4) % plain.length;
      const start = index * 4;
      return {
        prev: plain[index - 1] || "",
        current: plain[index],
        next: plain[index + 1] || "",
        remaining: Math.max(0, start + 4 - pos),
        start,
        end: start + 4,
      };
    }
    return empty;
  }

  _lyricsFor(speaker) {
    const trackId = String(
      this._hass.states[speaker.entity_id]?.attributes?.media_content_id || ""
    );
    if (!trackId) return "";
    const camera = speaker.lyrics_entity
      ? this._hass.states[speaker.lyrics_entity]
      : null;
    const fromCamera = camera?.attributes?.lyrics;
    if (fromCamera) return fromCamera;
    const cached = this._lyricsCache[trackId];
    if (cached && cached !== true) return cached;
    if (!cached) {
      this._lyricsCache[trackId] = true;
      this._hass
        .callWS({ type: "yahome_hub/lyrics", track_id: trackId })
        .then((result) => {
          this._lyricsCache[trackId] = result?.lyrics || "";
          this._updatePlayerDom();
        })
        .catch(() => {
          this._lyricsCache[trackId] = "";
        });
    }
    return "";
  }

  _renderSpeakerPlayer(speaker, full = false) {
    const entityId = speaker.entity_id;
    const entity = this._hass.states[entityId];
    const attrs = entity.attributes || {};
    const playing = entity.state === "playing";
    const paused = entity.state === "paused";
    const trackId = String(attrs.media_content_id || "");
    const trackInfo = /^\d+$/.test(trackId) ? this._trackInfo(trackId) : null;
    const image = this._speakerImage(speaker);
    const video = this._videoInfo(speaker, entity);
    const modeInfo = this._playerMode(speaker, entity);
    const musicQuality = speaker.music_quality || "high";
    const cover =
      video.active && video.thumbnail
        ? video.thumbnail
        : attrs.entity_picture || (trackInfo && trackInfo.cover) || image;
    const title = attrs.media_title || "Готов к воспроизведению";
    const artist = attrs.media_artist || speaker.name;
    const album =
      attrs.media_album_name ||
      attrs.media_playlist ||
      (trackInfo && trackInfo.album) ||
      "";
    const duration = Number(attrs.media_duration) || 0;
    const position = this._currentPosition(entity);
    const volume =
      attrs.volume_level !== undefined && attrs.volume_level !== null
        ? Math.round(Number(attrs.volume_level) * 100)
        : speaker.volume !== null && speaker.volume !== undefined
        ? Number(speaker.volume)
        : 0;
    const muted = Boolean(attrs.is_volume_muted) || volume === 0;
    const lyrics = full ? this._lyricsFor(speaker) : "";
    const lyric = full
      ? this._lyricLines(lyrics, position + this._lyricsOffset)
      : { prev: "", current: "", next: "", remaining: null };
    const aliceInfo = this._aliceInfo(attrs);
    const engineInfo = this._engineInfo(modeInfo);
    const canStop = Boolean(attrs.can_stop);
    const liveText = String(attrs.live_stream || "");
    const liveName = String(
      attrs.live_stream_subtitle || attrs.media_artist || ""
    );
    return `
      <article class="player skin-${this._playerSkin} ${full ? "full" : ""} ${
      video.active ? "video-mode" : ""
    } mode-${modeInfo.mode} ${playing ? "playing" : ""} ${
      paused ? "paused" : ""
    }" data-player="${this._esc(
      speaker.id
    )}" data-player-entity="${this._esc(entityId)}" style="--beat-dur:${(
      60 / this._trackBpm(entity)
    ).toFixed(3)}s;--beat:0;${
      cover ? `--cover:url('${this._esc(cover)}')` : ""
    }">
        <div class="player-bg"></div>
        <div class="player-glow"></div>
        <div class="player-content">
          <div class="player-head">
            <div class="player-cover ${full ? "big" : ""} ${
      video.active ? "video" : ""
    }">
              ${
                cover
                  ? `<img data-player-cover src="${this._esc(
                      cover
                    )}" alt="" loading="lazy" />`
                  : `<ha-icon data-cover-fallback icon="mdi:speaker"></ha-icon>`
              }
              ${
                video.active
                  ? `<span class="video-chip"><ha-icon icon="${
                      video.provider === "youtube"
                        ? "mdi:youtube"
                        : "mdi:play-circle"
                    }"></ha-icon> ${this._esc(
                      this._videoProviderLabel(video.provider)
                    )}</span>`
                  : ""
              }
              ${
                full && !video.active && this._showLyrics
                  ? `<div class="lyrics-overlay">
                      <div class="lyrics-prev" data-lyrics-prev>${this._esc(
                        lyric.prev
                      )}</div>
                      <div class="lyrics-current-row">
                        <span class="lyrics-countdown" data-lyrics-countdown>${this._formatCountdown(
                          lyric.remaining
                        )}</span>
                        <div class="lyrics-current" data-lyrics-current>${this._esc(
                          lyric.current
                        )}</div>
                      </div>
                      <div class="lyrics-next" data-lyrics-next>${this._esc(
                        lyric.next
                      )}</div>
                    </div>`
                  : ""
              }
            </div>
            <div class="player-meta">
              <div class="player-topline">
                <span class="engine-pill engine-${modeInfo.mode}" data-engine-pill title="Технический тип: ${this._esc(
                  engineInfo.raw
                )}">
                  <ha-icon icon="${engineInfo.icon}"></ha-icon>
                  <b data-engine-label>${this._esc(engineInfo.label)}</b>
                </span>
                <span class="alice-live ${aliceInfo.state.toLowerCase()}" data-alice-live>
                  <i></i><span data-alice-label>Алиса · ${this._esc(
                    aliceInfo.label
                  )}</span>
                </span>
              </div>
              <span class="player-kicker" data-player-kicker><span class="beat-dot" data-beat-dot></span>${
                video.active
                  ? playing
                    ? "Сейчас играет видео"
                    : paused
                    ? "Пауза · видео"
                    : "Видео"
                  : playing
                  ? "Сейчас играет"
                  : paused
                  ? "Пауза"
                  : entity.state === "off"
                  ? "Выключена"
                  : "Колонка"
              }</span>
              <h3 data-player-title>${this._esc(title)}</h3>
              <p data-player-meta>${this._esc(artist)}${
      album ? ` <span class="dot">·</span> ${this._esc(album)}` : ""
    }</p>
              <div class="player-badges">
                <span class="live-badge" data-live-badge ${
                  liveText ? "" : "hidden"
                }><ha-icon icon="mdi:radio"></ha-icon> <span data-live-name>${this._esc(
      liveName || liveText
    )}</span></span>
              </div>
            </div>
            <div class="player-actions">
              ${
                full
                  ? `<button class="power" data-toggle-lyrics title="Текст песни"><ha-icon icon="mdi:text-box-music"></ha-icon></button>
                     <button class="power" data-close-player title="Закрыть"><ha-icon icon="mdi:close"></ha-icon></button>`
                  : `<button class="power" data-open-player="${this._esc(
                      speaker.id
                    )}" title="Открыть плеер"><ha-icon icon="mdi:dots-vertical"></ha-icon></button>`
              }
              <button class="power player-power ${
                entity.state !== "off" ? "on" : ""
              }" data-player-power="${this._esc(
      entityId
    )}" title="Вкл/выкл"><ha-icon icon="mdi:power"></ha-icon></button>
            </div>
          </div>
          <div class="radio-card" data-radio-card ${liveText ? "" : "hidden"}>
            <ha-icon icon="mdi:radio"></ha-icon>
            <div class="radio-copy">
              <span data-radio-live>${this._esc(liveText || "Прямой эфир")}</span>
              <b data-radio-name>${this._esc(liveName)}</b>
            </div>
            <div class="radio-bars"><i></i><i></i><i></i><i></i><i></i></div>
          </div>
          ${this._renderViz(playing)}
          <div class="player-seek">
            <input type="range" min="0" max="${duration}" step="1" value="${position}"
              data-seek-entity="${this._esc(entityId)}"
              data-player-seek data-duration="${duration}" ${
      duration ? "" : "disabled"
    } />
            <div class="times">
              <span data-current-for="${this._esc(
                entityId
              )}" data-player-current>${this._formatTime(position)}</span>
              <span data-player-duration>${this._formatTime(duration)}</span>
            </div>
          </div>
          <div class="player-controls">
            <div class="transport">
              <button class="icon-btn" data-player-action="previous" data-player-entity="${this._esc(
                entityId
              )}" title="Предыдущий трек"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
              <button class="icon-btn play" data-player-action="playpause" data-player-entity="${this._esc(
                entityId
              )}" data-player-play title="${playing ? "Пауза" : "Играть"}">
                <ha-icon icon="${playing ? "mdi:pause" : "mdi:play"}"></ha-icon>
              </button>
              <button class="icon-btn" data-player-action="next" data-player-entity="${this._esc(
                entityId
              )}" title="Следующий трек"><ha-icon icon="mdi:skip-next"></ha-icon></button>
              <button class="icon-btn stop" data-player-action="stop" data-player-entity="${this._esc(
                entityId
              )}" data-player-stop title="${
      canStop ? "Остановить" : "Нет активного действия"
    }" ${canStop ? "" : "disabled"}><ha-icon icon="mdi:stop"></ha-icon></button>
            </div>
            <div class="volume-control">
              <button class="volume-toggle" data-player-mute="${this._esc(
                entityId
              )}" title="${muted ? "Включить звук" : "Выключить звук"}">
                <ha-icon icon="${muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon>
              </button>
              <input type="range" min="0" max="100" step="1" value="${volume}"
                data-volume-entity="${this._esc(
                  entityId
                )}" data-player-volume />
              <span data-volume-for="${this._esc(
                entityId
              )}" data-player-volume-label>${volume}%</span>
            </div>
            ${this._renderQualitySwitch(speaker, musicQuality, entityId)}
          </div>
          ${this._renderSpeakerExtras(speaker, entity)}
          ${
            full && this._showLyrics
              ? `<div class="lyrics-sync">
                  <span>Синхронизация текста</span>
                  <button class="sync-btn" data-lyrics-offset="-0.5">−0.5</button>
                  <b data-lyrics-offset-label>${this._lyricsOffset.toFixed(
                    1
                  )} с</b>
                  <button class="sync-btn" data-lyrics-offset="0.5">+0.5</button>
                </div>`
              : ""
          }
          ${
            full
              ? `<div class="music-search">
                  <div class="search-row">
                    <input data-music-query="${this._esc(
                      speaker.id
                    )}" placeholder="Трек, исполнитель или ссылка">
                    <button class="action-btn" data-music-search="${this._esc(
                      speaker.id
                    )}" data-entity="${this._esc(entityId)}">Найти</button>
                  </div>
                  <div class="music-results" data-music-results="${this._esc(
                    speaker.id
                  )}"></div>
                  <div class="mode-row">
                    <button class="mode-btn ${
                      attrs.shuffle ? "active" : ""
                    }" data-shuffle="${this._esc(
                    entityId
                  )}"><ha-icon icon="mdi:shuffle"></ha-icon> Перемешать</button>
                    <select data-repeat="${this._esc(entityId)}">
                      <option value="off" ${
                        attrs.repeat === "off" ? "selected" : ""
                      }>Без повтора</option>
                      <option value="all" ${
                        attrs.repeat === "all" ? "selected" : ""
                      }>Повторять всё</option>
                      <option value="one" ${
                        attrs.repeat === "one" ? "selected" : ""
                      }>Повторять трек</option>
                    </select>
                  </div>
                </div>`
              : ""
          }
        </div>
      </article>`;
  }

  _updatePlayerDom(restartTicker = true) {
    const root = this.shadowRoot;
    if (!root || !this._data) return;
    root.querySelectorAll(".player[data-player-entity]").forEach((el) => {
      const entityId = el.getAttribute("data-player-entity");
      const entity = this._hass.states[entityId];
      const speaker = (this._data.speakers || []).find(
        (item) => item.id === el.getAttribute("data-player")
      );
      if (!entity || !speaker) return;
      const attrs = entity.attributes || {};
      const playing = entity.state === "playing";
      const paused = entity.state === "paused";
      const video = this._videoInfo(speaker, entity);
      const modeInfo = this._playerMode(speaker, entity);
      const aliceInfo = this._aliceInfo(attrs);
      const engineInfo = this._engineInfo(modeInfo);
      const canStop = Boolean(attrs.can_stop);
      const liveText = String(attrs.live_stream || "");
      const liveName = String(
        attrs.live_stream_subtitle || attrs.media_artist || ""
      );
      el.classList.toggle("playing", playing);
      el.classList.toggle("paused", paused);
      el.classList.toggle("video-mode", video.active);
      el.classList.remove(
        "mode-music",
        "mode-radio",
        "mode-video",
        "mode-idle"
      );
      el.classList.add(`mode-${modeInfo.mode}`);
      const trackId = String(attrs.media_content_id || "");
      const trackInfo = /^\d+$/.test(trackId) ? this._trackInfo(trackId) : null;
      const cover =
        video.active && video.thumbnail
          ? video.thumbnail
          : attrs.entity_picture ||
            (trackInfo && trackInfo.cover) ||
            this._speakerImage(speaker) ||
            "";
      const coverBox = el.querySelector(".player-cover");
      let image = el.querySelector("[data-player-cover]");
      if (cover) {
        const fallback = coverBox
          ? coverBox.querySelector("[data-cover-fallback]")
          : null;
        if (fallback) fallback.remove();
        if (!image && coverBox) {
          image = document.createElement("img");
          image.setAttribute("data-player-cover", "");
          image.alt = "";
          image.loading = "lazy";
          coverBox.insertBefore(image, coverBox.firstChild);
        }
        if (image && image.getAttribute("src") !== cover) {
          image.setAttribute("src", cover);
        }
        el.style.setProperty("--cover", `url('${cover}')`);
      } else {
        if (image) image.remove();
        if (coverBox && !coverBox.querySelector("[data-cover-fallback]")) {
          const fallback = document.createElement("ha-icon");
          fallback.setAttribute("data-cover-fallback", "");
          fallback.setAttribute("icon", "mdi:speaker");
          coverBox.insertBefore(fallback, coverBox.firstChild);
        }
        el.style.removeProperty("--cover");
      }
      let chip = coverBox ? coverBox.querySelector("[data-video-chip]") : null;
      if (video.active) {
        if (!chip && coverBox) {
          chip = document.createElement("span");
          chip.setAttribute("data-video-chip", "");
          chip.className = "video-chip";
          coverBox.appendChild(chip);
        }
        if (chip) {
          chip.innerHTML = `<ha-icon icon="${
            video.provider === "youtube" ? "mdi:youtube" : "mdi:play-circle"
          }"></ha-icon> ${this._videoProviderLabel(video.provider)}`;
        }
      } else if (chip) {
        chip.remove();
      }
      const title = attrs.media_title || "Готов к воспроизведению";
      const artist = attrs.media_artist || speaker.name;
      const album =
        attrs.media_album_name || attrs.media_playlist || "";
      const titleEl = el.querySelector("[data-player-title]");
      if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
      const metaText = album ? `${artist} · ${album}` : artist;
      const metaEl = el.querySelector("[data-player-meta]");
      if (metaEl && metaEl.textContent !== metaText) {
        metaEl.textContent = metaText;
      }
      const aliceEl = el.querySelector("[data-alice-live]");
      if (aliceEl) {
        aliceEl.hidden = false;
        aliceEl.className = `alice-live ${aliceInfo.state.toLowerCase()}`;
        const aliceText = aliceEl.querySelector("[data-alice-label]");
        const nextAlice = `Алиса · ${aliceInfo.label}`;
        if (aliceText && aliceText.textContent !== nextAlice) {
          aliceText.textContent = nextAlice;
        }
      }
      const liveBadge = el.querySelector("[data-live-badge]");
      if (liveBadge) {
        liveBadge.hidden = !liveText;
        const liveLabel = liveBadge.querySelector("[data-live-name]");
        if (liveLabel && liveLabel.textContent !== (liveName || liveText)) {
          liveLabel.textContent = liveName || liveText;
        }
      }
      const enginePill = el.querySelector("[data-engine-pill]");
      if (enginePill) {
        enginePill.className = `engine-pill engine-${modeInfo.mode}`;
        const engineIcon = enginePill.querySelector("ha-icon");
        if (engineIcon) engineIcon.setAttribute("icon", engineInfo.icon);
        const engineLabel = enginePill.querySelector("[data-engine-label]");
        if (engineLabel) engineLabel.textContent = engineInfo.label;
        enginePill.title = `Технический тип: ${engineInfo.raw}`;
      }
      const radioCard = el.querySelector("[data-radio-card]");
      if (radioCard) {
        radioCard.hidden = !liveText;
        const radioLive = radioCard.querySelector("[data-radio-live]");
        if (radioLive) {
          radioLive.textContent = liveText || "Прямой эфир";
        }
        const radioName = radioCard.querySelector("[data-radio-name]");
        if (radioName) radioName.textContent = liveName;
      }
      const stopButton = el.querySelector("[data-player-stop]");
      if (stopButton) {
        stopButton.disabled = !canStop;
        stopButton.title = canStop
          ? "Остановить"
          : "Нет активного действия";
      }
      el.querySelectorAll("[data-video-close]").forEach((button) => {
        button.hidden = !video.active || video.playing;
      });
      const kickerText = video.active
        ? playing
          ? "Сейчас играет видео"
          : paused
          ? "Пауза · видео"
          : "Видео"
        : playing
        ? "Сейчас играет"
        : paused
        ? "Пауза"
        : entity.state === "off"
        ? "Выключена"
        : "Колонка";
      const kicker = el.querySelector("[data-player-kicker]");
      if (kicker && kicker.textContent !== kickerText) {
        kicker.textContent = kickerText;
      }
      const playButton = el.querySelector("[data-player-play]");
      const playIcon = playButton ? playButton.querySelector("ha-icon") : null;
      if (playIcon) {
        const icon = playing ? "mdi:pause" : "mdi:play";
        if (playIcon.getAttribute("icon") !== icon) {
          playIcon.setAttribute("icon", icon);
        }
      }
      if (playButton) playButton.title = playing ? "Пауза" : "Играть";
      const powerButton = el.querySelector("[data-player-power]");
      if (powerButton) {
        powerButton.classList.toggle("on", entity.state !== "off");
      }
      const duration = Number(attrs.media_duration) || 0;
      const position = this._currentPosition(entity);
      const seek = el.querySelector("[data-player-seek]");
      if (seek) {
        seek.max = duration;
        seek.disabled = !duration;
        if (root.activeElement !== seek) {
          const next = Math.min(position, duration || position);
          if (Math.abs(Number(seek.value) - next) > 0.15) seek.value = next;
        }
      }
      const currentText = this._formatTime(position);
      const current = el.querySelector("[data-player-current]");
      if (current && current.textContent !== currentText) {
        current.textContent = currentText;
      }
      const totalText = this._formatTime(duration);
      const total = el.querySelector("[data-player-duration]");
      if (total && total.textContent !== totalText) {
        total.textContent = totalText;
      }
      const volume =
        attrs.volume_level !== undefined && attrs.volume_level !== null
          ? Math.round(Number(attrs.volume_level) * 100)
          : 0;
      const volumeInput = el.querySelector("[data-player-volume]");
      if (volumeInput && root.activeElement !== volumeInput) {
        if (Number(volumeInput.value) !== volume) {
          this._smoothRange(volumeInput, volume);
        }
      }
      const volumeLabel = el.querySelector("[data-player-volume-label]");
      const volumeText = `${volume}%`;
      if (volumeLabel && volumeLabel.textContent !== volumeText) {
        volumeLabel.textContent = volumeText;
      }
      const muted = Boolean(attrs.is_volume_muted) || volume === 0;
      const muteButton = el.querySelector("[data-player-mute]");
      if (muteButton) {
        const muteTitle = muted ? "Включить звук" : "Выключить звук";
        if (muteButton.title !== muteTitle) muteButton.title = muteTitle;
        const icon = muteButton.querySelector("ha-icon");
        if (icon) {
          const iconName = muted ? "mdi:volume-off" : "mdi:volume-high";
          if (icon.getAttribute("icon") !== iconName) {
            icon.setAttribute("icon", iconName);
          }
        }
      }
      const eq = el.querySelector("[data-eq-entity]");
      if (eq && speaker.equalizer_entity) {
        const eqState = this._hass.states[speaker.equalizer_entity];
        if (eqState && root.activeElement !== eq && eq.value !== eqState.state) {
          eq.value = eqState.state;
        }
      }
      const shuffleBtn = el.querySelector("[data-shuffle]");
      if (shuffleBtn) {
        shuffleBtn.classList.toggle("active", Boolean(attrs.shuffle));
      }
      const repeatSelect = el.querySelector("[data-repeat]");
      if (repeatSelect && attrs.repeat && repeatSelect.value !== attrs.repeat) {
        repeatSelect.value = attrs.repeat;
      }
      if (el.classList.contains("full") && this._showLyrics) {
        const lyrics = this._lyricsFor(speaker);
        const line = this._lyricLines(lyrics, position + this._lyricsOffset);
        this._setLyricText(
          el.querySelector("[data-lyrics-prev]"),
          line.prev
        );
        this._setLyricText(
          el.querySelector("[data-lyrics-current]"),
          line.current
        );
        this._setLyricText(
          el.querySelector("[data-lyrics-next]"),
          line.next
        );
        const countdown = el.querySelector("[data-lyrics-countdown]");
        if (countdown) {
          countdown.textContent = this._formatCountdown(line.remaining);
        }
      }
    });
    root.querySelectorAll("[data-video-hub]").forEach((hub) => {
      const speakerId = hub.getAttribute("data-video-hub");
      const speaker = (this._data.speakers || []).find(
        (item) => item.id === speakerId
      );
      const entity = speaker ? this._hass.states[speaker.entity_id] : null;
      if (!entity) return;
      const info = this._videoInfo(speaker, entity);
      const button = hub.querySelector("[data-video-close]");
      if (button) button.hidden = !info.active || info.playing;
    });
    root.querySelectorAll("[data-card-alice]").forEach((el) => {
      const speakerId = el.getAttribute("data-card-alice");
      const speaker = (this._data.speakers || []).find(
        (item) => item.id === speakerId
      );
      const entity = speaker ? this._hass.states[speaker.entity_id] : null;
      const info = this._aliceInfo((entity || {}).attributes || {});
      el.className = `alice-live card-alice ${info.state.toLowerCase()}`;
      const label = el.querySelector("[data-card-alice-label]");
      const next = `Алиса · ${info.label}`;
      if (label && label.textContent !== next) label.textContent = next;
    });
    this._syncExtras();
    const active = this._activeVideo();
    const modeKey = active
      ? `${active.speaker.id}|${active.info.videoId}|${active.info.title}`
      : "";
    const modeChanged =
      Boolean(this._fullPlayer) && modeKey !== this._videoModeKey;
    this._videoModeKey = modeKey;
    this._updateMiniPlayer();
    if (modeChanged) {
      this._render();
      return;
    }
    if (restartTicker) this._startTicker();
  }

  _syncExtras() {
    const root = this.shadowRoot;
    if (!root || !this._hass) return;
    root.querySelectorAll("[data-source-select]").forEach((button) => {
      const state = this._hass.states[button.getAttribute("data-entity")];
      const source = state?.attributes?.source;
      if (!source) return;
      button.classList.toggle(
        "active",
        source === button.getAttribute("data-source")
      );
    });
    root.querySelectorAll("[data-led-auto]").forEach((button) => {
      const autoEntity = button.getAttribute("data-auto-entity");
      const state = autoEntity ? this._hass.states[autoEntity] : null;
      if (!state) return;
      const active = state.state === "on";
      button.classList.toggle("active", active);
      const label = button.querySelector("b");
      if (label) label.textContent = active ? "вкл" : "выкл";
    });
  }

  _renderViz(playing) {
    const bars = (count) =>
      Array.from(
        { length: count },
        (_, i) =>
          `<span style="--i:${i};--h:${16 + ((i * 37) % 78)}%"></span>`
      ).join("");
    switch (this._viz) {
      case "wave":
        return `<div class="viz viz-wave-line"><svg viewBox="0 0 300 80" preserveAspectRatio="none">
          <path class="wave-a" d="M0,40 C25,6 50,6 75,40 S125,74 150,40 S200,6 225,40 S275,74 300,40"/>
          <path class="wave-b" d="M0,40 C25,74 50,74 75,40 S125,6 150,40 S200,74 225,40 S275,6 300,40"/>
        </svg></div>`;
      case "orbit":
        return `<div class="viz viz-orbit"><i></i><i></i><i></i><b></b></div>`;
      case "dots":
        return `<div class="viz viz-dots">${Array.from(
          { length: 60 },
          (_, i) =>
            `<span style="--i:${i};--d:${(i % 12) * 0.06}s"></span>`
        ).join("")}</div>`;
      case "pulse":
        return `<div class="viz viz-ekg"><svg viewBox="0 0 300 80" preserveAspectRatio="none">
          <path d="M0,40 L70,40 L82,18 L94,62 L106,40 L150,40 L162,28 L174,52 L186,40 L300,40"/>
        </svg></div>`;
      case "spectrum":
        return `<div class="viz viz-radial"><div class="radial-ring">${Array.from(
          { length: 36 },
          (_, i) =>
            `<span style="--i:${i};--rot:${i * 10}deg;--h:${
              20 + ((i * 37) % 60)
            }"></span>`
        ).join("")}</div><b></b></div>`;
      case "mirror":
        return `<div class="viz viz-tunnel">${[0, 1, 2, 3]
          .map(
            (row) =>
              `<div class="tunnel-row" style="--row:${row}">${Array.from(
                { length: 16 },
                (_, i) =>
                  `<span style="--i:${i};--h:${
                    40 + ((i * 37) % 50)
                  }%"></span>`
              ).join("")}</div>`
          )
          .join("")}</div>`;
      case "rings":
        return `<div class="viz viz-rings"><i></i><i></i><i></i><b></b></div>`;
      case "rain":
        return `<div class="viz viz-rain">${Array.from(
          { length: 20 },
          (_, i) =>
            `<span style="--i:${i};--x:${(i * 47) % 100}%;--d:${
              (i % 7) * 0.18
            }s"></span>`
        ).join("")}</div>`;
      case "blocks":
        return `<div class="viz viz-blocks">${Array.from(
          { length: 48 },
          (_, i) =>
            `<span style="--i:${i};--h:${
              30 + ((i * 31) % 60)
            }%;--d:${(i % 8) * 0.07}s"></span>`
        ).join("")}</div>`;
      default:
        return `<div class="viz viz-bars">${bars(42)}</div>`;
    }
  }

  _currentPosition(entity) {
    if (!entity) return 0;
    const attrs = entity.attributes || {};
    const duration = Number(attrs.media_duration) || 0;
    const base = Number(attrs.media_position) || 0;
    if (entity.state !== "playing") {
      return Math.min(base, duration || base);
    }
    const updated = attrs.media_position_updated_at;
    const ts = updated ? new Date(updated).getTime() : 0;
    const elapsed = ts ? Math.max(0, (Date.now() - ts) / 1000) : 0;
    return Math.min(duration || base + elapsed, base + elapsed);
  }

  _formatTime(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  _trackInfo(trackId) {
    const cached = this._trackCache[trackId];
    if (cached) return cached;
    this._trackCache[trackId] = { loading: true };
    this._hass
      .callWS({ type: "yahome_hub/track_info", track_id: trackId })
      .then((info) => {
        this._trackCache[trackId] = info || {};
        if (this._tab === "speakers") this._updatePlayerDom();
      })
      .catch(() => {
        this._trackCache[trackId] = {};
      });
    return this._trackCache[trackId];
  }

  _eqLabel(value) {
    const labels = {
      off: "Выкл",
      lessbass: "Меньше баса",
      movie: "Кино",
      voice: "Голос",
      custom: "Свой",
      pop: "Поп",
      hiphop: "Хип-хоп",
      dance: "Танцы",
      rock: "Рок",
      electro: "Электро",
      metal: "Металл",
      rnb: "R&B",
      classic: "Классика",
      acoustics: "Акустика",
      jazz: "Джаз",
      concert: "Концерт",
      party: "Вечеринка",
      morebass: "Больше баса",
      morehigh: "Больше высоких",
      morebasshigh: "Басы + верх",
      lesshigh: "Меньше высоких",
    };
    return labels[value] || value;
  }

  _trackBpm(entity) {
    const trackId = String(entity?.attributes?.media_content_id || "");
    const info = /^\d+$/.test(trackId) ? this._trackInfo(trackId) : null;
    const direct = Number(
      info?.bpm || info?.tempo || info?.beats_per_minute || 0
    );
    if (Number.isFinite(direct) && direct >= 50 && direct <= 200) {
      return Math.round(direct);
    }
    if (!trackId) return 120;
    let hash = 0;
    for (let i = 0; i < trackId.length; i += 1) {
      hash = (hash * 31 + trackId.charCodeAt(i)) >>> 0;
    }
    const tempos = [96, 100, 104, 108, 112, 116, 120, 124, 128, 132];
    return tempos[hash % tempos.length];
  }

  _startBeatClock() {
    if (this._beatTimer) return;
    const tick = () => {
      const timestamp = performance.now();
      const root = this.shadowRoot;
      if (!root || !this._hass) return;
      const players = root.querySelectorAll(".player[data-player-entity]");
      if (!players.length) return;
      players.forEach((player) => {
        const entityId = player.getAttribute("data-player-entity");
        const entity = this._hass.states[entityId];
        if (!entity) return;
        const bpm = this._trackBpm(entity);
        const beatDuration = 60 / bpm;
        const playing = entity.state === "playing";
        const now = timestamp / 1000;
        const trackId = String(entity.attributes.media_content_id || "");
        const position = Math.max(0, this._currentPosition(entity));
        let anchor = this._beatAnchors[entityId];
        let beat = 0;
        if (playing) {
          if (
            !anchor ||
            anchor.trackId !== trackId ||
            anchor.position === null
          ) {
            anchor = {
              trackId,
              start: now,
              position,
              updated: now,
            };
            this._beatAnchors[entityId] = anchor;
          }
          const expected = anchor.position + (now - anchor.start);
          const updated = entity.attributes.media_position_updated_at;
          const updatedAt = updated ? new Date(updated).getTime() : 0;
          const stale = !updatedAt || Date.now() - updatedAt > 8000;
          const duration = Number(entity.attributes.media_duration) || 0;
          const atEnd = duration > 0 && position >= duration - 1;
          if (!stale && !atEnd && Math.abs(expected - position) > 3) {
            anchor.start = now;
            anchor.position = position;
          }
          beat = (anchor.position + (now - anchor.start)) / beatDuration;
        } else {
          delete this._beatAnchors[entityId];
        }
        const phase = playing ? beat % 1 : 0;
        const pulse = playing ? Math.pow(1 - phase, 2.2) : 0;
        const bar = playing ? Math.floor(beat) % 4 : -1;
        player.style.setProperty("--beat-dur", `${beatDuration.toFixed(3)}s`);
        player.style.setProperty("--beat", pulse.toFixed(3));
        player.style.setProperty("--beat-phase", phase.toFixed(3));
        player.style.setProperty("--beat-bpm", String(bpm));
        player.classList.toggle(
          "beat-accent",
          playing && bar === 0 && phase < 0.2
        );
        if (timestamp - this._beatLastLabel > 260) {
          player.querySelectorAll("[data-bpm-label]").forEach((label) => {
            const text = `${bpm} BPM`;
            if (label.textContent !== text) label.textContent = text;
          });
          player.querySelectorAll("[data-beat-dot]").forEach((dot) => {
            dot.style.opacity = playing
              ? String(0.35 + pulse * 0.65)
              : "0.25";
            dot.style.transform = `scale(${1 + pulse * 0.55})`;
          });
        }
      });
      if (timestamp - this._beatLastLabel > 260) {
        this._beatLastLabel = timestamp;
      }
    };
    this._beatTimer = setInterval(tick, 50);
    tick();
  }

  _startSensorPolling() {
    if (this._sensorTimer) return;
    this._sensorTimer = setInterval(() => this._pollSensors(), 5000);
  }

  async _pollSensors() {
    if (this._sensorBusy || !this._hass) return;
    this._sensorBusy = true;
    try {
      const data = await this._hass.callWS({
        type: "yahome_hub/sensor_values",
      });
      if (!data || !Array.isArray(data.devices)) return;
      this._data = data;
      this._patchSensorDom();
      this._patchHealthDom();
    } catch (err) {
      /* silent: the interface must not jump on a failed poll */
    } finally {
      this._sensorBusy = false;
    }
  }

  _patchSensorDom() {
    const root = this.shadowRoot;
    const data = this._data;
    if (!root || !data) return;
    const devices = new Map(
      (data.devices || []).map((device) => [device.id, device])
    );
    root.querySelectorAll("[data-prop-device]").forEach((el) => {
      const device = devices.get(el.getAttribute("data-prop-device"));
      if (!device) return;
      const prop = (device.properties || []).find(
        (item) => item.instance === el.getAttribute("data-prop-instance")
      );
      if (!prop) return;
      const text = `${prop.value ?? "—"}${prop.unit ? " " + prop.unit : ""}`;
      if (el.textContent !== text) el.textContent = text;
    });
    root.querySelectorAll("[data-state-device]").forEach((el) => {
      const device = devices.get(el.getAttribute("data-state-device"));
      if (!device) return;
      const text = this._stateText(device);
      if (el.textContent !== text) el.textContent = text;
    });
    root.querySelectorAll("[data-card-field]").forEach((el) => {
      const device = devices.get(el.getAttribute("data-card-device"));
      if (!device) return;
      const reading = this._resolveCardReading(
        device,
        el.getAttribute("data-card-field") || ""
      );
      const sample = el.querySelector("b");
      if (reading && sample && sample.textContent !== reading.text) {
        sample.textContent = reading.text;
      }
    });
    root.querySelectorAll("[data-card-reading-device]").forEach((el) => {
      const device = devices.get(el.getAttribute("data-card-reading-device"));
      if (!device) return;
      const token = el.getAttribute("data-card-reading-token") || "";
      const reading = this._resolveCardReading(device, token);
      if (!reading) return;
      const input = el.querySelector("[data-reading-input]");
      if (input && root.activeElement !== input) {
        const value = Math.max(
          Number(reading.cap.min ?? 0),
          Math.min(Number(reading.cap.max ?? 100), Number(reading.cap.value))
        );
        if (Number(input.value) !== value) input.value = value;
        const label = el.querySelector("[data-reading-value]");
        if (label) {
          label.textContent = `${Math.round(value)}${
            reading.cap.unit || "%"
          }`;
        }
        return;
      }
      const label = el.querySelector("[data-reading-value]");
      if (label && reading.text !== label.textContent) {
        label.textContent = reading.text;
      }
    });
  }

  _patchHealthDom() {
    const root = this.shadowRoot;
    const health = this._data?.health;
    if (!root || !health) return;
    const card = root.querySelector(".health-card");
    if (!card) return;
    const holder = document.createElement("div");
    holder.innerHTML = this._renderHealth({ health });
    const next = holder.firstElementChild;
    if (next) card.replaceWith(next);
  }

  _cardReadingTokens(device) {
    const stored = this._cardFields[device.id];
    if (Array.isArray(stored)) return stored;
    const tokens = [];
    const brightness = (device.capabilities || []).find(
      (cap) =>
        cap.kind === "range" &&
        ["brightness", "brightness_percent"].includes(cap.instance)
    );
    if (brightness) {
      tokens.push(`cap:${brightness.instance}`);
    } else {
      const temperature = (device.capabilities || []).find(
        (cap) =>
          cap.kind === "range" &&
          ["temperature", "target_temperature"].includes(cap.instance)
      );
      if (temperature) tokens.push(`cap:${temperature.instance}`);
    }
    const prop = (device.properties || []).find(
      (item) => item.instance && item.value !== undefined
    );
    if (prop) tokens.push(`prop:${prop.instance}`);
    return tokens.slice(0, 2);
  }

  _resolveCardReading(device, token) {
    if (!token) return null;
    const [kind, instance] = token.split(":", 2);
    if (kind === "prop") {
      const prop = (device.properties || []).find(
        (item) => item.instance === instance
      );
      if (!prop) return null;
      return {
        token,
        kind: "prop",
        icon: this._propIcon(prop.instance),
        label: prop.name || instance,
        text: `${prop.value ?? "—"}${prop.unit ? " " + prop.unit : ""}`,
      };
    }
    if (kind === "cap") {
      const cap = (device.capabilities || []).find(
        (item) => item.kind === "range" && item.instance === instance
      );
      if (!cap) return null;
      const value = Number(cap.value ?? cap.min ?? 0);
      return {
        token,
        kind: "cap",
        cap,
        icon: cap.instance?.includes("brightness")
          ? "mdi:brightness-6"
          : cap.instance?.includes("temperature")
          ? "mdi:thermometer"
          : "mdi:tune",
        label: cap.name || instance,
        text: `${Math.round(value)}${cap.unit || ""}`,
      };
    }
    return null;
  }

  _renderCardReadings(device) {
    const tokens = this._cardReadingTokens(device);
    const readings = tokens
      .map((token) => this._resolveCardReading(device, token))
      .filter(Boolean);
    if (!readings.length) {
      return `<div class="card-readings" data-empty="1"></div>`;
    }
    const visible = readings.slice(0, 2);
    const hidden = readings.length - visible.length;
    return `<div class="card-readings">${visible
      .map((reading) => {
        if (
          reading.kind === "cap" &&
          ["brightness", "brightness_percent"].includes(
            reading.cap.instance
          )
        ) {
          const cap = reading.cap;
          const value = Math.max(
            Number(cap.min ?? 0),
            Math.min(Number(cap.max ?? 100), Number(cap.value ?? cap.min ?? 0))
          );
          return `<div class="mini-slider" data-card-reading-device="${
            device.id
          }" data-card-reading-token="${this._esc(reading.token)}">
            <ha-icon icon="mdi:brightness-6"></ha-icon>
            <input type="range" min="${cap.min ?? 0}" max="${
            cap.max ?? 100
          }" step="${cap.step || 1}" value="${value}" data-mini-brightness="${
            device.id
          }" data-mini-type="${this._esc(
            cap.type
          )}" data-mini-instance="${this._esc(
            cap.instance
          )}" data-mini-unit="${this._esc(
            cap.unit || ""
          )}" data-reading-input />
            <span data-reading-value>${Math.round(value)}${
            cap.unit || "%"
          }</span>
          </div>`;
        }
        return `<span class="mini-chip" data-card-reading-device="${
          device.id
        }" data-card-reading-token="${this._esc(reading.token)}">
          <ha-icon icon="${reading.icon}"></ha-icon>
          <b data-reading-value>${this._esc(reading.text)}</b>
        </span>`;
      })
      .join("")}${
      hidden > 0
        ? `<span class="reading-more" title="Ещё показаний: ${hidden}">+${hidden}</span>`
        : ""
    }</div>`;
  }

  _renderCardFieldPicker(device) {
    const options = [];
    for (const prop of device.properties || []) {
      if (!prop.instance) continue;
      options.push({
        token: `prop:${prop.instance}`,
        label: prop.name || prop.instance,
        sample: `${prop.value ?? "—"}${prop.unit ? " " + prop.unit : ""}`,
        icon: this._propIcon(prop.instance),
      });
    }
    for (const cap of device.capabilities || []) {
      if (cap.kind !== "range" || !cap.instance) continue;
      options.push({
        token: `cap:${cap.instance}`,
        label: cap.name || cap.instance,
        sample: `${cap.value ?? "—"}${cap.unit ? " " + cap.unit : ""}`,
        icon: cap.instance.includes("brightness")
          ? "mdi:brightness-6"
          : cap.instance.includes("temperature")
          ? "mdi:thermometer"
          : "mdi:tune",
      });
    }
    if (!options.length) return "";
    const selected = new Set(this._cardReadingTokens(device));
    return `<div class="section card-fields-section">
      <h3>Показания на карточке</h3>
      <p class="muted">Выберите, что видно в маленькой карточке. Большая карточка останется подробной.</p>
      <div class="card-field-picker">${options
        .map(
          (option) =>
            `<button class="card-field ${
              selected.has(option.token) ? "active" : ""
            }" data-card-field="${this._esc(option.token)}" data-card-device="${
              device.id
            }" title="${this._esc(option.label)}">
              <ha-icon icon="${option.icon}"></ha-icon>
              <span>${this._esc(option.label)}</span>
              <b>${this._esc(option.sample)}</b>
            </button>`
        )
        .join("")}</div>
    </div>`;
  }

  _startTicker() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
    if (
      (this._tab !== "speakers" &&
        this._tab !== "devices" &&
        !this._fullPlayer) ||
      !this._data
    ) {
      return;
    }
    this._ticker = setInterval(() => this._tick(), 100);
  }

  _tick() {
    const root = this.shadowRoot;
    if (!root || !this._hass) return;
    this._tickCount += 1;
    if (this._tickCount % 8 === 0) this._updatePlayerDom(false);
    root.querySelectorAll("[data-seek-entity]").forEach((input) => {
      const entityId = input.getAttribute("data-seek-entity");
      const entity = this._hass.states[entityId];
      if (!entity) return;
      const duration = Number(entity.attributes.media_duration) || 0;
      const position = this._currentPosition(entity);
      input.max = duration;
      input.disabled = !duration;
      if (root.activeElement !== input) {
        const next = Math.min(position, duration || position);
        if (Math.abs(Number(input.value) - next) > 0.15) input.value = next;
      }
      const label = root.querySelector(
        `[data-current-for="${entityId}"]`
      );
      const text = this._formatTime(position);
      if (label && label.textContent !== text) label.textContent = text;
    });
    this._updateLyricsOnly();
  }

  _updateLyricsOnly() {
    const root = this.shadowRoot;
    if (!root || !this._fullPlayer || !this._data) return;
    const player = root.querySelector(".player.full");
    if (!player || !this._showLyrics) return;
    const speaker = (this._data.speakers || []).find(
      (item) => item.id === this._fullPlayer
    );
    if (!speaker || !speaker.entity_id) return;
    const entity = this._hass.states[speaker.entity_id];
    if (!entity) return;
    const lyrics = this._lyricsFor(speaker);
    const line = this._lyricLines(
      lyrics,
      this._currentPosition(entity) + this._lyricsOffset
    );
    this._setLyricText(player.querySelector("[data-lyrics-prev]"), line.prev);
    this._setLyricText(
      player.querySelector("[data-lyrics-current]"),
      line.current
    );
    this._setLyricText(player.querySelector("[data-lyrics-next]"), line.next);
    const countdown = player.querySelector("[data-lyrics-countdown]");
    if (countdown) countdown.textContent = this._formatCountdown(line.remaining);
  }

  _musicEntity(targetId) {
    return (
      this._musicSpeakers().find((speaker) => speaker.id === targetId)
        ?.entity_id || ""
    );
  }

  _onMusicAction(event) {
    const el = event.target.closest("[data-music-action]");
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    const action = el.getAttribute("data-music-action");
    const hub = el.closest("[data-music-hub]");
    const targetId =
      el.getAttribute("data-target-id") ||
      hub?.getAttribute("data-music-hub") ||
      this._musicTargetId();
    if (!targetId) return;
    const entityId =
      el.getAttribute("data-target-entity") || this._musicEntity(targetId);
    if (action === "search") {
      const input = hub?.querySelector("[data-music-query]");
      this._searchMusic(targetId, entityId, input?.value || "");
      return;
    }
    if (action === "tab") {
      this._musicTab = el.getAttribute("data-music-tab");
      this._musicError = null;
      this._musicNotice = null;
      if (this._musicTab === "likes" && !this._musicLikes.length) {
        this._loadLikes(targetId);
        return;
      }
      if (
        this._musicTab === "playlists" &&
        !this._musicPlaylists.length
      ) {
        this._loadPlaylists(targetId);
        return;
      }
      if (this._musicTab === "queue") {
        this._refreshQueue(targetId);
        return;
      }
      this._renderMusicHubDom(targetId);
      return;
    }
    if (action === "load-likes") {
      this._loadLikes(targetId);
      return;
    }
    if (action === "load-playlists") {
      this._loadPlaylists(targetId);
      return;
    }
    if (action === "open-playlist") {
      this._openPlaylist(targetId, el.getAttribute("data-kind"));
      return;
    }
    if (action === "back-playlists") {
      this._musicPlaylist = null;
      this._musicPlaylistTracks = [];
      this._musicTab = "playlists";
      this._renderMusicHubDom(targetId);
      return;
    }
    if (action === "play") {
      this._playTrackFromList(el, targetId, entityId);
      return;
    }
    if (action === "add") {
      this._addTrackToQueue(el, targetId, entityId);
      return;
    }
    if (action === "play-queue") {
      const queue = this._musicQueues[targetId] || {
        tracks: [],
        index: -1,
      };
      this._queueAction("music_queue_play", targetId, entityId, {
        index: Math.max(0, queue.index || 0),
      });
      return;
    }
    if (action === "play-queue-index") {
      this._queueAction("music_queue_play", targetId, entityId, {
        index: Number(el.getAttribute("data-track-index") || 0),
      });
      return;
    }
    if (action === "remove-queue") {
      this._queueAction("music_queue_remove", targetId, entityId, {
        index: Number(el.getAttribute("data-track-index") || 0),
      });
      return;
    }
    if (action === "clear-queue") {
      this._queueAction("music_queue_clear", targetId, entityId, {});
      return;
    }
    if (action === "next" || action === "prev") {
      this._queueAction("music_next", targetId, entityId, {
        delta: action === "next" ? 1 : -1,
      });
      return;
    }
    if (action === "skin") {
      this._playerSkin = Number(el.getAttribute("data-skin")) || 2;
      try {
        localStorage.setItem(
          "yahome-hub-player-skin",
          String(this._playerSkin)
        );
      } catch (err) {
        /* ignore */
      }
      this._fullPlayer = targetId;
      this._render();
    }
  }

  _onMusicChange(event) {
    const select = event.target.closest("[data-music-target-select]");
    if (!select) return;
    this._musicTarget = select.value;
    this._musicTab = "search";
    this._musicPlaylist = null;
    this._render();
  }

  _onMusicKeydown(event) {
    if (event.key !== "Enter") return;
    const input = event.target.closest("[data-music-query]");
    if (!input) return;
    event.preventDefault();
    const hub = input.closest("[data-music-hub]");
    const targetId =
      hub?.getAttribute("data-music-hub") || this._musicTargetId();
    if (targetId) {
      this._searchMusic(
        targetId,
        this._musicEntity(targetId),
        input.value.trim()
      );
    }
  }

  async _searchMusic(targetId, entityId, query) {
    const value = String(query || "").trim();
    if (!value) return;
    this._musicQuery = value;
    this._musicError = null;
    this._musicNotice = null;
    if (/^https?:\/\//i.test(value)) {
      this._musicNotice = "Отправляю ссылку на колонку...";
      this._renderMusicHubDom(targetId);
      try {
        await this._hass.callService("media_player", "play_media", {
          entity_id: entityId,
          media_content_id: value,
          media_content_type: "music",
        });
        this._musicNotice = "Ссылка отправлена на колонку";
      } catch (err) {
        this._musicError = this._message(err);
      }
      this._renderMusicHubDom(targetId);
      return;
    }
    this._musicLoading = true;
    this._renderMusicHubDom(targetId);
    try {
      const result = await this._hass.callWS({
        type: "yahome_hub/music_search",
        query: value,
      });
      this._musicResults = result?.tracks || [];
      this._cacheTracks(this._musicResults);
      this._musicTab = "search";
      this._musicNotice = this._musicResults.length
        ? `Найдено: ${this._musicResults.length}`
        : "Ничего не найдено";
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._musicLoading = false;
    this._renderMusicHubDom(targetId);
  }

  async _loadLikes(targetId) {
    this._musicLoading = true;
    this._musicError = null;
    this._musicNotice = null;
    this._renderMusicHubDom(targetId);
    try {
      const result = await this._hass.callWS({
        type: "yahome_hub/music_likes",
      });
      this._musicLikes = result?.tracks || [];
      this._cacheTracks(this._musicLikes);
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._musicLoading = false;
    this._renderMusicHubDom(targetId);
  }

  async _loadPlaylists(targetId) {
    this._musicLoading = true;
    this._musicError = null;
    this._musicNotice = null;
    this._renderMusicHubDom(targetId);
    try {
      const result = await this._hass.callWS({
        type: "yahome_hub/music_playlists",
      });
      this._musicPlaylists = result?.playlists || [];
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._musicLoading = false;
    this._renderMusicHubDom(targetId);
  }

  async _openPlaylist(targetId, kind) {
    this._musicLoading = true;
    this._musicError = null;
    this._musicNotice = null;
    this._renderMusicHubDom(targetId);
    try {
      const result = await this._hass.callWS({
        type: "yahome_hub/music_playlist",
        kind,
      });
      this._musicPlaylist =
        this._musicPlaylists.find((item) => item.kind === kind) || {
          title: "Плейлист",
        };
      this._musicPlaylistTracks = result?.tracks || [];
      this._cacheTracks(this._musicPlaylistTracks);
      this._musicTab = "playlists";
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._musicLoading = false;
    this._renderMusicHubDom(targetId);
  }

  async _refreshQueue(targetId) {
    const entityId = this._musicEntity(targetId);
    if (!entityId) return;
    try {
      const queue = await this._hass.callWS({
        type: "yahome_hub/music_queue",
        entity_id: entityId,
      });
      this._musicQueues[targetId] = queue || { tracks: [], index: -1 };
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._renderMusicHubDom(targetId);
  }

  async _playTrackFromList(el, targetId, entityId) {
    const kind = el.getAttribute("data-track-kind") || "search";
    const tracks =
      kind === "likes"
        ? this._musicLikes
        : kind === "playlist"
        ? this._musicPlaylistTracks
        : this._musicResults;
    const index = Number(el.getAttribute("data-track-index") || 0);
    const track =
      this._musicTracks[el.getAttribute("data-track-id")] || tracks[index];
    if (!track || !entityId) return;
    this._musicNotice = `Включаю: ${track.title}`;
    this._musicError = null;
    this._renderMusicHubDom(targetId);
    try {
      await this._hass.callWS({
        type: "yahome_hub/music_play",
        entity_id: entityId,
        track_id: track.id,
        queue: tracks,
        index,
      });
      this._musicQueues[targetId] = { tracks, index };
      this._musicNotice = `Играет: ${track.title}`;
    } catch (err) {
      this._musicError = this._message(err);
      this._musicNotice = null;
    }
    this._renderMusicHubDom(targetId);
  }

  async _addTrackToQueue(el, targetId, entityId) {
    const track = this._musicTracks[el.getAttribute("data-track-id")];
    if (!track || !entityId) return;
    try {
      const queue = await this._hass.callWS({
        type: "yahome_hub/music_queue_add",
        entity_id: entityId,
        track,
      });
      this._musicQueues[targetId] = queue;
      this._musicNotice = `В очередь: ${track.title}`;
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._renderMusicHubDom(targetId);
  }

  async _queueAction(service, targetId, entityId, data) {
    try {
      await this._hass.callWS({
        type: `yahome_hub/${service}`,
        entity_id: entityId,
        ...data,
      });
      await this._refreshQueue(targetId);
      this._musicNotice = "Очередь обновлена";
    } catch (err) {
      this._musicError = this._message(err);
    }
    this._renderMusicHubDom(targetId);
  }

  _smoothRange(input, target, duration = 180) {
    if (!input) return;
    const token = (input._smoothToken || 0) + 1;
    input._smoothToken = token;
    const start = Number(input.value) || 0;
    if (Math.abs(start - target) < 0.5) {
      input.value = target;
      return;
    }
    const started = performance.now();
    const step = (now) => {
      if (input._smoothToken !== token) return;
      const progress = Math.min(1, (now - started) / duration);
      input.value = start + (target - start) * progress;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _formatCountdown(value) {
    if (value === null || value === undefined) return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return Math.max(0, number).toFixed(1);
  }

  _setLyricText(element, text) {
    if (!element || element.textContent === text) return;
    element.textContent = text;
    element.classList.remove("lyric-in");
    void element.offsetWidth;
    element.classList.add("lyric-in");
  }

  _setLyricsOffset(value) {
    this._lyricsOffset = Math.max(
      -5,
      Math.min(5, Math.round(Number(value) * 10) / 10)
    );
    try {
      localStorage.setItem(
        "yahome-hub-lyrics-offset",
        String(this._lyricsOffset)
      );
    } catch (err) {
      /* ignore */
    }
    const label = this.shadowRoot
      ? this.shadowRoot.querySelector("[data-lyrics-offset-label]")
      : null;
    if (label) label.textContent = `${this._lyricsOffset.toFixed(1)} с`;
    if (this._hass) {
      this._hass
        .callWS({
          type: "yahome_hub/lyrics_offset",
          offset: this._lyricsOffset,
        })
        .catch(() => {});
    }
    this._updatePlayerDom();
  }

  async _callService(domain, service, data) {
    if (!this._hass) return;
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this._showToast("Ошибка команды: " + this._message(err));
    }
  }

  _onVideoAction(event) {
    const haClose = event.target.closest("[data-ha-video-close]");
    if (haClose) {
      this._haVideo = null;
      this._render();
      return;
    }
    const haOpen = event.target.closest("[data-ha-video]");
    if (haOpen) {
      this._openHaVideo(haOpen.getAttribute("data-ha-video"));
      return;
    }
    const closeVideo = event.target.closest("[data-video-close]");
    if (closeVideo) {
      this._closeVideo(closeVideo.getAttribute("data-video-close"));
      return;
    }
    const open = event.target.closest("[data-video-open]");
    if (open) {
      event.preventDefault();
      window.open(open.getAttribute("data-video-open"), "_blank", "noopener");
      return;
    }
    const close = event.target.closest("[data-mini-close]");
    if (close) {
      this._miniPlayerClosed = true;
      this._updateMiniPlayer();
      return;
    }
    const mini = event.target.closest("[data-mini-open]");
    if (mini) {
      const speakerId = mini.getAttribute("data-mini-open");
      if (speakerId) {
        this._fullPlayer = speakerId;
        this._showLyrics = false;
        this._miniPlayerClosed = false;
        this._render();
      }
      return;
    }
    const play = event.target.closest("[data-video-play]");
    if (play) {
      this._playVideo(play);
    }
  }

  async _closeVideo(speakerId) {
    if (!this._hass || !speakerId) return;
    try {
      await this._hass.callWS({
        type: "yahome_hub/video_close",
        speaker_id: speakerId,
      });
      this._miniPlayerClosed = true;
      this._showToast("Видео закрыто");
      this._render();
      setTimeout(() => {
        this._load(true);
        this._render();
      }, 700);
    } catch (err) {
      this._showToast("Ошибка: " + this._message(err));
    }
  }

  async _playVideo(button) {
    if (!this._hass) return;
    const speakerId = button.getAttribute("data-video-play");
    const entityId = button.getAttribute("data-entity");
    const hub = button.closest(".video-hub") || this.shadowRoot;
    const input = hub.querySelector(`[data-video-url="${speakerId}"]`);
    const status = hub.querySelector(`[data-video-status="${speakerId}"]`);
    const value = input ? input.value.trim() : "";
    if (!value) {
      if (status) status.textContent = "Вставьте ссылку на видео";
      if (input) input.focus();
      return;
    }
    if (status) status.textContent = "Отправляю на колонку…";
    button.disabled = true;
    try {
      await this._hass.callService("media_player", "play_media", {
        entity_id: entityId,
        media_content_id: value,
        media_content_type: "video",
      });
      if (status) {
        status.textContent =
          "Видео отправлено. Загрузка может занять несколько секунд.";
      }
      if (input) input.value = "";
      this._miniPlayerClosed = false;
    } catch (err) {
      if (status) status.textContent = "Ошибка: " + this._message(err);
    } finally {
      button.disabled = false;
    }
  }

  _attachEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    this._attachStreamEvents();
    root.addEventListener("click", (event) => this._onVideoAction(event));
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const input = event.target.closest("[data-video-url]");
      if (!input) return;
      event.preventDefault();
      const hub = input.closest(".video-hub");
      const target = hub
        ? hub.querySelector(
            `[data-video-play="${input.getAttribute("data-video-url")}"]`
          )
        : null;
      if (target) this._playVideo(target);
    });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this._haVideo) {
        this._haVideo = null;
        this._render();
      }
    });
    root.addEventListener("click", (event) => this._onMusicAction(event));
    root.addEventListener("click", (event) => {
      if (!event.target.closest("[data-card-shell]")) {
        this._closeCardSwipes(null);
      }
    });
    root.addEventListener("change", (event) => this._onMusicChange(event));
    root.addEventListener("keydown", (event) => this._onMusicKeydown(event));
    root.querySelectorAll("[data-open-player]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this._fullPlayer = el.getAttribute("data-open-player");
        this._showLyrics = true;
        this._render();
      });
    });
    root.querySelectorAll("[data-speaker-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        this._speakerTab = el.getAttribute("data-speaker-tab");
        try {
          localStorage.setItem("yahome-hub-speaker-tab", this._speakerTab);
        } catch (err) {
          /* ignore */
        }
        this._render();
      });
    });
    root.querySelectorAll("[data-diag-refresh]").forEach((el) => {
      el.addEventListener("click", () => {
        const speakerId = el.getAttribute("data-diag-refresh");
        delete this._diagnostics[speakerId];
        this._render();
      });
    });
    root.querySelectorAll("[data-settings-refresh]").forEach((el) => {
      el.addEventListener("click", () => {
        const speakerId = el.getAttribute("data-settings-refresh");
        delete this._diagnostics[speakerId];
        this._render();
      });
    });
    root.querySelectorAll("[data-quality-value]").forEach((el) => {
      el.addEventListener("click", async () => {
        const speakerId = el.getAttribute("data-quality-speaker");
        const value = el.getAttribute("data-quality-value");
        root
          .querySelectorAll(`[data-quality-group="${speakerId}"] button`)
          .forEach((button) => {
            button.classList.toggle(
              "active",
              button.getAttribute("data-quality-value") === value
            );
          });
        const speaker = (this._data?.speakers || []).find(
          (item) => item.id === speakerId
        );
        if (speaker) speaker.music_quality = value;
        this._mergeLocalDiag(speakerId, {
          audio_player: { music_quality: value },
        });
        await this._setSpeakerConfig(speakerId, {
          audio_player: { music_quality: value },
        });
      });
    });
    root.querySelectorAll("[data-test-config]").forEach((el) => {
      el.addEventListener("change", async () => {
        const speakerId = el.getAttribute("data-test-config");
        const path = el.getAttribute("data-test-path");
        const kind = el.getAttribute("data-test-kind");
        let value =
          el.type === "checkbox"
            ? el.checked
            : kind === "number"
            ? Number(el.value)
            : el.value;
        if (el.type === "checkbox") {
          const label = el
            .closest(".test-switch, .settings-switch")
            ?.querySelector("b");
          if (label) label.textContent = value ? "вкл" : "выкл";
        }
        await this._setSpeakerConfig(speakerId, this._pathPatch(path, value));
      });
    });
    root.querySelectorAll("[data-test-time]").forEach((el) => {
      el.addEventListener("change", async () => {
        const speakerId = el.getAttribute("data-test-time");
        const path = el.getAttribute("data-test-path");
        const value = this._normalizeTime(
          el.value,
          el.getAttribute("data-test-current")
        );
        await this._setSpeakerConfig(speakerId, this._pathPatch(path, value));
      });
    });
    root.querySelectorAll("[data-test-timezone-save]").forEach((el) => {
      el.addEventListener("click", async () => {
        const speakerId = el.getAttribute("data-test-timezone-save");
        const input = root.querySelector(
          `[data-test-timezone="${speakerId}"]`
        );
        if (!input) return;
        await this._setSpeakerConfig(
          speakerId,
          this._pathPatch("timezone.timezone_name", input.value.trim())
        );
      });
    });
    root.querySelectorAll("[data-test-location-save]").forEach((el) => {
      el.addEventListener("click", async () => {
        const speakerId = el.getAttribute("data-test-location-save");
        const lat = root.querySelector(`[data-test-lat="${speakerId}"]`);
        const lon = root.querySelector(`[data-test-lon="${speakerId}"]`);
        if (!lat || !lon) return;
        await this._setSpeakerConfig(speakerId, {
          location: {
            latitude: Number(lat.value),
            longitude: Number(lon.value),
          },
        });
      });
    });
    root.querySelectorAll("[data-test-stop]").forEach((el) => {
      el.addEventListener("click", async () => {
        const entityId = el.getAttribute("data-test-stop");
        if (!entityId) return;
        try {
          await this._hass.callService("media_player", "media_stop", {
            entity_id: entityId,
          });
          this._showToast("Команда «Стоп» отправлена");
        } catch (err) {
          this._showToast("Ошибка: " + this._message(err));
        }
      });
    });
    root.querySelectorAll("[data-test-track]").forEach((el) => {
      el.addEventListener("click", async () => {
        const entityId = el.getAttribute("data-test-entity");
        const action = el.getAttribute("data-test-track");
        if (!entityId) return;
        try {
          await this._hass.callService(
            "media_player",
            action === "next" ? "media_next_track" : "media_previous_track",
            { entity_id: entityId }
          );
        } catch (err) {
          this._showToast("Ошибка: " + this._message(err));
        }
      });
    });
    root.querySelectorAll("[data-tts-send]").forEach((el) => {
      el.addEventListener("click", async () => {
        const speakerId = el.getAttribute("data-tts-send");
        const entityId = el.getAttribute("data-entity");
        const textEl = root.querySelector(`[data-tts-text="${speakerId}"]`);
        const volumeEl = root.querySelector(`[data-tts-volume="${speakerId}"]`);
        const message = textEl ? textEl.value.trim() : "";
        if (!message) return this._setControlStatus(speakerId, "Введите текст");
        this._setControlStatus(speakerId, "Отправляю...");
        try {
          await this._hass.callService("yahome_hub", "say", {
            entity_id: entityId,
            message,
            volume_level: Number(volumeEl?.value || 70) / 100,
          });
          this._setControlStatus(speakerId, "Текст отправлен на колонку");
        } catch (err) {
          this._setControlStatus(speakerId, "Ошибка: " + this._message(err));
        }
      });
    });
    root.querySelectorAll("[data-led-apply]").forEach((el) => {
      el.addEventListener("click", async () => {
        const speakerId = el.getAttribute("data-led-apply");
        const entityId = el.getAttribute("data-entity");
        const brightnessEl = root.querySelector(
          `[data-led-brightness="${speakerId}"]`
        );
        const visEl = root.querySelector(
          `[data-led-visualization="${speakerId}"]`
        );
        this._setControlStatus(speakerId, "Применяю...");
        try {
          await this._hass.callService("yahome_hub", "set_led", {
            entity_id: entityId,
            brightness: Number(brightnessEl?.value || 60) / 100,
            visualization: visEl?.value || "clock",
          });
          this._setControlStatus(speakerId, "Подсветка обновлена");
        } catch (err) {
          this._setControlStatus(speakerId, "Ошибка: " + this._message(err));
        }
      });
    });
    root.querySelectorAll("[data-more-info]").forEach((el) => {
      el.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("hass-more-info", {
            detail: { entityId: el.getAttribute("data-more-info") },
            bubbles: true,
            composed: true,
          })
        );
      });
    });
    root.querySelectorAll("[data-chat-send]").forEach((el) => {
      el.addEventListener("click", async () => {
        const speakerId = el.getAttribute("data-chat-send");
        const agentId = el.getAttribute("data-entity");
        const input = root.querySelector(`[data-chat-input="${speakerId}"]`);
        const responseEl = root.querySelector(
          `[data-chat-response="${speakerId}"]`
        );
        const text = input ? input.value.trim() : "";
        if (!text || !agentId) return;
        if (responseEl) responseEl.textContent = "Думаю...";
        try {
          const result = await this._hass.callService(
            "conversation",
            "process",
            { text, agent_id: agentId },
            undefined,
            false,
            true
          );
          const speech =
            result?.response?.response?.speech?.plain?.speech ||
            result?.response?.speech?.plain?.speech ||
            result?.response?.response?.speech?.plain?.text ||
            result?.response?.speech?.plain?.text ||
            "Готово";
          if (responseEl) responseEl.textContent = speech;
          if (input) input.value = "";
        } catch (err) {
          if (responseEl) {
            responseEl.textContent = "Ошибка: " + this._message(err);
          }
        }
      });
    });
    root.querySelectorAll("[data-music-scroll]").forEach((el) => {
      el.addEventListener("click", () => {
        const speakerId = el.getAttribute("data-music-scroll");
        const hub = root.querySelector(
          `.full-player [data-music-hub="${speakerId}"]`
        );
        if (hub) {
          hub.scrollIntoView({ behavior: "smooth", block: "center" });
          hub.querySelector("[data-music-query]")?.focus();
        }
      });
    });
    root.querySelectorAll("[data-close-player]").forEach((el) => {
      el.addEventListener("click", () => {
        this._fullPlayer = null;
        this._render();
      });
    });
    root.querySelectorAll("[data-toggle-lyrics]").forEach((el) => {
      el.addEventListener("click", () => {
        this._showLyrics = !this._showLyrics;
        this._render();
      });
    });
    root.querySelectorAll(".tabs [data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        this._tab = el.getAttribute("data-tab");
        this._selected = null;
        this._render();
      });
    });
    root.querySelectorAll("[data-hub-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        this._hubFilter = el.getAttribute("data-hub-filter");
        this._render();
      });
    });
    root.querySelectorAll("[data-viz]").forEach((el) => {
      el.addEventListener("click", () => {
        this._viz = el.getAttribute("data-viz");
        try {
          localStorage.setItem("yahome-hub-viz", this._viz);
        } catch (err) {
          /* ignore */
        }
        this._render();
      });
    });
    root.querySelectorAll("[data-player-action]").forEach((el) => {
      el.addEventListener("click", () => {
        const entityId = el.getAttribute("data-player-entity");
        const action = el.getAttribute("data-player-action");
        const state = this._hass.states[entityId];
        if (action === "playpause") {
          const service =
            state && state.state === "playing" ? "media_pause" : "media_play";
          this._callService("media_player", service, { entity_id: entityId });
        } else if (action === "previous") {
          this._callService("media_player", "media_previous_track", {
            entity_id: entityId,
          });
        } else if (action === "next") {
          this._callService("media_player", "media_next_track", {
            entity_id: entityId,
          });
        } else if (action === "stop") {
          this._callService("media_player", "media_stop", {
            entity_id: entityId,
          });
        }
      });
    });
    root.querySelectorAll("[data-player-power]").forEach((el) => {
      el.addEventListener("click", () => {
        const entityId = el.getAttribute("data-player-power");
        const state = this._hass.states[entityId];
        const service =
          state && state.state === "off" ? "turn_on" : "turn_off";
        this._callService("media_player", service, { entity_id: entityId });
      });
    });
    root.querySelectorAll("[data-seek-entity]").forEach((el) => {
      el.addEventListener("input", () => {
        const label = root.querySelector(
          `[data-current-for="${el.getAttribute("data-seek-entity")}"]`
        );
        if (label) label.textContent = this._formatTime(el.value);
      });
      el.addEventListener("change", () => {
        this._callService("media_player", "media_seek", {
          entity_id: el.getAttribute("data-seek-entity"),
          seek_position: Number(el.value),
        });
      });
    });
    root.querySelectorAll("[data-player-mute]").forEach((el) => {
      el.addEventListener("click", () => {
        const entityId = el.getAttribute("data-player-mute");
        const state = this._hass.states[entityId];
        const muted = Boolean(
          state && state.attributes && state.attributes.is_volume_muted
        );
        this._callService("media_player", "volume_mute", {
          entity_id: entityId,
          is_volume_muted: !muted,
        });
      });
    });
    root.querySelectorAll("[data-lyrics-offset]").forEach((el) => {
      el.addEventListener("click", () => {
        const delta = Number(el.getAttribute("data-lyrics-offset")) || 0;
        this._setLyricsOffset(this._lyricsOffset + delta);
      });
    });
    root.querySelectorAll("[data-music-search]").forEach((el) => {
      el.addEventListener("click", () => {
        const speakerId = el.getAttribute("data-music-search");
        const entityId = el.getAttribute("data-entity");
        const input = root.querySelector(`[data-music-query="${speakerId}"]`);
        const query = input ? input.value.trim() : "";
        if (query) this._searchMusic(speakerId, entityId, query);
      });
    });
    root.querySelectorAll("[data-shuffle]").forEach((el) => {
      el.addEventListener("click", () => {
        const entityId = el.getAttribute("data-shuffle");
        const state = this._hass.states[entityId];
        const shuffle = !(state && state.attributes && state.attributes.shuffle);
        this._callService("media_player", "shuffle_set", {
          entity_id: entityId,
          shuffle,
        });
      });
    });
    root.querySelectorAll("[data-repeat]").forEach((el) => {
      el.addEventListener("change", () => {
        this._callService("media_player", "repeat_set", {
          entity_id: el.getAttribute("data-repeat"),
          repeat: el.value,
        });
      });
    });
    root.querySelectorAll("[data-volume-entity]").forEach((el) => {
      el.addEventListener("input", () => {
        el._smoothToken = (el._smoothToken || 0) + 1;
        const label = root.querySelector(
          `[data-volume-for="${el.getAttribute("data-volume-entity")}"]`
        );
        if (label) label.textContent = `${el.value}%`;
      });
      el.addEventListener("change", () => {
        this._callService("media_player", "volume_set", {
          entity_id: el.getAttribute("data-volume-entity"),
          volume_level: Number(el.value) / 100,
        });
      });
    });
    root.querySelectorAll("[data-eq-entity]").forEach((el) => {
      el.addEventListener("change", () => {
        this._callService("select", "select_option", {
          entity_id: el.getAttribute("data-eq-entity"),
          option: el.value,
        });
      });
    });
    root.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = el.getAttribute("data-action");
        if (action === "refresh") this._refresh();
        if (action === "export") this._export();
        if (action === "back") {
          this._backToCards();
        }
      });
    });
    root.querySelectorAll("[data-room]").forEach((el) => {
      el.addEventListener("click", () => {
        this._room = el.getAttribute("data-room");
        this._render();
      });
    });
    root.querySelectorAll("[data-view-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        this._viewFilter = el.getAttribute("data-view-filter") || "all";
        this._render();
      });
    });
    root.querySelectorAll("[data-fav]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this._toggleFavorite(el.getAttribute("data-fav"));
      });
    });
    root.querySelectorAll("[data-quick]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this._openQuickSheet(el.getAttribute("data-quick"));
      });
    });
    root.querySelectorAll("[data-close-sheet]").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (
          event.target.closest(".quick-sheet") &&
          !event.target.closest(".sheet-close")
        ) {
          return;
        }
        this._quickDevice = null;
        this._render();
      });
    });
    root.querySelectorAll("[data-sheet-open]").forEach((el) => {
      el.addEventListener("click", () => {
        this._lastCardId = el.getAttribute("data-sheet-open");
        this._selected = el.getAttribute("data-sheet-open");
        this._quickDevice = null;
        this._render();
      });
    });
    root.querySelectorAll("[data-player-skin]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this._setPlayerSkin(el.getAttribute("data-player-skin"));
      });
    });
    root.querySelectorAll("[data-source-select]").forEach((el) => {
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        const entityId = el.getAttribute("data-entity");
        const source = el.getAttribute("data-source");
        try {
          await this._hass.callService("media_player", "select_source", {
            entity_id: entityId,
            source,
          });
          const group = el.parentElement;
          group
            ?.querySelectorAll("[data-source-select]")
            .forEach((item) =>
              item.classList.toggle("active", item === el)
            );
          this._showToast(
            source.startsWith("Трансляция:")
              ? "Трансляция запущена"
              : source === "HDMI"
              ? "Звук переключён на HDMI"
              : "Звук на колонке"
          );
        } catch (err) {
          this._showToast("Ошибка HDMI: " + this._message(err));
        }
      });
    });
    root.querySelectorAll("[data-led-auto]").forEach((el) => {
      el.addEventListener("click", async (event) => {
        event.stopPropagation();
        const autoEntity = el.getAttribute("data-auto-entity");
        const entityId = el.getAttribute("data-entity");
        const current = el.classList.contains("active");
        try {
          if (autoEntity) {
            await this._hass.callService(
              "switch",
              current ? "turn_off" : "turn_on",
              { entity_id: autoEntity }
            );
          } else {
            await this._hass.callService("yahome_hub", "set_led", {
              entity_id: entityId,
              auto: !current,
            });
          }
          el.classList.toggle("active", !current);
          const label = el.querySelector("b");
          if (label) label.textContent = current ? "выкл" : "вкл";
          this._showToast(
            current ? "Авто-яркость выключена" : "Авто-яркость включена"
          );
        } catch (err) {
          this._showToast("Ошибка подсветки: " + this._message(err));
        }
      });
    });
    root.querySelectorAll("[data-mini-brightness]").forEach((el) => {
      el.addEventListener("click", (event) => event.stopPropagation());
      el.addEventListener("input", () => {
        const label = el.parentElement?.querySelector("span");
        if (label) {
          label.textContent = `${el.value}${el.getAttribute("data-mini-unit") || "%"}`;
        }
      });
      el.addEventListener("change", (event) => {
        event.stopPropagation();
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-mini-brightness")
        );
        if (!device) return;
        this._action(
          device,
          {
            type: el.getAttribute("data-mini-type"),
            instance: el.getAttribute("data-mini-instance"),
          },
          Number(el.value)
        );
      });
    });
    const search = root.querySelector("#search");
    if (search) {
      search.addEventListener("input", () => {
        this._query = search.value;
        const grid = root.querySelector(".grid");
        if (grid) {
          grid.innerHTML = this._filteredDevices()
            .map((device) => this._renderCard(device))
            .join("");
          this._attachCardEvents();
        }
      });
    }
    this._attachCardEvents();
    root.querySelectorAll("[data-cap-toggle]").forEach((el) => {
      el.addEventListener("click", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-cap-toggle")
        );
        if (!device) return;
        const type = el.getAttribute("data-cap-type");
        const instance = el.getAttribute("data-cap-instance");
        const value = el.getAttribute("data-cap-value") === "true";
        this._action(device, { type, instance }, value);
      });
    });
    root.querySelectorAll("[data-range-device]").forEach((el) => {
      el.addEventListener("input", () => {
        const target = root.querySelector(
          `[data-value-for="${el.getAttribute("data-value-target")}"]`
        );
        if (target) {
          target.textContent = `${el.value} ${el.getAttribute("data-range-unit") || ""}`.trim();
        }
      });
      el.addEventListener("change", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-range-device")
        );
        if (!device) return;
        this._action(
          device,
          {
            type: el.getAttribute("data-range-type"),
            instance: el.getAttribute("data-range-instance"),
          },
          Number(el.value)
        );
      });
    });
    root.querySelectorAll("[data-select-device]").forEach((el) => {
      el.addEventListener("change", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-select-device")
        );
        if (!device) return;
        const actionInstance =
          el.getAttribute("data-select-action-instance") || "";
        this._action(
          device,
          {
            type: el.getAttribute("data-select-type"),
            instance: actionInstance,
          },
          el.value
        );
      });
    });
    root.querySelectorAll("[data-scene-device]").forEach((el) => {
      el.addEventListener("change", () => {
        if (!el.value) return;
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-scene-device")
        );
        if (!device) return;
        this._action(
          device,
          {
            type: "devices.capabilities.color_setting",
            instance: "color_scene",
          },
          el.value
        );
      });
    });
    root.querySelectorAll("[data-color-device]").forEach((el) => {
      el.addEventListener("change", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-color-device")
        );
        if (!device) return;
        this._action(
          device,
          {
            type: "devices.capabilities.color_setting",
            instance: "temperature_k",
          },
          Number(el.value)
        );
      });
    });
    root.querySelectorAll("[data-color-preset]").forEach((el) => {
      el.addEventListener("click", () => {
        this._sendColor(
          el.getAttribute("data-color-device"),
          el.getAttribute("data-color-instance"),
          el.getAttribute("data-color-preset")
        );
      });
    });
    root.querySelectorAll("[data-color-picker]").forEach((el) => {
      el.addEventListener("change", () => {
        this._sendColor(
          el.getAttribute("data-color-picker"),
          el.getAttribute("data-color-instance"),
          el.value
        );
      });
    });
    root.querySelectorAll("[data-color-scene]").forEach((el) => {
      el.addEventListener("click", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-color-scene")
        );
        if (!device) return;
        this._action(
          device,
          {
            type: "devices.capabilities.color_setting",
            instance: "color_scene",
          },
          el.getAttribute("data-scene-id")
        );
      });
    });
    root.querySelectorAll("[data-card-field]").forEach((el) => {
      el.addEventListener("click", () => {
        this._toggleCardField(
          el.getAttribute("data-card-device"),
          el.getAttribute("data-card-field")
        );
      });
    });
    root.querySelectorAll("[data-media-device]").forEach((el) => {
      el.addEventListener("click", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-media-device")
        );
        if (!device) return;
        this._action(
          device,
          {
            type: "devices.capabilities.media_playback",
            instance: el.getAttribute("data-media-action"),
          },
          true
        );
      });
    });
    root.querySelectorAll("[data-volume-device]").forEach((el) => {
      el.addEventListener("change", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-volume-device")
        );
        if (!device) return;
        this._action(
          device,
          { type: "devices.capabilities.volume", instance: "volume" },
          Number(el.value)
        );
      });
    });
    root.querySelectorAll("[data-scenario]").forEach((el) => {
      el.addEventListener("click", () => {
        this._scenario(el.getAttribute("data-scenario"));
      });
    });
  }

  _pathPatch(path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    const patch = {};
    let cursor = patch;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) cursor[part] = value;
      else {
        cursor[part] = {};
        cursor = cursor[part];
      }
    });
    return patch;
  }

  _normalizeTime(value, current) {
    if (!value) return value;
    if (/[+-]\d{4}$/.test(value)) return value;
    const offset = String(current || "").match(/[+-]\d{4}$/)?.[0] || "+0000";
    return `${value}:00${offset}`;
  }

  _mergeLocalDiag(speakerId, patch) {
    const diag = this._diagnostics[speakerId];
    if (!diag || !diag.config) return;
    const merge = (target, source) => {
      Object.entries(source || {}).forEach(([key, value]) => {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          target[key] &&
          typeof target[key] === "object"
        ) {
          merge(target[key], value);
        } else {
          target[key] = value;
        }
      });
    };
    merge(diag.config, patch);
  }

  async _setSpeakerConfig(speakerId, patch) {
    if (!this._hass || !speakerId || !patch) return;
    try {
      await this._hass.callWS({
        type: "yahome_hub/speaker_config_set",
        speaker_id: speakerId,
        config: patch,
      });
      this._mergeLocalDiag(speakerId, patch);
      this._showToast("Настройка записана");
    } catch (err) {
      this._showToast("Ошибка настройки: " + this._message(err));
    }
  }

  _sendColor(deviceId, instance, hex) {
    const device = this._data?.devices?.find((item) => item.id === deviceId);
    if (!device || !hex) return;
    const value =
      instance === "hsv" ? this._hexToHsv(hex) : this._hexToRgbInt(hex);
    this._action(
      device,
      {
        type: "devices.capabilities.color_setting",
        instance: instance || "rgb",
      },
      value
    );
  }

  _toggleCardField(deviceId, token) {
    if (!deviceId || !token) return;
    const device = this._data?.devices?.find((item) => item.id === deviceId);
    if (!device) return;
    const current = this._cardReadingTokens(device).slice();
    const index = current.indexOf(token);
    if (index >= 0) current.splice(index, 1);
    else current.push(token);
    this._cardFields[deviceId] = current;
    try {
      localStorage.setItem(
        "yahome-hub-card-fields",
        JSON.stringify(this._cardFields)
      );
    } catch (err) {
      /* ignore */
    }
    const root = this.shadowRoot;
    root?.querySelectorAll("[data-card-field]").forEach((el) => {
      if (el.getAttribute("data-card-device") !== deviceId) return;
      el.classList.toggle(
        "active",
        current.includes(el.getAttribute("data-card-field"))
      );
    });
  }

  _backToCards() {
    const cardId = this._lastCardId;
    this._selected = null;
    this._quickDevice = null;
    this._render();
    if (!cardId) return;
    const restore = () => {
      const card = this.shadowRoot?.querySelector(`[data-card="${cardId}"]`);
      if (card) card.scrollIntoView({ block: "center", behavior: "auto" });
    };
    setTimeout(restore, 40);
  }

  _toggleFavorite(deviceId) {
    if (!deviceId) return;
    if (navigator.vibrate) navigator.vibrate(10);
    const index = this._favorites.indexOf(deviceId);
    if (index >= 0) {
      this._favorites.splice(index, 1);
      this._showToast("Удалено из избранного");
    } else {
      this._favorites.push(deviceId);
      this._showToast("Добавлено в избранное");
    }
    try {
      localStorage.setItem(
        "yahome-hub-favorites",
        JSON.stringify(this._favorites)
      );
    } catch (err) {
      /* ignore */
    }
    this._render();
  }

  _openQuickSheet(deviceId) {
    this._quickDevice = deviceId;
    this._lastCardId = deviceId;
    this._render();
  }

  _setPlayerSkin(value) {
    this._playerSkin = Math.max(1, Math.min(8, Number(value) || 2));
    try {
      localStorage.setItem(
        "yahome-hub-player-skin",
        String(this._playerSkin)
      );
    } catch (err) {
      /* ignore */
    }
    this._render();
  }

  _attachCardEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-device]").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (el._suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const action = event.target.closest("button, input, select, textarea, a");
        if (
          action &&
          action !== el &&
          !action.hasAttribute("data-device")
        ) {
          return;
        }
        if (action === el && el.tagName !== "BUTTON") return;
        this._lastCardId = el.getAttribute("data-device");
        this._selected = el.getAttribute("data-device");
        this._quickDevice = null;
        this._render();
      });
    });
    root.querySelectorAll("[data-card]").forEach((el) => {
      if (el.dataset.gesturesReady === "1") return;
      el.dataset.gesturesReady = "1";
      el.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.target.closest("button, input, select, textarea, a")) return;
        const shell = el.closest("[data-card-shell]");
        if (!shell) return;
        this._closeCardSwipes(shell);
        const gesture = {
          startX: event.clientX,
          startY: event.clientY,
          shell,
          horizontal: false,
          long: false,
          timer: null,
        };
        el._gesture = gesture;
        el._suppressClick = false;
        try {
          el.setPointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
        gesture.timer = setTimeout(() => {
          if (!el._gesture || el._gesture !== gesture) return;
          gesture.long = true;
          el._suppressClick = true;
          el.style.transform = "";
          el.classList.remove("dragging");
          shell.classList.remove("swipe-left", "swipe-right");
          if (navigator.vibrate) navigator.vibrate(12);
          this._openQuickSheet(el.getAttribute("data-card"));
        }, 520);
      });
      el.addEventListener("pointermove", (event) => {
        const gesture = el._gesture;
        if (!gesture) return;
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (Math.abs(dx) > 7 || Math.abs(dy) > 7) {
          clearTimeout(gesture.timer);
        }
        if (Math.abs(dx) < Math.abs(dy) + 4) return;
        gesture.horizontal = true;
        gesture.dx = dx;
        const shift = Math.max(-108, Math.min(108, dx));
        el.classList.add("dragging");
        el.style.transform = `translateX(${shift}px)`;
        gesture.shell.classList.toggle("swipe-left", shift < -26);
        gesture.shell.classList.toggle("swipe-right", shift > 26);
        if (event.cancelable) event.preventDefault();
      });
      const finish = (event) => {
        const gesture = el._gesture;
        if (!gesture) return;
        clearTimeout(gesture.timer);
        el._gesture = null;
        try {
          el.releasePointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
        el.classList.remove("dragging");
        el.style.transform = "";
        if (gesture.long) {
          gesture.shell.classList.remove("swipe-left", "swipe-right");
          return;
        }
        const dx = event.clientX - gesture.startX;
        if (gesture.horizontal && dx > 58) {
          gesture.shell.classList.remove("swipe-left", "swipe-right");
          this._toggleFavorite(el.getAttribute("data-card"));
          el._suppressClick = true;
          setTimeout(() => {
            el._suppressClick = false;
          }, 350);
          return;
        }
        if (gesture.horizontal && dx < -52) {
          gesture.shell.classList.remove("swipe-right");
          gesture.shell.classList.add("open-left");
          el._suppressClick = true;
          setTimeout(() => {
            el._suppressClick = false;
          }, 280);
          return;
        }
        gesture.shell.classList.remove("swipe-left", "swipe-right");
        if (gesture.horizontal) {
          el._suppressClick = true;
          setTimeout(() => {
            el._suppressClick = false;
          }, 220);
        }
      };
      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", (event) => {
        const gesture = el._gesture;
        if (!gesture) return;
        clearTimeout(gesture.timer);
        el._gesture = null;
        try {
          el.releasePointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
        el.classList.remove("dragging");
        el.style.transform = "";
        gesture.shell.classList.remove("swipe-left", "swipe-right");
      });
    });
    root.querySelectorAll("[data-card-shell]").forEach((shell) => {
      shell.addEventListener("click", (event) => {
        if (!event.target.closest(".card-rail")) return;
        shell.classList.remove("open-left");
      });
    });
    root.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-toggle")
        );
        if (!device) return;
        if (navigator.vibrate) navigator.vibrate(8);
        this._action(
          device,
          { type: "devices.capabilities.on_off", instance: "on" },
          !this._isOn(device)
        );
      });
    });
  }

  _closeCardSwipes(except) {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-card-shell].open-left").forEach((shell) => {
      if (shell !== except) shell.classList.remove("open-left");
    });
  }

  _esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _styles() {
    return PANEL_STYLES;
  }
}

if (!customElements.get("yahome-hub-panel")) {
  customElements.define("yahome-hub-panel", YaHomeHubPanel);
}

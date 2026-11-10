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
    this._hubFilter = "zigbee";
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
    this._tickCount = 0;
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
    if (this._tab !== "speakers" && !this._fullPlayer) return;
    const entityId = event && event.data ? event.data.entity_id : "";
    if (
      !entityId ||
      (!entityId.startsWith("media_player.") &&
        !entityId.startsWith("select.") &&
        !entityId.startsWith("camera."))
    ) {
      return;
    }
    clearTimeout(this._stateTimer);
    this._stateTimer = setTimeout(() => this._updatePlayerDom(), 180);
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
      if (!query) return true;
      return (
        device.name.toLowerCase().includes(query) ||
        (device.type_label || "").toLowerCase().includes(query) ||
        (device.room_name || "").toLowerCase().includes(query)
      );
    });
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
        ${
          data && !selected && this._tab === "devices"
            ? this._renderScenarios(data.scenarios)
            : ""
        }
        ${this._toast ? `<div class="toast">${this._esc(this._toast)}</div>` : ""}
      </div>
      ${data && this._fullPlayer ? this._renderFullPlayer(data) : ""}
    `;
    this._attachEvents();
    this._startTicker();
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
    const cover =
      attrs.entity_picture || (trackInfo && trackInfo.cover) || image;
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
    const kicker = playing
      ? "Сейчас играет"
      : paused
      ? "Пауза"
      : entity.state === "off"
      ? "Выключена"
      : "Колонка";
    return `<article class="player full full-player skin-${skin} ${
      playing ? "playing" : ""
    } ${paused ? "paused" : ""}" data-player="${this._esc(
      speaker.id
    )}" data-player-entity="${this._esc(entityId)}" ${
      cover ? `style="--cover:url('${this._esc(cover)}')"` : ""
    }>
      <div class="full-bg"></div>
      <div class="full-shade"></div>
      <div class="full-content">
        <header class="full-header">
          <div class="full-title">
            <span class="full-kicker" data-player-kicker>${kicker}</span>
            <h2 data-player-title>${this._esc(title)}</h2>
            <p data-player-meta>${this._esc(artist)}${
      album ? ` · ${this._esc(album)}` : ""
    }</p>
          </div>
          <div class="full-actions">
            <button class="round-btn" data-toggle-lyrics title="Текст песни"><ha-icon icon="mdi:text-box-music"></ha-icon></button>
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
            <div class="player-cover big">
              ${
                cover
                  ? `<img data-player-cover src="${this._esc(
                      cover
                    )}" alt="" loading="lazy" />`
                  : `<ha-icon data-cover-fallback icon="mdi:speaker"></ha-icon>`
              }
              ${
                this._showLyrics
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
            </div>
          </div>
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
        ${this._renderMusicHub(speaker.id, true)}
      </div>
    </article>`;
  }

  _renderTabs(data) {
    const tabs = [
      ["devices", "Устройства", "mdi:home-automation", data.counts.devices],
      ["speakers", "Колонки", "mdi:speaker", data.counts.speakers],
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
          : this._renderSpeakerPlayers(data.speakers || [])
      }`;
    }
    if (this._tab === "hub") {
      return this._renderHub(data);
    }
    return this._renderDashboard(devices);
  }

  _renderHub(data) {
    const filters = [
      ["zigbee", "Zigbee", "mdi:zigbee"],
      ["meters", "Счётчики", "mdi:meter-electric"],
      ["ir", "ИК-пульты", "mdi:remote"],
    ];
    const devices = this._hubDevices(data.devices || [], this._hubFilter);
    return `
      <div class="section hub-intro">
        <div class="hub-title">
          <div class="device-icon" style="--accent:#5b6cff"><ha-icon icon="mdi:home-assistant"></ha-icon></div>
          <div>
            <h3>Яндекс хаб</h3>
            <p class="muted">Zigbee-датчики, счётчики и ИК-пульты, которые Яндекс отдаёт в аккаунт. Управление использует все доступные возможности IoT API.</p>
          </div>
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
      <div class="grid">
        ${devices.map((device) => this._renderCard(device)).join("")}
      </div>
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

  _isMeter(device) {
    return (device.properties || []).some((prop) =>
      ["energy", "power", "voltage", "current", "frequency", "water_level"].includes(
        prop.instance
      )
    );
  }

  _hubDevices(devices, kind) {
    if (kind === "meters") {
      return devices.filter((device) => this._isMeter(device));
    }
    if (kind === "ir") {
      return devices.filter(
        (device) =>
          /(^|\.)hub|remote/i.test(device.type || "") ||
          /пульт|remote/i.test(device.name || "")
      );
    }
    return devices.filter(
      (device) =>
        /sensor|hub/i.test(device.type || "") &&
        !this._isMeter(device) &&
        !/remote/i.test(device.type || "")
    );
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
            <p>Все устройства и датчики Яндекса в одном месте</p>
          </div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" data-action="refresh" title="Обновить">
            <ha-icon icon="mdi:refresh"></ha-icon>
          </button>
          <button class="icon-btn" data-action="export" title="Экспорт базы">
            <ha-icon icon="mdi:database-export"></ha-icon>
          </button>
          <button class="icon-btn" data-action="demo" title="Тест интеграций">
            <ha-icon icon="mdi:flask-outline"></ha-icon>
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
    return `
      <div class="toolbar">
        <div class="search">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input id="search" type="search" placeholder="Поиск устройства…" value="${this._esc(
            this._query
          )}" />
        </div>
        <div class="chips">
          <button class="chip ${this._room === "all" ? "active" : ""}" data-room="all">Все</button>
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

  _renderCard(device) {
    const color = this._deviceColor(device);
    const on = this._isOn(device);
    return `
      <article class="card" data-device="${this._esc(device.id)}">
        <div class="card-head">
          <div class="device-icon" style="--accent:${color}">
            <ha-icon icon="${this._esc(device.icon || "mdi:home-automation")}"></ha-icon>
          </div>
          <span class="status ${device.online ? "online" : "offline"}"></span>
        </div>
        <h3>${this._esc(device.name)}</h3>
        <p class="muted">${this._esc(device.type_label)} · ${this._esc(
          device.room_name || "Без комнаты"
        )}</p>
        <div class="card-foot">
          <span class="state">${this._esc(this._stateText(device))}</span>
          ${
            device.capabilities.some(
              (cap) => cap.type === "devices.capabilities.on_off"
            )
              ? `<button class="power ${on ? "on" : ""}" data-toggle="${
                  device.id
                }" title="Вкл/выкл"><ha-icon icon="mdi:power"></ha-icon></button>`
              : ""
          }
        </div>
      </article>
    `;
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
        ${this._renderControls(device)}
        ${this._renderProperties(device)}
      </div>
    `;
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
      return `
        <div class="control-block">
          <div class="control-label"><strong>${label}</strong></div>
          ${
            scenes.length
              ? `<select data-scene-device="${this._esc(device.id)}">
                  <option value="">Без сцены</option>
                  ${scenes
                    .map(
                      (scene) =>
                        `<option value="${this._esc(scene.id)}" ${
                          cap.value === scene.id ? "selected" : ""
                        }>${this._esc(scene.name)}</option>`
                    )
                    .join("")}
                </select>`
              : ""
          }
          ${
            temperature
              ? `<div class="control-label sub"><span>Цветовая температура</span><span>${temperature.min}–${temperature.max} K</span></div>
                 <input type="range" min="${temperature.min}" max="${temperature.max}" step="100" value="${temperature.min}"
                   data-color-device="${this._esc(device.id)}"
                   data-color-instance="temperature_k" />`
              : `<p class="muted">Цвет управляется сценами или приложением производителя.</p>`
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
          <b>${this._esc(String(prop.value ?? "—"))}${
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
      <div class="skin-picker">
        <span>Вид плеера: <b>${this._skinName(this._playerSkin)}</b></span>
        ${[
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
              `<button class="${
                this._playerSkin === skin ? "active" : ""
              }" data-music-action="skin" data-skin="${skin}" title="${name}">${skin}</button>`
          )
          .join("")}
      </div>
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
    const container = this.shadowRoot
      ? this.shadowRoot.querySelector(
          `[data-music-hub="${targetId}"]`
        )
      : null;
    if (!container) return;
    const compact = container.getAttribute("data-compact") === "1";
    container.innerHTML = this._renderMusicHub(targetId, compact);
  }

  _vizOptions() {
    return [
      ["bars", "Спектр", "mdi:equalizer"],
      ["wave", "Волна", "mdi:sine-wave"],
      ["orbit", "Орбита", "mdi:orbit"],
      ["dots", "Точки", "mdi:dots-hexagon"],
      ["pulse", "Пульс", "mdi:pulse"],
      ["spectrum", "Спектр 2", "mdi:chart-bar"],
      ["mirror", "Зеркало", "mdi:mirror"],
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
    return `
      <div class="speakers-section">
        ${this._renderMusicHub(targetId)}
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

  _renderSpeakerControls(speakers) {
    const withEntity = speakers.filter(
      (speaker) => speaker.entity_id && this._hass.states[speaker.entity_id]
    );
    if (!withEntity.length) {
      return `<div class="empty">Колонки не найдены. Проверьте cookies и токен в настройках интеграции.</div>`;
    }
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
    const token = this._hass.auth?.data?.access_token || "";
    const sensors = speaker.sensors || [];
    return `<article class="speaker-control">
      <div class="speaker-control-head">
        <div class="device-icon" style="--accent:#5b6cff"><ha-icon icon="mdi:speaker-wireless"></ha-icon></div>
        <div>
          <h3>${this._esc(speaker.name)}</h3>
          <p class="muted">${this._esc(speaker.platform || "")} · ${
      entity.state === "off" ? "выключена" : "онлайн"
    }</p>
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
                <label>Яркость <input type="range" min="0" max="100" value="60" data-led-brightness="${this._esc(
                  speaker.id
                )}"></label>
                <label>Экран <select data-led-visualization="${this._esc(
                  speaker.id
                )}"><option value="clock">Часы</option><option value="equalizer">Эквалайзер</option></select></label>
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
            speaker.lyrics_entity && token
              ? `<img class="lyrics-preview" src="/api/camera_proxy_stream/${this._esc(
                  speaker.lyrics_entity
                )}?token=${this._esc(token)}" alt="">`
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
    const cover =
      attrs.entity_picture || (trackInfo && trackInfo.cover) || image;
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
    return `
      <article class="player skin-${this._playerSkin} ${full ? "full" : ""} ${
      playing ? "playing" : ""
    } ${paused ? "paused" : ""}" data-player="${this._esc(
      speaker.id
    )}" data-player-entity="${this._esc(
      entityId
    )}" ${
      cover ? `style="--cover:url('${this._esc(cover)}')"` : ""
    }>
        <div class="player-bg"></div>
        <div class="player-glow"></div>
        <div class="player-content">
          <div class="player-head">
            <div class="player-cover ${full ? "big" : ""}">
              ${
                cover
                  ? `<img data-player-cover src="${this._esc(
                      cover
                    )}" alt="" loading="lazy" />`
                  : `<ha-icon data-cover-fallback icon="mdi:speaker"></ha-icon>`
              }
              ${
                full && this._showLyrics
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
              <span class="player-kicker" data-player-kicker>${
                playing
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
      el.classList.toggle("playing", playing);
      el.classList.toggle("paused", paused);
      const trackId = String(attrs.media_content_id || "");
      const trackInfo = /^\d+$/.test(trackId) ? this._trackInfo(trackId) : null;
      const cover =
        attrs.entity_picture ||
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
      const kickerText = playing
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
    if (restartTicker) this._startTicker();
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
        return `<div class="viz viz-wave">${Array.from(
          { length: 24 },
          (_, i) =>
            `<span style="--i:${i};--h:${18 + ((i * 29) % 70)}%"></span>`
        ).join("")}</div>`;
      case "orbit":
        return `<div class="viz viz-orbit"><i></i><i></i><i></i><b></b></div>`;
      case "dots":
        return `<div class="viz viz-dots">${Array.from(
          { length: 28 },
          (_, i) =>
            `<span style="--i:${i};--h:${20 + ((i * 23) % 70)}%"></span>`
        ).join("")}</div>`;
      case "pulse":
        return `<div class="viz viz-pulse"><i></i><i></i><i></i><i></i><b></b></div>`;
      case "spectrum":
        return `<div class="viz viz-spectrum"><div>${bars(
          32
        )}</div><div class="mirror">${bars(32)}</div></div>`;
      case "mirror":
        return `<div class="viz viz-mirror"><div>${bars(
          24
        )}</div><div class="flip">${bars(24)}</div></div>`;
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
          { length: 16 },
          (_, i) =>
            `<span style="--i:${i};--h:${24 + ((i * 31) % 70)}%"></span>`
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

  _startTicker() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
    if ((this._tab !== "speakers" && !this._fullPlayer) || !this._data) return;
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

  _attachEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    root.addEventListener("click", (event) => this._onMusicAction(event));
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
        if (action === "demo") {
          window.open("/yahome_hub/integrations-demo.html", "_blank");
        }
        if (action === "back") {
          this._selected = null;
          this._render();
        }
      });
    });
    root.querySelectorAll("[data-room]").forEach((el) => {
      el.addEventListener("click", () => {
        this._room = el.getAttribute("data-room");
        this._render();
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

  _attachCardEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-device]").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        this._selected = el.getAttribute("data-device");
        this._render();
      });
    });
    root.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-toggle")
        );
        if (!device) return;
        this._action(
          device,
          { type: "devices.capabilities.on_off", instance: "on" },
          !this._isOn(device)
        );
      });
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
    return `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--primary-background-color, #f5f6f8);
        color: var(--primary-text-color, #1f2430);
        font-family: var(--ha-font-family-body, "Segoe UI", Roboto, sans-serif);
      }
      * { box-sizing: border-box; }
      .shell { max-width: 1480px; margin: 0 auto; padding: 28px 24px 64px; }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 18px; }
      .brand { display: flex; align-items: center; gap: 16px; }
      .logo {
        width: 56px; height: 56px; border-radius: 18px; overflow: hidden; display: grid; place-items: center;
        color: white; font-size: 28px;
        background: linear-gradient(135deg, #5b6cff 0%, #8f43ff 55%, #ff4f9a 100%);
        box-shadow: 0 12px 30px rgba(91, 108, 255, .28);
      }
      .logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
      h1 { margin: 0; font-size: 26px; letter-spacing: -.4px; }
      .brand p { margin: 3px 0 0; color: var(--secondary-text-color, #667085); font-size: 13px; }
      .top-actions { display: flex; gap: 10px; }
      .icon-btn {
        width: 42px; height: 42px; border-radius: 14px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: var(--primary-text-color, #1f2430);
        cursor: pointer; display: grid; place-items: center; font-size: 20px;
        transition: transform .15s ease, box-shadow .15s ease;
      }
      .icon-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(16, 24, 40, .08); }
      .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
      .stat {
        background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 18px; padding: 14px 18px; display: flex; align-items: baseline; gap: 9px;
      }
      .stat span { font-size: 28px; font-weight: 700; letter-spacing: -.5px; }
      .stat small { color: var(--secondary-text-color, #667085); font-size: 12px; }
      .toolbar { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
      .search {
        display: flex; align-items: center; gap: 10px; background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 16px; padding: 0 14px; height: 46px;
      }
      .search ha-icon { color: var(--secondary-text-color, #667085); }
      .search input { border: 0; outline: 0; background: transparent; color: inherit; font: inherit; width: 100%; }
      .chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .chip {
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        color: var(--secondary-text-color, #667085); border-radius: 999px; padding: 7px 13px;
        font: inherit; font-size: 12px; cursor: pointer;
      }
      .chip b { opacity: .65; font-weight: 600; }
      .chip.active { background: var(--primary-color, #5b6cff); color: #fff; border-color: transparent; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr)); gap: 14px; }
      .card {
        background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 20px; padding: 16px; cursor: pointer; position: relative;
        transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
      }
      .card:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(16, 24, 40, .09); border-color: transparent; }
      .card-head { display: flex; justify-content: space-between; align-items: flex-start; }
      .device-icon {
        width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center;
        font-size: 24px; color: var(--accent, #5b6cff);
        background: color-mix(in srgb, var(--accent, #5b6cff) 13%, transparent);
      }
      .device-icon.big { width: 68px; height: 68px; border-radius: 22px; font-size: 34px; }
      .status { width: 10px; height: 10px; border-radius: 50%; background: #c0c6d0; }
      .status.online { background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, .14); }
      .status.offline { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, .12); }
      .card h3 { margin: 14px 0 4px; font-size: 15px; line-height: 1.3; }
      .muted { color: var(--secondary-text-color, #667085); font-size: 12px; margin: 0; }
      .card-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; gap: 10px; }
      .state { font-size: 12px; font-weight: 600; color: var(--primary-text-color, #1f2430); }
      .power {
        width: 34px; height: 34px; border-radius: 12px; border: 1px solid var(--divider-color, #e4e7ec);
        background: transparent; color: var(--secondary-text-color, #667085); cursor: pointer; display: grid; place-items: center;
      }
      .power.on { background: var(--primary-color, #5b6cff); border-color: transparent; color: #fff; }
      .detail { display: flex; flex-direction: column; gap: 16px; }
      .back {
        align-self: flex-start; display: inline-flex; align-items: center; gap: 7px;
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f2430); border-radius: 12px; padding: 8px 12px; cursor: pointer; font: inherit;
      }
      .detail-head { display: flex; align-items: center; gap: 18px; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px; padding: 20px; }
      .detail-head h2 { margin: 0 0 4px; font-size: 24px; }
      .status-text { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 600; }
      .status-text.online { color: #16a34a; }
      .status-text.offline { color: #dc2626; }
      .section { background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px; padding: 18px; }
      .section h3 { margin: 0 0 14px; font-size: 15px; }
      .controls { display: flex; flex-direction: column; gap: 12px; }
      .control-row { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--divider-color, #eef0f4); }
      .control-row:last-child { border-bottom: 0; }
      .control-row small { display: block; color: var(--secondary-text-color, #667085); margin-top: 3px; }
      .media-buttons { display: flex; gap: 6px; }
      .media-buttons .icon-btn { width: 34px; height: 34px; border-radius: 10px; font-size: 16px; }
      .control-block { padding: 10px 0; border-bottom: 1px solid var(--divider-color, #eef0f4); }
      .control-block:last-child { border-bottom: 0; }
      .control-label { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 13px; }
      .control-label.sub { margin-top: 12px; color: var(--secondary-text-color, #667085); font-size: 12px; }
      input[type="range"] { width: 100%; accent-color: var(--primary-color, #5b6cff); }
      select {
        width: 100%; height: 40px; border-radius: 12px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--secondary-background-color, #f7f8fa); color: var(--primary-text-color, #1f2430);
        padding: 0 10px; font: inherit;
      }
      .switch {
        width: 50px; height: 28px; border-radius: 999px; border: 0; padding: 3px; cursor: pointer;
        background: #cfd5df; transition: background .15s ease; flex: none;
      }
      .switch span { display: block; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
      .switch.on { background: var(--primary-color, #5b6cff); }
      .switch.on span { transform: translateX(22px); }
      .props { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
      .prop { display: flex; justify-content: space-between; gap: 10px; background: var(--secondary-background-color, #f7f8fa); border-radius: 12px; padding: 10px 12px; font-size: 13px; }
      .prop span { color: var(--secondary-text-color, #667085); }
      .scenarios { display: flex; flex-wrap: wrap; gap: 10px; }
      .scenario {
        display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: var(--primary-text-color, #1f2430);
        border-radius: 14px; padding: 10px 14px; cursor: pointer; font: inherit;
      }
      .scenario:hover { border-color: var(--primary-color, #5b6cff); color: var(--primary-color, #5b6cff); }
      .speakers { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
      .speaker { border: 1px solid var(--divider-color, #e4e7ec); border-radius: 16px; padding: 14px; }
      .speaker-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
      .speaker-head strong { display: block; font-size: 14px; }
      .speaker-head small { display: block; color: var(--secondary-text-color, #667085); font-size: 11px; margin-top: 2px; }
      .speaker-head .power { margin-left: auto; }
      .tabs {
        display: flex; gap: 6px; margin: 4px 0 18px; padding: 5px;
        background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 16px; overflow-x: auto;
      }
      .tab {
        display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent;
        color: var(--secondary-text-color, #667085); border-radius: 12px; padding: 10px 14px;
        font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
      }
      .tab ha-icon { --mdc-icon-size: 18px; }
      .tab b { font-size: 11px; opacity: .65; }
      .tab.active {
        color: #fff; background: linear-gradient(135deg, #5b6cff 0%, #8f43ff 60%, #ff4f9a 100%);
        box-shadow: 0 8px 18px rgba(91, 108, 255, .25);
      }
      .speakers-section { display: flex; flex-direction: column; gap: 16px; }
      .speaker-toolbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
      .speaker-toolbar h3 { margin: 0 0 4px; font-size: 17px; }
      .viz-switch {
        display: flex; gap: 3px; padding: 4px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); border-radius: 14px; flex: none;
        max-width: 100%; overflow-x: auto; scrollbar-width: thin;
      }
      .viz-switch button {
        display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent;
        color: var(--secondary-text-color, #667085); border-radius: 10px; padding: 7px 9px;
        font: inherit; font-size: 11px; cursor: pointer; flex: none; white-space: nowrap;
      }
      .viz-switch button ha-icon { --mdc-icon-size: 15px; }
      .viz-switch button.active { background: var(--primary-color, #5b6cff); color: #fff; }
      .players { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 20px; }
      .player {
        position: relative; overflow: hidden; border-radius: 30px; padding: 24px;
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        isolation: isolate;
      }
      .player-bg {
        position: absolute; inset: -25%; z-index: -2; background-image: var(--cover);
        background-size: cover; background-position: center; filter: blur(38px) saturate(1.4);
        opacity: .34; transform: scale(1.15);
      }
      .player-glow {
        position: absolute; inset: 0; z-index: -1; pointer-events: none;
        background: linear-gradient(135deg, rgba(91, 108, 255, .16), rgba(255, 79, 154, .12));
      }
      .player-content { position: relative; display: flex; flex-direction: column; gap: 12px; }
      .player-head { display: flex; align-items: center; gap: 14px; }
      .player-cover {
        position: relative; width: 120px; height: 120px; flex: none; border-radius: 26px; overflow: hidden;
        display: grid; place-items: center; color: #fff; font-size: 44px;
        background: linear-gradient(135deg, #5b6cff, #8f43ff 55%, #ff4f9a);
        box-shadow: 0 18px 38px rgba(16, 24, 40, .24);
      }
      .player-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .player.playing .player-cover img { animation: coverFloat 5s ease-in-out infinite; }
      @keyframes coverFloat {
        0%, 100% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.05) rotate(.6deg); }
      }
      .player-meta { min-width: 0; flex: 1; }
      .player-kicker {
        display: block; font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--secondary-text-color, #667085); font-weight: 700;
      }
      .player-meta h3 {
        margin: 5px 0; font-size: 24px; line-height: 1.2;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .player-meta p {
        margin: 0; font-size: 12px; color: var(--secondary-text-color, #667085);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .player-meta .dot { opacity: .45; }
      .player-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .player-actions .power { margin-left: 0; }
      .player-power { margin-left: 0; }
      .player-modal {
        position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
        padding: 18px;
      }
      .player-modal-backdrop {
        position: absolute; inset: 0; background: rgba(5, 6, 15, .72);
        backdrop-filter: blur(10px);
      }
      .player-modal-body {
        position: relative; width: min(1120px, 96vw); max-height: 94vh; overflow: auto;
        border-radius: 32px; scrollbar-width: thin;
      }
      .player.full {
        padding: 28px; border-radius: 32px; border-color: rgba(255,255,255,.18);
        box-shadow: 0 40px 100px rgba(0,0,0,.45);
      }
      .player.full .player-head { align-items: flex-start; }
      .player.full .player-cover.big {
        width: min(380px, 38vw); height: min(380px, 38vw);
        border-radius: 30px; font-size: 80px;
      }
      .player.full .player-cover.big img { border-radius: 30px; }
      .player.full .player-meta { padding-top: 10px; }
      .player.full .player-meta h3 { font-size: 30px; line-height: 1.2; white-space: normal; }
      .player.full .player-meta p { font-size: 15px; white-space: normal; }
      .player.full .player-kicker { font-size: 11px; }
      .player.full .viz { height: 86px; }
      .player.full .player-seek input { height: 28px; }
      .player.full .times { font-size: 12px; }
      .player.full .player-controls { gap: 14px; }
      .player.full .player-controls .icon-btn { width: 46px; height: 46px; border-radius: 15px; }
      .player.full .player-controls .icon-btn.play { width: 58px; height: 58px; border-radius: 18px; }
      .player.full .volume-control { min-width: 220px; }
      .lyrics-overlay {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 20px 18px;
        background: linear-gradient(to top, rgba(5,6,15,.95), rgba(5,6,15,.35) 72%, transparent);
        text-align: center; pointer-events: none;
      }
      .lyrics-prev {
        color: rgba(255,255,255,.5); font-size: 13px; line-height: 1.25;
        margin-bottom: 6px; text-shadow: 0 2px 12px rgba(0,0,0,.8);
        transition: opacity .35s ease;
      }
      .lyrics-current-row {
        display: flex; align-items: center; justify-content: center; gap: 10px;
      }
      .lyrics-countdown {
        flex: none; min-width: 36px; text-align: right;
        color: rgba(255,255,255,.62); font-size: 12px;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 2px 12px rgba(0,0,0,.8);
      }
      .lyrics-current {
        color: #fff; font-size: 25px; line-height: 1.25; font-weight: 700;
        text-shadow: 0 2px 16px rgba(0,0,0,.85);
        max-width: calc(100% - 50px);
      }
      .lyrics-next {
        color: rgba(255,255,255,.68); font-size: 14px; line-height: 1.3;
        margin-top: 7px; text-shadow: 0 2px 12px rgba(0,0,0,.8);
      }
      .lyric-in { animation: lyricIn .35s ease both; }
      @keyframes lyricIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .viz {
        height: 82px; display: flex; align-items: flex-end; justify-content: center; gap: 3px;
        padding: 9px 12px; border-radius: 16px; overflow: hidden;
        background: color-mix(in srgb, var(--primary-color, #5b6cff) 7%, transparent);
      }
      .viz-bars span {
        flex: 1; height: var(--h); border-radius: 4px 4px 2px 2px;
        background: linear-gradient(to top, #5b6cff, #ff4f9a);
        transform-origin: bottom; animation: barDance 1.15s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.07s); opacity: .85;
      }
      @keyframes barDance { from { transform: scaleY(.28); } to { transform: scaleY(1); } }
      .viz-wave span {
        width: 4px; height: var(--h); border-radius: 99px;
        background: linear-gradient(to top, #5b6cff, #22b8a7);
        transform-origin: bottom; animation: waveDance 1.6s ease-in-out infinite;
        animation-delay: calc(var(--i) * -0.09s); opacity: .8;
      }
      @keyframes waveDance {
        0%, 100% { transform: scaleY(.3); }
        50% { transform: scaleY(1); }
      }
      .viz-orbit { position: relative; display: grid; place-items: center; }
      .viz-orbit i {
        position: absolute; width: 38px; height: 38px; border-radius: 50%;
        border: 2px solid rgba(91, 108, 255, .25); border-top-color: #ff4f9a;
        animation: orbitSpin 3s linear infinite;
      }
      .viz-orbit i:nth-child(2) {
        width: 52px; height: 52px; animation-duration: 4.6s; border-top-color: #5b6cff;
        animation-direction: reverse;
      }
      .viz-orbit i:nth-child(3) {
        width: 66px; height: 66px; animation-duration: 6.2s; border-top-color: #22b8a7;
      }
      .viz-orbit b {
        width: 10px; height: 10px; border-radius: 50%; background: #ff4f9a;
        box-shadow: 0 0 18px #ff4f9a;
      }
      @keyframes orbitSpin { to { transform: rotate(360deg); } }
      .player:not(.playing) .viz span,
      .player:not(.playing) .viz i,
      .player:not(.playing) .viz b {
        animation-play-state: paused; opacity: .35;
      }
      .player-seek input[type="range"] { width: 100%; accent-color: var(--primary-color, #5b6cff); }
      .times {
        display: flex; justify-content: space-between; margin-top: 2px;
        font-size: 10px; color: var(--secondary-text-color, #667085);
      }
      .player-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .transport { display: flex; align-items: center; gap: 6px; }
      .player-controls .icon-btn { width: 46px; height: 46px; border-radius: 14px; }
      .player-controls .icon-btn.play {
        width: 56px; height: 56px; border-radius: 18px; border-color: transparent;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        box-shadow: 0 10px 24px rgba(91, 108, 255, .34);
      }
      .volume-control {
        display: flex; align-items: center; gap: 6px; flex: 1; min-width: 130px;
        color: var(--secondary-text-color, #667085);
      }
      .volume-control input { flex: 1; accent-color: var(--primary-color, #5b6cff); }
      .volume-control span { width: 34px; text-align: right; font-size: 11px; }
      .volume-toggle {
        display: grid; place-items: center; width: 28px; height: 28px;
        padding: 0; border: 0; background: none; color: inherit; cursor: pointer;
      }
      .volume-toggle:hover { color: var(--primary-color, #5b6cff); }
      .lyrics-sync {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        margin-top: 10px; color: var(--secondary-text-color, #667085);
        font-size: 12px; flex-wrap: wrap;
      }
      .lyrics-sync b {
        min-width: 48px; text-align: center;
        color: var(--primary-text-color, #101828); font-weight: 600;
      }
      .sync-btn {
        min-width: 46px; height: 28px; padding: 0 8px; border-radius: 9px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: transparent; color: inherit; cursor: pointer; font-size: 11px;
      }
      .sync-btn:hover {
        border-color: var(--primary-color, #5b6cff);
        color: var(--primary-color, #5b6cff);
      }
      .eq-select { height: 36px; max-width: 165px; font-size: 12px; }
      .compact-speakers { margin-top: 2px; }
      .player.compact { display: flex; align-items: center; gap: 14px; padding: 14px; }
      .player.compact .player-cover { width: 56px; height: 56px; border-radius: 15px; font-size: 24px; }
      .player.compact .player-meta h3 { font-size: 14px; }
      .hub-intro { margin-bottom: 14px; }
      .hub-title { display: flex; align-items: center; gap: 14px; }
      .hub-title h3 { margin: 0 0 4px; font-size: 17px; }
      .hub-chips { margin-top: 14px; }
      .chip ha-icon { --mdc-icon-size: 16px; vertical-align: -3px; margin-right: 4px; }
      .hub-note { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; }
      .hub-note ha-icon { color: var(--primary-color, #5b6cff); flex: none; }
      .prop span { display: flex; align-items: center; gap: 6px; }
      .prop ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color, #667085); }
      .loading { display: grid; place-items: center; padding: 70px 0; color: var(--secondary-text-color, #667085); }
      .spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid var(--divider-color, #e4e7ec); border-top-color: var(--primary-color, #5b6cff); animation: spin .8s linear infinite; margin-bottom: 12px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 14px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; }
      .empty { text-align: center; color: var(--secondary-text-color, #667085); padding: 44px 0; }
      .toast {
        position: fixed; right: 24px; bottom: 24px; z-index: 10; background: #111827; color: #fff;
        border-radius: 12px; padding: 12px 16px; font-size: 13px; box-shadow: 0 18px 40px rgba(0,0,0,.24);
      }
      .subtabs {
        display: flex; gap: 8px; margin: 0 0 16px; flex-wrap: wrap;
      }
      .subtabs button {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 9px 14px; border-radius: 12px; cursor: pointer;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff);
        color: var(--secondary-text-color, #667085);
        font-size: 12px; font-weight: 600;
      }
      .subtabs button.active {
        color: #fff; border-color: transparent;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
      }
      .subtabs button ha-icon { --mdc-icon-size: 17px; }
      .speaker-controls { display: flex; flex-direction: column; gap: 16px; }
      .speaker-control {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 22px;
        background: var(--card-background-color, #fff); padding: 18px;
      }
      .speaker-control-head { display: flex; align-items: center; gap: 12px; }
      .speaker-control-head h3 { margin: 0 0 3px; font-size: 17px; }
      .speaker-control-head p { margin: 0; font-size: 11px; }
      .speaker-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 12px; margin-top: 16px;
      }
      .control-block {
        display: flex; flex-direction: column; gap: 8px;
        border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 16px; padding: 12px;
        background: var(--secondary-background-color, #f7f8fc);
      }
      .control-block h4 { margin: 0; font-size: 12px; }
      .control-block p { margin: 0; font-size: 11px; }
      .control-block label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; color: var(--secondary-text-color, #667085); }
      .control-block textarea {
        min-height: 58px; resize: vertical; border-radius: 10px;
        border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); color: inherit;
        padding: 8px 10px; font: inherit; font-size: 12px;
      }
      .control-line { display: flex; align-items: center; gap: 8px; }
      .control-line input[type="range"] { flex: 1; accent-color: var(--primary-color, #5b6cff); }
      .action-btn {
        border: 0; border-radius: 10px; padding: 8px 12px; cursor: pointer;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        font-size: 11px; font-weight: 700;
      }
      .action-btn:hover { filter: brightness(1.08); }
      .ghost-btn {
        align-self: flex-start; border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 9px; padding: 6px 10px; background: transparent;
        color: inherit; font-size: 11px; cursor: pointer;
      }
      .ghost-btn:hover { border-color: var(--primary-color, #5b6cff); }
      .lyrics-preview {
        width: 100%; aspect-ratio: 16 / 9; object-fit: cover;
        border-radius: 12px; background: #101018;
      }
      .chat-line { display: flex; gap: 6px; }
      .chat-line input {
        flex: 1; min-width: 0; border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 9px; padding: 7px 9px; background: var(--card-background-color, #fff);
        color: inherit; font: inherit; font-size: 11px;
      }
      .chat-response { min-height: 16px; font-size: 11px; color: var(--secondary-text-color, #667085); }
      .control-status { min-height: 16px; margin-top: 8px; font-size: 11px; color: var(--secondary-text-color, #667085); }
      .sensor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .sensor-tile {
        display: flex; flex-direction: column; gap: 2px;
        border-radius: 10px; padding: 8px;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e4e7ec);
      }
      .sensor-tile span { font-size: 9px; color: var(--secondary-text-color, #667085); }
      .sensor-tile b { font-size: 13px; }
      .speaker-note { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; }
      .speaker-note ha-icon { color: var(--primary-color, #5b6cff); flex: none; }
      .speaker-note a { color: var(--primary-color, #5b6cff); }
      .music-search { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
      .search-row { display: flex; gap: 8px; }
      .search-row input {
        flex: 1; min-width: 0; border: 1px solid var(--divider-color, #e4e7ec);
        border-radius: 10px; padding: 9px 11px; background: rgba(255,255,255,.7);
        color: inherit; font: inherit; font-size: 12px;
      }
      .music-results { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow: auto; }
      .music-result {
        display: flex; align-items: center; gap: 9px; width: 100%;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 11px;
        background: rgba(255,255,255,.65); padding: 7px 9px; text-align: left;
        color: inherit; cursor: pointer;
      }
      .music-result:hover { border-color: var(--primary-color, #5b6cff); }
      .music-result img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex: none; background: #101018; }
      .music-result span { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
      .music-result b { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .music-result small { font-size: 10px; color: var(--secondary-text-color, #667085); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .music-result ha-icon { color: var(--primary-color, #5b6cff); }
      .music-hint { font-size: 11px; color: var(--secondary-text-color, #667085); padding: 6px 2px; }
      .mode-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .mode-btn {
        display: inline-flex; align-items: center; gap: 6px;
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 9px;
        background: transparent; color: inherit; padding: 7px 10px;
        font-size: 11px; cursor: pointer;
      }
      .mode-btn.active { border-color: var(--primary-color, #5b6cff); color: var(--primary-color, #5b6cff); background: rgba(91,108,255,.08); }
      .mode-row select {
        border: 1px solid var(--divider-color, #e4e7ec); border-radius: 9px;
        padding: 7px 9px; background: var(--card-background-color, #fff);
        color: inherit; font-size: 11px;
      }
      .music-hub {
        margin-bottom: 20px; padding: 18px; border-radius: 26px;
        background:
          radial-gradient(circle at 0% 0%, rgba(108,124,255,.32), transparent 42%),
          radial-gradient(circle at 100% 0%, rgba(255,79,154,.18), transparent 38%),
          linear-gradient(180deg, #171b2b, #0d101b);
        border: 1px solid rgba(255,255,255,.12);
        color: #eef0ff;
        box-shadow: 0 20px 50px rgba(0,0,0,.18);
      }
      .music-hub.compact { margin-top: 16px; margin-bottom: 0; box-shadow: none; }
      .music-hub-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .music-hub-head h3 { margin: 0 0 4px; font-size: 18px; color: #fff; }
      .music-hub-head p { margin: 0; font-size: 12px; color: rgba(238,240,255,.58); }
      .music-hub-head select {
        border: 1px solid rgba(255,255,255,.16); border-radius: 10px;
        background: rgba(255,255,255,.08); color: #eef0ff; padding: 8px 10px;
        font-size: 11px; max-width: 220px;
      }
      .music-search-bar { display: flex; gap: 8px; margin-top: 14px; }
      .music-search-bar input {
        flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,.16);
        border-radius: 11px; padding: 10px 12px; background: rgba(255,255,255,.08);
        color: #eef0ff; font: inherit; font-size: 12px; outline: none;
      }
      .music-search-bar input:focus { border-color: rgba(108,124,255,.8); }
      .music-search-bar .action-btn { flex: none; }
      .music-tabs { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
      .music-tabs button {
        border: 1px solid rgba(255,255,255,.14); border-radius: 10px;
        background: transparent; color: rgba(238,240,255,.68);
        padding: 7px 11px; font-size: 11px; cursor: pointer;
      }
      .music-tabs button.active {
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
        border-color: transparent; color: #fff;
      }
      .music-tabs b { font-weight: 700; }
      .music-content { margin-top: 12px; max-height: 390px; overflow: auto; padding-right: 4px; }
      .track-list { display: flex; flex-direction: column; gap: 6px; }
      .track-row {
        display: flex; align-items: center; gap: 9px; padding: 7px 9px;
        border-radius: 12px; background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.07); cursor: pointer;
      }
      .track-row.current {
        border-color: rgba(108,124,255,.8);
        background: rgba(108,124,255,.16);
      }
      .track-cover {
        width: 40px; height: 40px; border-radius: 9px; object-fit: cover;
        flex: none; background: #101018;
      }
      .track-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .track-meta b { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .track-meta small { font-size: 10px; color: rgba(238,240,255,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .track-duration { font-size: 10px; color: rgba(238,240,255,.5); }
      .track-btn {
        width: 30px; height: 30px; border-radius: 9px; flex: none;
        border: 1px solid rgba(255,255,255,.14); background: transparent;
        color: #eef0ff; cursor: pointer; display: grid; place-items: center;
      }
      .track-btn:hover { border-color: #8f9bff; color: #b9c2ff; }
      .queue-head { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .playlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
      .playlist-card {
        display: flex; flex-direction: column; gap: 6px; padding: 8px;
        border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
        background: rgba(255,255,255,.06); color: #eef0ff; text-align: left; cursor: pointer;
      }
      .playlist-card:hover { border-color: rgba(108,124,255,.8); }
      .playlist-card img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; background: #101018; }
      .playlist-card b { font-size: 11px; }
      .playlist-card small { font-size: 10px; color: rgba(238,240,255,.55); }
      .playlist-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12px; }
      .skin-picker {
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        margin-top: 13px; padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,.09);
        font-size: 11px; color: rgba(238,240,255,.55);
      }
      .skin-picker button {
        width: 27px; height: 27px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.16); background: transparent;
        color: #eef0ff; cursor: pointer; font-size: 11px;
      }
      .skin-picker button.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
        border-color: transparent; color: #fff;
      }
      .skin-picker b { color: #fff; font-weight: 600; }
      .music-hint { font-size: 11px; color: rgba(238,240,255,.55); padding: 8px 2px; }
      .music-hint.notice { color: #9facff; }
      .error-text { color: #ff8da1; }
      .full-player,
      .player.full.full-player {
        position: relative; overflow: hidden; border-radius: 32px;
        color: #fff; background: #080a12; padding: 0; border: 0;
        min-height: 620px;
        box-shadow: 0 40px 100px rgba(0,0,0,.55);
      }
      .player.full.full-player .player-cover.big {
        width: 100%; height: auto; aspect-ratio: 1;
      }
      .player.full.full-player .player-cover.big img { border-radius: 24px; }
      .player.full.full-player .full-viz .viz { height: 100%; }
      .full-bg {
        position: absolute; inset: -30px;
        background-image: var(--cover);
        background-size: cover; background-position: center;
        filter: blur(38px) brightness(.56) saturate(1.25);
        transform: scale(1.12);
      }
      .full-shade {
        position: absolute; inset: 0;
        background:
          radial-gradient(circle at 15% 5%, rgba(108,124,255,.18), transparent 38%),
          linear-gradient(180deg, rgba(5,6,15,.24), rgba(5,6,15,.62) 52%, rgba(5,6,15,.88));
      }
      .full-content {
        position: relative; z-index: 1; padding: 24px;
        display: flex; flex-direction: column; gap: 14px;
      }
      .full-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
      .full-kicker { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.55); }
      .full-title h2 { margin: 5px 0 4px; font-size: 28px; line-height: 1.12; }
      .full-title p { margin: 0; font-size: 13px; color: rgba(255,255,255,.66); }
      .full-actions { display: flex; gap: 8px; }
      .round-btn {
        width: 38px; height: 38px; border-radius: 50%;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.1); color: #fff;
        display: grid; place-items: center; cursor: pointer;
      }
      .round-btn:hover { background: rgba(255,255,255,.18); }
      .full-main {
        display: grid; grid-template-columns: minmax(280px, 380px) 1fr;
        gap: 22px; align-items: center;
      }
      .full-cover-wrap { min-width: 0; }
      .full-player .player-cover.big {
        width: 100%; height: auto; aspect-ratio: 1; border-radius: 24px;
        box-shadow: 0 26px 70px rgba(0,0,0,.5);
      }
      .full-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .full-viz {
        height: 150px; display: flex; align-items: stretch;
        padding: 12px; border-radius: 18px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
      }
      .full-viz .viz { flex: 1; height: 100%; background: transparent; padding: 0; }
      .full-viz-switch { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
      .full-viz-switch button {
        width: 29px; height: 29px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.14); background: transparent;
        color: rgba(255,255,255,.7); cursor: pointer;
      }
      .full-viz-switch button.active {
        background: linear-gradient(135deg, #5b6cff, #ff4f9a);
        border-color: transparent; color: #fff;
      }
      .full-modes { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .full-modes .mode-btn { color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.14); }
      .full-modes .mode-btn.active { color: #fff; border-color: #8f9bff; background: rgba(108,124,255,.2); }
      .full-modes select {
        border: 1px solid rgba(255,255,255,.14); border-radius: 9px;
        background: rgba(255,255,255,.08); color: #fff; padding: 7px 9px; font-size: 11px;
      }
      .full-seek input[type="range"] { width: 100%; accent-color: #8f9bff; }
      .full-seek .times { color: rgba(255,255,255,.6); }
      .full-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .full-controls .transport { display: flex; align-items: center; gap: 8px; }
      .full-controls .icon-btn {
        width: 44px; height: 44px; border-radius: 14px;
        background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14);
        color: #fff;
      }
      .full-controls .icon-btn.play {
        width: 56px; height: 56px; border-radius: 18px; border: 0;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        box-shadow: 0 10px 28px rgba(91,108,255,.36);
      }
      .full-controls .volume-control { flex: 1; min-width: 180px; color: rgba(255,255,255,.7); }
      .full-controls .volume-toggle { color: #fff; }
      .full-player .lyrics-sync { color: rgba(255,255,255,.6); }
      .full-player .lyrics-sync b { color: #fff; }
      .full-player .sync-btn { border-color: rgba(255,255,255,.18); color: #fff; }
      .full-player .sync-btn:hover { border-color: #8f9bff; color: #b9c2ff; }
      .full-player .music-hub { margin-top: 4px; }
      .speaker-control {
        background: linear-gradient(180deg, #171b2b, #0d101b);
        color: #eef0ff; border-color: rgba(255,255,255,.12);
      }
      .speaker-control .muted { color: rgba(238,240,255,.55); }
      .speaker-control .control-block {
        background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.09);
      }
      .speaker-control .control-block h4,
      .speaker-control .control-block p,
      .speaker-control .control-block label { color: rgba(238,240,255,.8); }
      .speaker-control .control-block select,
      .speaker-control .control-block input,
      .speaker-control .control-block textarea {
        background: rgba(255,255,255,.08); color: #eef0ff; border-color: rgba(255,255,255,.14);
      }
      .speaker-control .ghost-btn { color: #eef0ff; border-color: rgba(255,255,255,.16); }
      .speaker-control .sensor-tile { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.09); }
      .player {
        --skin-accent: #6c7cff;
        --skin-accent-2: #ff4f9a;
      }
      .player .icon-btn.play,
      .player .viz-bars span,
      .player .viz-wave span,
      .player .viz-dots span,
      .player .viz-spectrum span,
      .player .viz-mirror span,
      .player .viz-blocks span {
        background: linear-gradient(135deg, var(--skin-accent), var(--skin-accent-2));
      }
      .player.skin-2 { --skin-accent: #7c8cff; --skin-accent-2: #4fd1ff; }
      .player.skin-3 { --skin-accent: #f2b35e; --skin-accent-2: #ff7a59; }
      .player.skin-4 { --skin-accent: #8be9fd; --skin-accent-2: #c084fc; }
      .player.skin-5 { --skin-accent: #ff3df2; --skin-accent-2: #39e7ff; }
      .player.skin-6 { --skin-accent: #111827; --skin-accent-2: #6b7280; }
      .player.skin-7 { --skin-accent: #37d39a; --skin-accent-2: #6c7cff; }
      .player.skin-8 { --skin-accent: #d6b36a; --skin-accent-2: #b08b46; }
      .full-player {
        --skin-accent: #6c7cff;
        --skin-accent-2: #ff4f9a;
        --skin-text: #fff;
        --skin-muted: rgba(255,255,255,.6);
      }
      .full-player .full-title h2 { color: var(--skin-text); }
      .full-player .full-title p,
      .full-player .full-kicker { color: var(--skin-muted); }
      .full-player .full-controls .icon-btn.play,
      .full-player .full-viz-switch button.active {
        background: linear-gradient(135deg, var(--skin-accent), var(--skin-accent-2));
      }
      .full-player .viz-bars span,
      .full-player .viz-wave span,
      .full-player .viz-dots span,
      .full-player .viz-spectrum span,
      .full-player .viz-mirror span,
      .full-player .viz-blocks span {
        background: linear-gradient(to top, var(--skin-accent), var(--skin-accent-2));
      }
      .full-viz .viz-pulse i { width: 84px; height: 84px; }
      .full-viz .viz-rings i { width: 112px; height: 112px; }
      .full-viz .viz-rings i:nth-child(2) { width: 86px; height: 86px; }
      .full-viz .viz-rings i:nth-child(3) { width: 60px; height: 60px; }
      .full-viz .viz-pulse b, .full-viz .viz-rings b { width: 16px; height: 16px; }
      .full-player.skin-1 { --skin-accent: #6c7cff; --skin-accent-2: #ff4f9a; }
      .full-player.skin-2 { --skin-accent: #7c8cff; --skin-accent-2: #4fd1ff; }
      .full-player.skin-2 .full-shade {
        background:
          radial-gradient(circle at 20% 0%, rgba(79,209,255,.18), transparent 40%),
          linear-gradient(180deg, rgba(4,8,20,.45), rgba(4,8,20,.9));
      }
      .full-player.skin-3 {
        --skin-accent: #f2b35e; --skin-accent-2: #ff7a59;
        --skin-text: #fff7ea; --skin-muted: rgba(255,247,234,.6);
      }
      .full-player.skin-3 .full-title h2 { font-family: Georgia, "Times New Roman", serif; }
      .full-player.skin-3 .full-bg { filter: blur(40px) brightness(.3) sepia(.55) saturate(1.2); }
      .full-player.skin-3 .player-cover.big {
        border-radius: 50%;
        box-shadow: 0 0 0 14px rgba(0,0,0,.55), 0 0 0 18px rgba(255,255,255,.1), 0 30px 70px rgba(0,0,0,.55);
      }
      .full-player.skin-4 {
        --skin-accent: #8be9fd; --skin-accent-2: #c084fc;
        --skin-muted: rgba(255,255,255,.66);
      }
      .full-player.skin-4 .full-shade {
        background: linear-gradient(180deg, rgba(20,28,40,.35), rgba(10,15,25,.68));
      }
      .full-player.skin-4 .full-viz,
      .full-player.skin-4 .round-btn,
      .full-player.skin-4 .full-controls .icon-btn {
        backdrop-filter: blur(16px); background: rgba(255,255,255,.12);
      }
      .full-player.skin-5 {
        --skin-accent: #ff3df2; --skin-accent-2: #39e7ff;
        --skin-text: #f5f3ff; --skin-muted: rgba(245,243,255,.62);
      }
      .full-player.skin-5 .full-shade {
        background:
          radial-gradient(circle at 80% 0%, rgba(255,61,242,.2), transparent 40%),
          linear-gradient(180deg, rgba(3,0,10,.5), rgba(3,0,10,.94));
      }
      .full-player.skin-5 .full-viz {
        border: 1px solid rgba(255,61,242,.55);
        box-shadow: 0 0 24px rgba(255,61,242,.22), inset 0 0 24px rgba(57,231,255,.08);
      }
      .full-player.skin-5 .full-title h2 {
        text-transform: uppercase; letter-spacing: .04em;
        text-shadow: 0 0 18px rgba(255,61,242,.65);
      }
      .full-player.skin-5 .full-viz-switch button.active {
        box-shadow: 0 0 14px rgba(255,61,242,.6);
      }
      .full-player.skin-6 {
        --skin-accent: #111827; --skin-accent-2: #6b7280;
        --skin-text: #111827; --skin-muted: rgba(17,24,39,.55);
        background: #f4efe7;
      }
      .full-player.skin-6 .full-bg { display: none; }
      .full-player.skin-6 .full-shade { background: linear-gradient(180deg, #f8f4ed, #eee7dc); }
      .full-player.skin-6 .round-btn,
      .full-player.skin-6 .full-viz-switch button,
      .full-player.skin-6 .full-modes .mode-btn,
      .full-player.skin-6 .full-modes select,
      .full-player.skin-6 .sync-btn {
        color: #111827; border-color: rgba(17,24,39,.18);
        background: rgba(17,24,39,.04);
      }
      .full-player.skin-6 .full-viz { background: rgba(17,24,39,.05); border-color: rgba(17,24,39,.1); }
      .full-player.skin-6 .full-controls .icon-btn {
        background: rgba(17,24,39,.06); border-color: rgba(17,24,39,.16); color: #111827;
      }
      .full-player.skin-6 .full-controls .volume-control,
      .full-player.skin-6 .volume-toggle,
      .full-player.skin-6 .lyrics-sync,
      .full-player.skin-6 .times { color: rgba(17,24,39,.65); }
      .full-player.skin-6 .lyrics-sync b { color: #111827; }
      .full-player.skin-6 .player-cover.big { border-radius: 6px; }
      .full-player.skin-7 {
        --skin-accent: #37d39a; --skin-accent-2: #6c7cff;
        --skin-text: #f2fff9; --skin-muted: rgba(242,255,249,.62);
      }
      .full-player.skin-7 .full-shade {
        background: linear-gradient(135deg, rgba(55,211,154,.18), rgba(108,124,255,.18) 45%, rgba(255,79,154,.15));
        background-size: 200% 200%;
        animation: auroraShift 12s ease-in-out infinite alternate;
      }
      @keyframes auroraShift {
        from { background-position: 0% 50%; }
        to { background-position: 100% 50%; }
      }
      .full-player.skin-8 {
        --skin-accent: #d6b36a; --skin-accent-2: #b08b46;
        --skin-text: #f2efe8; --skin-muted: rgba(242,239,232,.6);
      }
      .full-player.skin-8 .full-title h2 {
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        letter-spacing: -.02em;
      }
      .full-player.skin-8 .full-shade {
        background: linear-gradient(180deg, rgba(18,18,18,.6), rgba(8,8,8,.96));
      }
      .full-player.skin-8 .player-cover.big { border-radius: 8px; }
      .full-player.skin-8 .full-viz { border: 1px solid rgba(214,179,106,.35); }

      .viz { position: relative; }
      .viz-dots { gap: 7px; align-items: center; }
      .viz-dots span {
        width: 7px; height: 7px; border-radius: 50%;
        animation: dotPulse 1.1s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.08s);
      }
      @keyframes dotPulse {
        from { transform: scale(.55); opacity: .5; }
        to { transform: scale(1.35); opacity: 1; }
      }
      .viz-pulse, .viz-rings { align-items: center; justify-content: center; }
      .viz-pulse i, .viz-rings i {
        position: absolute; border-radius: 50%; border: 2px solid rgba(108,124,255,.55);
        width: 56px; height: 56px; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        animation: ringPulse 2.2s ease-out infinite;
      }
      .viz-pulse i:nth-child(2) { animation-delay: .45s; border-color: rgba(255,79,154,.45); }
      .viz-pulse i:nth-child(3) { animation-delay: .9s; }
      .viz-pulse i:nth-child(4) { animation-delay: 1.35s; border-color: rgba(255,79,154,.3); }
      .viz-pulse b, .viz-rings b {
        width: 12px; height: 12px; border-radius: 50%;
        background: linear-gradient(135deg, #6c7cff, #ff4f9a);
      }
      @keyframes ringPulse {
        0% { opacity: .8; transform: translate(-50%, -50%) scale(.35); }
        80%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(4.2); }
      }
      .viz-rings i {
        border-color: transparent; border-top-color: #6c7cff;
        animation: ringSpin 2.8s linear infinite;
        width: 70px; height: 70px;
      }
      .viz-rings i:nth-child(2) { width: 54px; height: 54px; border-top-color: #ff4f9a; animation-duration: 4.2s; animation-direction: reverse; }
      .viz-rings i:nth-child(3) { width: 38px; height: 38px; border-top-color: #37d39a; animation-duration: 5.6s; }
      @keyframes ringSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
      .viz-spectrum, .viz-mirror { display: flex; flex-direction: column; gap: 3px; }
      .viz-spectrum > div, .viz-mirror > div {
        display: flex; align-items: flex-end; gap: 3px; height: 50%; width: 100%;
      }
      .viz-spectrum .mirror, .viz-mirror .flip { transform: scaleY(-1); }
      .viz-spectrum span, .viz-mirror span {
        flex: 1; height: var(--h); border-radius: 3px;
        transform-origin: bottom; animation: barDance 1.15s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.05s); opacity: .85;
      }
      .viz-rain span {
        position: absolute; top: -22%; width: 3px; height: 18%;
        left: var(--x); border-radius: 2px;
        background: linear-gradient(to bottom, rgba(108,124,255,0), #6c7cff);
        animation: rainFall 1.45s linear infinite;
        animation-delay: var(--d);
      }
      @keyframes rainFall {
        from { transform: translateY(0); opacity: 0; }
        20% { opacity: .9; }
        to { transform: translateY(760%); opacity: 0; }
      }
      .viz-blocks span {
        flex: 1; height: var(--h); border-radius: 4px;
        transform-origin: bottom;
        animation: blockJump .9s ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.05s);
      }
      @keyframes blockJump {
        from { transform: scaleY(.55); opacity: .55; }
        to { transform: scaleY(1); opacity: 1; }
      }
      @media (max-width: 720px) {
        .shell { padding: 18px 14px 50px; }
        .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .brand p { display: none; }
        h1 { font-size: 21px; }
        .speaker-toolbar { flex-direction: column; align-items: stretch; }
        .viz-switch { align-self: flex-start; }
        .players { grid-template-columns: 1fr; }
        .player-head { align-items: flex-start; }
        .player-cover { width: 88px; height: 88px; border-radius: 20px; }
        .player-meta h3 { font-size: 19px; }
        .eq-select { max-width: none; width: 100%; }
        .player.full { padding: 18px; }
        .player.full .player-head { flex-direction: column; }
        .player.full .player-cover.big { width: 100%; height: auto; aspect-ratio: 1; }
        .player.full .player-meta h3 { font-size: 22px; }
        .lyrics-prev { font-size: 11px; }
        .lyrics-current { font-size: 19px; }
        .lyrics-next { font-size: 12px; }
        .lyrics-countdown { font-size: 10px; min-width: 28px; }
        .full-content { padding: 16px; }
        .full-main { grid-template-columns: 1fr; gap: 14px; }
        .full-player .player-cover.big { max-width: 380px; margin: 0 auto; }
        .full-title h2 { font-size: 22px; }
        .full-viz { height: 110px; }
        .music-hub { padding: 14px; border-radius: 20px; }
        .music-hub-head { flex-direction: column; align-items: stretch; }
        .music-hub-head select { max-width: none; }
        .music-search-bar { flex-direction: column; }
        .music-content { max-height: 320px; }
        .track-duration { display: none; }
        .playlist-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `;
  }
}

if (!customElements.get("yahome-hub-panel")) {
  customElements.define("yahome-hub-panel", YaHomeHubPanel);
}

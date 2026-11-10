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
    this._fullPlayer = null;
    this._showLyrics = true;
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
    if (this.shadowRoot && this.shadowRoot.activeElement) {
      const tag = this.shadowRoot.activeElement.tagName;
      if (tag === "SELECT" || tag === "INPUT") return;
    }
    clearTimeout(this._stateTimer);
    this._stateTimer = setTimeout(() => this._updatePlayerDom(), 220);
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
        ${this._renderSpeakerPlayer(speaker, true)}
      </div>
    </div>`;
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
      return this._renderSpeakerPlayers(data.speakers || []);
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

  _renderSpeakerPlayers(speakers) {
    const withEntity = speakers.filter(
      (speaker) => speaker.entity_id && this._hass.states[speaker.entity_id]
    );
    const viz = [
      ["bars", "Спектр", "mdi:equalizer"],
      ["wave", "Волна", "mdi:sine-wave"],
      ["orbit", "Орбита", "mdi:orbit"],
    ];
    if (!speakers.length) {
      return `<div class="empty">Колонки не найдены. Проверьте cookies и токен в настройках интеграции.</div>`;
    }
    return `
      <div class="speakers-section">
        <div class="speaker-toolbar">
          <div>
            <h3>Колонки</h3>
            <p class="muted">Обложка, трек, перемотка, громкость и эквалайзер — прямо здесь.</p>
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
    if (!lyrics) return { current: "", next: "" };
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
          (match[3] ? Number(match[3]) / (match[3].length === 2 ? 100 : 1000) : 0);
        timed.push({ seconds, text: match[4].trim() });
      } else if (!line.startsWith("[")) {
        plain.push(line);
      }
    }
    if (timed.length) {
      let index = 0;
      for (let i = 0; i < timed.length; i += 1) {
        if (timed[i].seconds <= position) index = i;
      }
      return {
        current: timed[index]?.text || "",
        next: timed[index + 1]?.text || "",
      };
    }
    if (plain.length) {
      const index = Math.floor((Number(position) || 0) / 4) % plain.length;
      return { current: plain[index], next: plain[index + 1] || "" };
    }
    return { current: "", next: "" };
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
    const eqEntity = speaker.equalizer_entity
      ? this._hass.states[speaker.equalizer_entity]
      : null;
    const eqOptions = eqEntity ? eqEntity.attributes.options || [] : [];
    const eqValue = eqEntity ? eqEntity.state : "";
    const lyrics = full ? this._lyricsFor(speaker) : "";
    const lyric = full
      ? this._lyricLines(lyrics, position + this._lyricsOffset)
      : { current: "", next: "" };
    return `
      <article class="player ${full ? "full" : ""} ${playing ? "playing" : ""} ${
      paused ? "paused" : ""
    }" data-player="${this._esc(speaker.id)}" data-player-entity="${this._esc(
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
                      <div class="lyrics-current" data-lyrics-current>${this._esc(
                        lyric.current
                      )}</div>
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
            ${
              eqOptions.length
                ? `<select class="eq-select" data-eq-entity="${this._esc(
                    speaker.equalizer_entity
                  )}" title="Эквалайзер">
                    ${eqOptions
                      .map(
                        (option) =>
                          `<option value="${this._esc(option)}" ${
                            option === eqValue ? "selected" : ""
                          }>${this._esc(this._eqLabel(option))}</option>`
                      )
                      .join("")}
                  </select>`
                : ""
            }
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
        </div>
      </article>`;
  }

  _updatePlayerDom() {
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
        if (Number(volumeInput.value) !== volume) volumeInput.value = volume;
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
      if (el.classList.contains("full") && this._showLyrics) {
        const lyrics = this._lyricsFor(speaker);
        const line = this._lyricLines(lyrics, position + this._lyricsOffset);
        const currentLine = el.querySelector("[data-lyrics-current]");
        const nextLine = el.querySelector("[data-lyrics-next]");
        if (currentLine && currentLine.textContent !== line.current) {
          currentLine.textContent = line.current;
        }
        if (nextLine && nextLine.textContent !== line.next) {
          nextLine.textContent = line.next;
        }
      }
    });
    this._startTicker();
  }

  _renderViz(playing) {
    if (this._viz === "wave") {
      return `<div class="viz viz-wave">${Array.from(
        { length: 24 },
        (_, i) =>
          `<span style="--i:${i};--h:${18 + ((i * 29) % 70)}%"></span>`
      ).join("")}</div>`;
    }
    if (this._viz === "orbit") {
      return `<div class="viz viz-orbit"><i></i><i></i><i></i><b></b></div>`;
    }
    return `<div class="viz viz-bars">${Array.from(
      { length: 42 },
      (_, i) =>
        `<span style="--i:${i};--h:${16 + ((i * 37) % 78)}%"></span>`
    ).join("")}</div>`;
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
    this._ticker = setInterval(() => this._tick(), 250);
  }

  _tick() {
    const root = this.shadowRoot;
    if (!root || !this._hass) return;
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
    const current = player.querySelector("[data-lyrics-current]");
    const next = player.querySelector("[data-lyrics-next]");
    if (current && current.textContent !== line.current) {
      current.textContent = line.current;
    }
    if (next && next.textContent !== line.next) {
      next.textContent = line.next;
    }
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
    root.querySelectorAll("[data-open-player]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this._fullPlayer = el.getAttribute("data-open-player");
        this._showLyrics = true;
        this._render();
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
    root.querySelectorAll("[data-tab]").forEach((el) => {
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
    root.querySelectorAll("[data-volume-entity]").forEach((el) => {
      el.addEventListener("input", () => {
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
      .speaker-toolbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
      .speaker-toolbar h3 { margin: 0 0 4px; font-size: 17px; }
      .viz-switch {
        display: flex; gap: 3px; padding: 4px; border: 1px solid var(--divider-color, #e4e7ec);
        background: var(--card-background-color, #fff); border-radius: 14px; flex: none;
      }
      .viz-switch button {
        display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent;
        color: var(--secondary-text-color, #667085); border-radius: 10px; padding: 7px 9px;
        font: inherit; font-size: 11px; cursor: pointer;
      }
      .viz-switch button ha-icon { --mdc-icon-size: 15px; }
      .viz-switch button.active { background: var(--primary-color, #5b6cff); color: #fff; }
      .players { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
      .player {
        position: relative; overflow: hidden; border-radius: 24px; padding: 18px;
        border: 1px solid var(--divider-color, #e4e7ec); background: var(--card-background-color, #fff);
        isolation: isolate;
      }
      .player-bg {
        position: absolute; inset: -25%; z-index: -2; background-image: var(--cover);
        background-size: cover; background-position: center; filter: blur(38px) saturate(1.4);
        opacity: .22; transform: scale(1.15);
      }
      .player-glow {
        position: absolute; inset: 0; z-index: -1; pointer-events: none;
        background: linear-gradient(135deg, rgba(91, 108, 255, .16), rgba(255, 79, 154, .12));
      }
      .player-content { position: relative; display: flex; flex-direction: column; gap: 12px; }
      .player-head { display: flex; align-items: center; gap: 14px; }
      .player-cover {
        position: relative; width: 84px; height: 84px; flex: none; border-radius: 20px; overflow: hidden;
        display: grid; place-items: center; color: #fff; font-size: 34px;
        background: linear-gradient(135deg, #5b6cff, #8f43ff 55%, #ff4f9a);
        box-shadow: 0 14px 28px rgba(16, 24, 40, .18);
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
        margin: 4px 0; font-size: 17px; line-height: 1.25;
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
        position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 24px 22px;
        background: linear-gradient(to top, rgba(5,6,15,.92), rgba(5,6,15,.1) 80%, transparent);
        text-align: center; pointer-events: none;
      }
      .lyrics-current {
        color: #fff; font-size: 25px; line-height: 1.25; font-weight: 700;
        text-shadow: 0 2px 16px rgba(0,0,0,.85);
      }
      .lyrics-next {
        color: rgba(255,255,255,.68); font-size: 15px; line-height: 1.3;
        margin-top: 7px; text-shadow: 0 2px 12px rgba(0,0,0,.8);
      }
      .viz {
        height: 58px; display: flex; align-items: flex-end; justify-content: center; gap: 3px;
        padding: 8px 10px; border-radius: 14px; overflow: hidden;
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
      .player-controls .icon-btn { width: 38px; height: 38px; border-radius: 12px; }
      .player-controls .icon-btn.play {
        width: 46px; height: 46px; border-radius: 15px; border-color: transparent;
        background: linear-gradient(135deg, #5b6cff, #ff4f9a); color: #fff;
        box-shadow: 0 8px 18px rgba(91, 108, 255, .3);
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
      @media (max-width: 720px) {
        .shell { padding: 18px 14px 50px; }
        .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .brand p { display: none; }
        h1 { font-size: 21px; }
        .speaker-toolbar { flex-direction: column; align-items: stretch; }
        .viz-switch { align-self: flex-start; }
        .players { grid-template-columns: 1fr; }
        .player-head { align-items: flex-start; }
        .player-cover { width: 68px; height: 68px; border-radius: 16px; }
        .eq-select { max-width: none; width: 100%; }
        .player.full { padding: 18px; }
        .player.full .player-head { flex-direction: column; }
        .player.full .player-cover.big { width: 100%; height: auto; aspect-ratio: 1; }
        .player.full .player-meta h3 { font-size: 22px; }
        .lyrics-current { font-size: 19px; }
        .lyrics-next { font-size: 13px; }
      }
    `;
  }
}

if (!customElements.get("yahome-hub-panel")) {
  customElements.define("yahome-hub-panel", YaHomeHubPanel);
}

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
    this._unsub = null;
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
  }

  async _subscribe() {
    if (!this._hass || this._unsub) return;
    this._unsub = this._hass.connection.subscribeEvents(
      () => this._load(),
      "yahome_hub_updated"
    );
  }

  async _load() {
    if (!this._hass) return;
    try {
      this._error = null;
      this._data = await this._hass.callWS({ type: "yahome_hub/devices" });
    } catch (err) {
      this._error = err && err.message ? err.message : String(err);
    }
    this._loading = false;
    this._render();
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
        ${this._error ? `<div class="error">${this._esc(this._error)}</div>` : ""}
        ${this._loading && !data ? this._renderLoading() : ""}
        ${
          data
            ? selected
              ? this._renderDetail(selected)
              : this._renderDashboard(devices)
            : ""
        }
        ${data ? this._renderScenarios(data.scenarios) : ""}
        ${data && !selected ? this._renderSpeakers(data.speakers) : ""}
        ${this._toast ? `<div class="toast">${this._esc(this._toast)}</div>` : ""}
      </div>
    `;
    this._attachEvents();
  }

  _renderHeader(counts) {
    return `
      <header class="top">
        <div class="brand">
          <div class="logo">
            <ha-icon icon="mdi:home-automation"></ha-icon>
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
          <span>${this._esc(prop.name)}</span>
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

  _renderSpeakers(speakers) {
    if (!speakers || !speakers.length) return "";
    return `<div class="section"><h3>Колонки</h3><div class="speakers">${speakers
      .map((speaker) => {
        const iotId = speaker.iot_id || "";
        const volume =
          speaker.volume !== null && speaker.volume !== undefined
            ? speaker.volume
            : 0;
        const on = speaker.on === true;
        return `
          <div class="speaker">
            <div class="speaker-head">
              <div class="device-icon" style="--accent:#ff6b6b"><ha-icon icon="mdi:speaker"></ha-icon></div>
              <div>
                <strong>${this._esc(speaker.name)}</strong>
                <small>${this._esc(speaker.platform || "Яндекс Станция")}</small>
              </div>
              ${
                iotId
                  ? `<button class="power ${on ? "on" : ""}" data-speaker-power="${this._esc(
                      iotId
                    )}" title="Вкл/выкл"><ha-icon icon="mdi:power"></ha-icon></button>`
                  : ""
              }
            </div>
            ${
              iotId
                ? `<div class="control-label sub"><span>Громкость</span><span>${volume}%</span></div>
                   <input type="range" min="0" max="100" step="1" value="${volume}" data-speaker-volume="${this._esc(
                     iotId
                   )}" />`
                : `<p class="muted">Нет связанного IoT-устройства для управления громкостью.</p>`
            }
          </div>`;
      })
      .join("")}</div></div>`;
  }

  _attachEvents() {
    const root = this.shadowRoot;
    if (!root) return;
    root.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = el.getAttribute("data-action");
        if (action === "refresh") this._refresh();
        if (action === "export") this._export();
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
    root.querySelectorAll("[data-speaker-volume]").forEach((el) => {
      el.addEventListener("change", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-speaker-volume")
        );
        if (!device) return;
        this._action(
          device,
          { type: "devices.capabilities.volume", instance: "volume" },
          Number(el.value)
        );
      });
    });
    root.querySelectorAll("[data-speaker-power]").forEach((el) => {
      el.addEventListener("click", () => {
        const device = this._data.devices.find(
          (item) => item.id === el.getAttribute("data-speaker-power")
        );
        if (!device) return;
        this._action(
          device,
          { type: "devices.capabilities.on_off", instance: "on" },
          !this._isOn(device)
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
        width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center;
        color: white; font-size: 28px;
        background: linear-gradient(135deg, #5b6cff 0%, #8f43ff 55%, #ff4f9a 100%);
        box-shadow: 0 12px 30px rgba(91, 108, 255, .28);
      }
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
      }
    `;
  }
}

if (!customElements.get("yahome-hub-panel")) {
  customElements.define("yahome-hub-panel", YaHomeHubPanel);
}

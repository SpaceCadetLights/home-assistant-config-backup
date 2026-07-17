/**
 * Space Cadets — custom Home Assistant panel
 * Visual target: neon glass mission-control HUD over a James Webb deep-field.
 *
 * Groupings mirror the real LaunchPad dashboards:
 *   Quick Deploy  -> light.build_space_lights, light.workshop_lights,
 *                    light.lounge_lights, cover.smart_blinds
 *   Areas         -> Build Space / Lounge / Stage / Art-WLED / Workshop / Bathroom / Exterior
 * Individual devices are the switch.* entities the physical setup uses;
 * group masters are the light.* group entities. PA Speakers is audio, not a light.
 */
class SpaceCadetsPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._tab = "overview";
    this._root = null;
    this._tick = null;
    this._mediaPlayer = null; // locked player when auto-follow is off
    this._mediaAuto = true;   // scan all sources and promote whatever is playing
    this._modalOpen = false;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._mount();
    else this._paint();
  }

  set narrow(n) {
    this._narrow = n;
    if (this._root) this._root.classList.toggle("narrow", !!n);
  }

  connectedCallback() {
    if (!this._tick) this._tick = setInterval(() => this._paintClock(), 1000);
  }

  disconnectedCallback() {
    if (this._tick) clearInterval(this._tick);
    this._tick = null;
  }

  /* ---------- state helpers ---------- */
  _s(id) { return this._hass?.states?.[id]; }
  _state(id, fb = "unknown") { return this._s(id)?.state ?? fb; }
  _attr(id, key, fb = "") { return this._s(id)?.attributes?.[key] ?? fb; }
  _name(id) { return this._attr(id, "friendly_name", id.split(".")[1] || id); }
  _avail(id) { const st = this._state(id); return st !== "unavailable" && st !== "unknown"; }

  _on(id) {
    const st = this._state(id);
    return ["on", "home", "playing", "open", "opening"].includes(st);
  }

  _pct(id) {
    const st = this._s(id);
    if (!st) return "—";
    if (st.state === "off") return "OFF";
    if (st.state === "unavailable") return "N/A";
    const bri = st.attributes?.brightness;
    if (bri != null) return `${Math.round((bri / 255) * 100)}%`;
    if (st.state === "on") return "ON";
    return st.state.toUpperCase();
  }

  /* ---------- service calls ---------- */
  _call(domain, service, data = {}, target = {}) {
    if (!this._hass) return;
    this._hass.callService(domain, service, data, target);
  }

  _toggle(entityId) {
    const domain = entityId.split(".")[0];
    if (domain === "cover") {
      const open = ["open", "opening"].includes(this._state(entityId));
      this._call("cover", open ? "close_cover" : "open_cover", {}, { entity_id: entityId });
      return;
    }
    if (domain === "assist_satellite") return; // no-op toggle
    this._call(domain, "toggle", {}, { entity_id: entityId });
  }

  _turn(entityId, on) {
    const domain = entityId.split(".")[0];
    this._call(domain, on ? "turn_on" : "turn_off", {}, { entity_id: entityId });
  }

  _script(entityId) { this._call("script", "turn_on", {}, { entity_id: entityId }); }

  _selectOption(entityId, option) {
    this._call("select", "select_option", { option }, { entity_id: entityId });
  }
  _setNumber(entityId, value) {
    this._call("number", "set_value", { value: Number(value) }, { entity_id: entityId });
  }
  _mediaSvc(service, extra = {}) {
    const p = this._activePlayer();
    if (!p) return;
    this._call("media_player", service, extra, { entity_id: p });
  }

  /* ---------- media (adaptive: scan all sources) ---------- */
  _allMediaIds() {
    const states = this._hass?.states || {};
    return Object.keys(states)
      .filter((id) => id.startsWith("media_player."))
      .sort();
  }

  _mediaHasContent(id) {
    const st = this._s(id);
    if (!st) return false;
    const a = st.attributes || {};
    return !!(a.media_title || a.media_artist || a.media_album_name || a.entity_picture || a.app_name);
  }

  _mediaScore(id) {
    const st = this._s(id);
    if (!st || st.state === "unavailable" || st.state === "unknown") return -1;
    let score = 0;
    if (st.state === "playing") score += 1000;
    else if (st.state === "paused") score += 600;
    else if (st.state === "idle" || st.state === "on") score += 50;
    else if (st.state === "off") score += 5;
    if (this._mediaHasContent(id)) score += 200;
    const a = st.attributes || {};
    if (a.entity_picture) score += 40;
    if (a.media_title) score += 30;
    if (a.app_name) score += 10;
    // Prefer Music Assistant / AirPlay queue players when tied
    if (a.source === "Music Assistant Queue") score += 15;
    // Slightly prefer named destinations over anonymous appletv twins
    if (!/_2$|_airplay$/.test(id) || /mission_control|mona|scarlett|projector|spotify|homepod|airport/i.test(id)) score += 5;
    return score;
  }

  _mediaInfo(id) {
    const st = this._s(id);
    if (!st) {
      return { id: null, name: "—", state: "idle", title: "Nothing playing", artist: "", album: "", art: "", app: "", source: "", playing: false, paused: false, volPct: null, muted: false, pos: null, dur: null };
    }
    const a = st.attributes || {};
    const title = a.media_title || (this._mediaHasContent(id) ? this._name(id) : "Nothing playing");
    const artist = a.media_artist || a.media_series_title || "";
    const album = a.media_album_name || a.media_channel || "";
    const vol = a.volume_level;
    return {
      id,
      name: this._name(id),
      state: st.state,
      title,
      artist,
      album,
      art: a.entity_picture || "",
      app: a.app_name || "",
      source: a.source || "",
      playing: st.state === "playing",
      paused: st.state === "paused",
      volPct: vol != null ? Math.round(vol * 100) : null,
      muted: !!a.is_volume_muted,
      pos: a.media_position != null ? Number(a.media_position) : null,
      dur: a.media_duration != null ? Number(a.media_duration) : null,
    };
  }

  _fmtTime(sec) {
    if (sec == null || Number.isNaN(sec)) return "—";
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  _activeSources() {
    return this._allMediaIds()
      .filter((id) => {
        const st = this._state(id);
        return st === "playing" || st === "paused" || (this._mediaHasContent(id) && st !== "unavailable" && st !== "off");
      })
      .sort((a, b) => this._mediaScore(b) - this._mediaScore(a));
  }

  _mediaDestinations() {
    // Manual picker: available, useful destinations (not every unavailable twin)
    const preferred = [
      "media_player.spotify_etcetre",
      "media_player.mission_control_airplay",
      "media_player.mission_control",
      "media_player.jared_s_macbook_pro",
      "media_player.isaacs_macbook_pro",
      "media_player.bathroom_homepod_2",
      "media_player.bathroom_homepod",
      "media_player.projector_airplay",
      "media_player.projector",
      "media_player.home_assistant_voice_0aab68",
      "media_player.home_assistant_voice_0aab68_media_player",
      "media_player.scarlett",
      "media_player.space_cadets_airport",
      "media_player.airplay1_2",
      "media_player.the_portal",
    ];
    const seen = new Set();
    const out = [];
    for (const id of preferred) {
      if (!this._s(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    // Also surface any currently-active source not already listed
    for (const id of this._activeSources()) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  _activePlayer() {
    // Auto-follow: promote the strongest live source house-wide
    if (this._mediaAuto) {
      const ranked = this._allMediaIds()
        .map((id) => [id, this._mediaScore(id)])
        .filter(([, sc]) => sc > 0)
        .sort((a, b) => b[1] - a[1]);
      if (ranked.length) return ranked[0][0];
      return this._mediaDestinations().find((id) => this._avail(id)) || null;
    }
    if (this._mediaPlayer && this._s(this._mediaPlayer)) return this._mediaPlayer;
    return this._mediaDestinations().find((id) => this._avail(id)) || null;
  }

  _renderPlayerCard(info, { compact = false } = {}) {
    const progress =
      info.dur && info.dur > 0 && info.pos != null
        ? Math.min(100, Math.round((info.pos / info.dur) * 100))
        : null;
    const subBits = [info.artist, info.album, info.app, info.source].filter(Boolean);
    return `
      <div class="sc-player ${compact ? "compact" : ""} ${info.playing ? "live" : ""}">
        <div class="sc-player-art" style="${info.art ? `background-image:url('${info.art}')` : ""}">
          ${info.art ? "" : "♫"}
        </div>
        <div class="sc-player-body">
          <div class="sc-player-name">
            ${info.name || "—"} · <em>${(info.state || "idle").toUpperCase()}</em>
            ${this._mediaAuto ? `<span class="sc-auto-tag">AUTO</span>` : `<span class="sc-auto-tag locked">LOCKED</span>`}
          </div>
          <div class="sc-player-track">${info.title}</div>
          <div class="sc-player-artist">${subBits.join(" · ") || "No media metadata"}</div>

          <div class="sc-transport big-row">
            <button data-act="media" data-service="media_previous_track" title="Previous">⏮</button>
            <button class="big" data-act="media" data-service="${info.playing ? "media_pause" : "media_play"}" title="Play/Pause">${info.playing ? "⏸" : "▶"}</button>
            <button data-act="media" data-service="media_next_track" title="Next">⏭</button>
            <button data-act="media" data-service="media_stop" title="Stop">⏹</button>
            <button data-act="media" data-service="volume_mute" data-mute="${info.muted ? "0" : "1"}" title="Mute">${info.muted ? "🔇" : "🔈"}</button>
          </div>

          <div class="sc-vol">
            <span>VOL</span>
            <input type="range" class="sc-slider" min="0" max="100" step="1" value="${info.volPct ?? 0}" data-act="volume" data-entity="${info.id || ""}" ${info.volPct == null ? "disabled" : ""}>
            <em>${info.volPct != null ? info.volPct + "%" : "—"}</em>
          </div>

          ${
            progress != null
              ? `<div class="sc-progress"><div class="sc-progress-bar" style="width:${progress}%"></div>
                 <div class="sc-progress-times"><span>${this._fmtTime(info.pos)}</span><span>${this._fmtTime(info.dur)}</span></div></div>`
              : ""
          }
        </div>
      </div>`;
  }

  /* ---------- mount ---------- */
  _mount() {
    this.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "sc-app" + (this._narrow ? " narrow" : "");
    wrap.innerHTML = `
      <style>${SpaceCadetsPanel.styles}</style>
      <aside class="sc-nav">
        <div class="sc-brand">
          <div class="sc-planet"></div>
          <div>
            <div class="sc-brand-title">SPACE CADETS</div>
            <div class="sc-brand-sub">MISSION CONTROL</div>
          </div>
        </div>
        <nav class="sc-nav-links">
          ${[
            ["overview", "Overview", "◈"],
            ["lighting", "Lighting", "✦"],
            ["media", "Media", "♫"],
            ["workshop", "Workshop", "⚒"],
            ["system", "System", "⚙"],
          ]
            .map(
              ([id, label, icon]) => `
            <button class="sc-nav-item ${id === this._tab ? "active" : ""}" data-tab="${id}">
              <span class="sc-nav-ico">${icon}</span><span>${label}</span>
            </button>`
            )
            .join("")}
        </nav>
        <div class="sc-nav-foot">
          <div class="sc-monument"></div>
          <p>WE DON'T FOLLOW THE STARS.<br/>WE BUILD THEM.</p>
          <p class="sc-foot-brand">SPACE CADETS</p>
        </div>
      </aside>

      <main class="sc-main">
        <header class="sc-top">
          <div class="sc-greet">
            <div class="sc-greet-line" id="sc-greet">—</div>
            <div class="sc-greet-sub" id="sc-greet-sub">LAUNCHPAD</div>
          </div>
          <div class="sc-top-meta">
            <div class="sc-meta-block">
              <div class="sc-meta-label">LOCAL TIME</div>
              <div class="sc-meta-value" id="sc-clock">--</div>
            </div>
            <div class="sc-meta-block">
              <div class="sc-meta-label">HOME STATUS</div>
              <div class="sc-meta-value ok" id="sc-status"><span class="sc-dot"></span> NOMINAL</div>
            </div>
            <button class="sc-meta-block sc-crew-btn" id="sc-crew-btn">
              <div class="sc-meta-label">CREW · TAP FOR DETAIL</div>
              <div class="sc-meta-value" id="sc-crew">--</div>
            </button>
          </div>
        </header>

        <div class="sc-studiobar glass" id="sc-studiobar">
          <div class="sc-studiobar-label">
            <span class="sc-studiobar-ico">✦</span>
            <div>
              <div class="sc-studiobar-title">STUDIO POWER</div>
              <div class="sc-studiobar-sub" id="sc-studiobar-sub">MASTER LIGHTING CONTROL</div>
            </div>
          </div>
          <div class="sc-studiobar-btns">
            <button class="sc-chip on" data-act="script" data-entity="script.studio_all_lights_on">STUDIO ON</button>
            <button class="sc-chip off" data-act="script" data-entity="script.studio_all_lights_off">STUDIO OFF</button>
          </div>
        </div>

        <section class="sc-grid" id="sc-view"></section>
      </main>

      <div class="sc-modal-root" id="sc-modal"></div>
    `;
    this.appendChild(wrap);
    this._root = wrap;

    wrap.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        wrap.querySelectorAll(".sc-nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._paint();
      });
    });
    wrap.querySelector("#sc-crew-btn").addEventListener("click", () => this._openCrew());
    wrap.querySelectorAll("#sc-studiobar [data-act]").forEach((el) =>
      el.addEventListener("click", () => this._script(el.dataset.entity))
    );

    this._paint();
  }

  /* ---------- greeting (intelligent) ---------- */
  _crewIds() {
    return ["person.space_cadets", "person.isaac_norris", "person.jared_lee_lyons"].filter((id) => this._s(id));
  }

  _greeting() {
    const crew = this._crewIds().map((id) => this._s(id));
    const homeCount = crew.filter((s) => s.state === "home").length;
    const total = crew.length;
    const now = Date.now();
    const justArrived = crew.some(
      (s) => s.state === "home" && now - Date.parse(s.last_changed) < 15 * 60 * 1000
    );
    const h = new Date().getHours();
    let tod;
    if (h < 5) tod = "BURNING THE MIDNIGHT OIL";
    else if (h < 12) tod = "GOOD MORNING, SPACE CADET";
    else if (h < 17) tod = "GOOD AFTERNOON, SPACE CADET";
    else if (h < 21) tod = "GOOD EVENING, SPACE CADET";
    else tod = "GOOD NIGHT, SPACE CADET";

    if (total === 0) return { line: tod, sub: "LAUNCHPAD · CREW STATUS UNKNOWN" };
    if (homeCount === 0) {
      return { line: "HOME IS ON STANDBY", sub: "ALL CREW OFF-SITE · SYSTEMS SECURED" };
    }
    if (justArrived) {
      return { line: "WELCOME HOME, SPACE CADET", sub: `${homeCount}/${total} CREW ON SITE · LAUNCHPAD ONLINE` };
    }
    const label = homeCount === total ? "FULL CREW ON SITE" : `${homeCount}/${total} CREW ON SITE`;
    return { line: tod, sub: `${label} · LAUNCHPAD` };
  }

  _locationShort(personId) {
    const st = this._s(personId);
    if (!st) return "";
    if (st.state === "home") return "LaunchPad";
    if (st.state === "not_home" || st.state === "away") return "Away";
    return st.state;
  }

  _geocoded(personId) {
    const map = {
      "person.isaac_norris": "sensor.isaacs_iphone_14_geocoded_location",
      "person.jared_lee_lyons": "sensor.jareds_iphone_geocoded_location",
      "person.space_cadets": "sensor.spaces_macbook_pro_geocoded_location",
    };
    const sid = map[personId];
    if (!sid) return "";
    const v = this._state(sid, "");
    if (!v || v === "unavailable" || v === "unknown") return "";
    return v.replace(/\n+/g, ", ");
  }

  /* ---------- clock + greeting repaint ---------- */
  _paintClock() {
    const el = this.querySelector("#sc-clock");
    if (!el) return;
    const d = new Date();
    el.textContent = d
      .toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
      .toUpperCase();
    const g = this._greeting();
    const gl = this.querySelector("#sc-greet");
    const gs = this.querySelector("#sc-greet-sub");
    if (gl) gl.textContent = g.line;
    if (gs) gs.textContent = g.sub;
  }

  /* ---------- main paint ---------- */
  _paint() {
    if (!this._hass || !this._root) return;
    this._paintClock();

    const crew = this._crewIds();
    const dots = crew.map((id) => (this._state(id) === "home" ? "●" : "○")).join(" ");
    const homeCount = crew.filter((id) => this._state(id) === "home").length;
    const crewEl = this.querySelector("#sc-crew");
    if (crewEl) crewEl.textContent = `${dots}  ${homeCount}/${crew.length}`;

    const statusEl = this.querySelector("#sc-status");
    if (statusEl) {
      const secured = homeCount === 0;
      statusEl.innerHTML = `<span class="sc-dot ${secured ? "amber" : ""}"></span> ${secured ? "SECURED" : "ALL SYSTEMS NOMINAL"}`;
    }

    const sbSub = this.querySelector("#sc-studiobar-sub");
    if (sbSub) {
      const st = this._state("light.studio_lights");
      sbSub.textContent = st === "on" ? "STUDIO ILLUMINATED" : st === "off" ? "STUDIO DARK" : "MASTER LIGHTING CONTROL";
    }

    const active = document.activeElement;
    const view = this.querySelector("#sc-view");
    if (view && !(active && view.contains(active) && ["INPUT", "SELECT"].includes(active.tagName))) {
      if (this._tab === "overview") view.innerHTML = this._htmlOverview();
      else if (this._tab === "lighting") view.innerHTML = this._htmlLighting();
      else if (this._tab === "media") view.innerHTML = this._htmlMedia();
      else if (this._tab === "workshop") view.innerHTML = this._htmlWorkshop();
      else view.innerHTML = this._htmlSystem();
      this._bind(view);
    }

    if (this._modalOpen) this._renderCrew();
  }

  /* ---------- OVERVIEW ---------- */
  _htmlOverview() {
    const player = this._activePlayer();
    const info = this._mediaInfo(player);
    const activeCount = this._activeSources().filter((id) => this._state(id) === "playing").length;

    return `
      <div class="sc-row quick glass">
        <div class="sc-card-title">QUICK CONTROLS</div>
        <div class="sc-quick-grid four">
          ${[
            ["Build Space", "light.build_space_lights"],
            ["Workshop", "light.workshop_lights"],
            ["Lounge", "light.lounge_lights"],
            ["Smart Blinds", "cover.smart_blinds"],
          ]
            .map(
              ([name, entity]) => `
            <button class="sc-quick ${this._on(entity) ? "lit" : ""}" data-act="toggle" data-entity="${entity}">
              <div class="sc-quick-ring"></div>
              <div class="sc-quick-name">${name}</div>
              <div class="sc-quick-pct">${this._pct(entity)}</div>
            </button>`
            )
            .join("")}
        </div>
      </div>

      <div class="sc-col hero glass">
        <div class="sc-hero-bg"></div>
        <div class="sc-hero-overlay">
          <div class="sc-hero-kicker">LAUNCHPAD MAIN FLOOR</div>
          <div class="sc-hero-title">MISSION CONTROL</div>
          <div class="sc-hero-status">
            <span class="sc-dot"></span>
            WORKSHOP ${this._state("binary_sensor.motion_sensor_2_occupancy").toUpperCase()}
            · BLINDS ${this._state("cover.smart_blinds").toUpperCase()}
          </div>
        </div>
      </div>

      <div class="sc-col side glass">
        <div class="sc-card-title">ENVIRONMENT</div>
        <div class="sc-metric">
          <div><span>Workshop Motion</span><strong>${this._state("binary_sensor.motion_sensor_2_occupancy").toUpperCase()}</strong></div>
          <div class="spark s1"></div>
        </div>
        <div class="sc-metric">
          <div><span>Bathroom Motion</span><strong>${this._state("binary_sensor.motion_sensor_1_occupancy").toUpperCase()}</strong></div>
          <div class="spark s2"></div>
        </div>
        <div class="sc-metric">
          <div><span>Smart Blinds</span><strong>${this._state("cover.smart_blinds").toUpperCase()}</strong></div>
          <div class="spark s3"></div>
        </div>
        <div class="sc-card-title" style="margin-top:18px">SYSTEM STATUS</div>
        <ul class="sc-status-list">
          <li><span class="sc-dot"></span> HA Core ${this._state("update.home_assistant_core_update") === "on" ? "· update ready" : "· current"}</li>
          <li><span class="sc-dot"></span> Theme: JWST Deep Field</li>
          <li><span class="sc-dot"></span> Voice: MONA</li>
          <li><span class="sc-dot"></span> Panel: Space Cadets HUD</li>
        </ul>
      </div>

      <div class="sc-row media glass">
        <div class="sc-card-title">NOW PLAYING · ${info.name ? info.name.toUpperCase() : "—"} ${this._mediaAuto ? "· AUTO" : "· LOCKED"}${activeCount > 1 ? ` · ${activeCount} LIVE` : ""}</div>
        <div class="sc-now">
          <div class="sc-art" style="${info.art ? `background-image:url('${info.art}')` : ""}"></div>
          <div class="sc-now-meta">
            <div class="sc-track">${info.title}</div>
            <div class="sc-artist">${[info.artist, info.app || info.source].filter(Boolean).join(" · ") || (info.state || "").toUpperCase()}</div>
            <div class="sc-transport">
              <button data-act="media" data-service="media_previous_track">⏮</button>
              <button class="big" data-act="media" data-service="${info.playing ? "media_pause" : "media_play"}">${info.playing ? "⏸" : "▶"}</button>
              <button data-act="media" data-service="media_next_track">⏭</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sc-row autos glass">
        <div class="sc-card-title">FAVORITE CONTROLS</div>
        ${[
          ["Studio Illuminate", "script.studio_all_lights_on", "script"],
          ["Studio Blackout", "script.studio_all_lights_off", "script"],
          ["Workshop Lights", "light.workshop_lights", "toggle"],
          ["Smart Blinds", "cover.smart_blinds", "toggle"],
        ]
          .map(
            ([label, entity, kind]) => `
          <div class="sc-auto-row">
            <span>${label}</span>
            <button class="sc-toggle ${this._on(entity) ? "on" : ""}" data-act="${kind}" data-entity="${entity}"></button>
          </div>`
          )
          .join("")}
      </div>

      <div class="sc-row mantra glass">
        <div class="sc-astro"></div>
        <p>THE UNIVERSE IS OUR CANVAS.<br/>LIGHT IS OUR LANGUAGE.<br/><strong>WE ARE SPACE CADETS.</strong></p>
      </div>
    `;
  }

  /* ---------- LIGHTING (real area groups) ---------- */
  _htmlLighting() {
    const zones = [
      ["Build Space", "light.build_space_lights", [
        ["switch.desk_leds", "Desk LEDs", "toggle"],
        ["switch.leg_lamp", "Leg Lamp", "toggle"],
        ["switch.red_desk_lamp", "Red Desk Lamp", "toggle"],
      ]],
      ["Lounge", "light.lounge_lights", [
        ["switch.earth", "Earth", "toggle"],
        ["switch.ceiling_fan", "Ceiling Fan", "toggle"],
        ["switch.front_right_lamp", "Front Lamp", "toggle"],
      ]],
      ["Stage", null, [
        ["switch.stage_lights_left", "Stage Left", "toggle"],
        ["switch.stage_lights_right", "Stage Right", "toggle"],
        ["switch.bar_lights", "Bar Lights", "toggle"],
        ["switch.dmx", "DMX", "toggle"],
        ["switch.p_a_speakers", "PA Speakers", "audio"],
      ]],
      ["Art / WLED", "light.trillium", [
        ["select.trillium_color_palette", "Palette", "select"],
        ["select.trillium_preset", "Preset", "select"],
        ["number.trillium_speed", "Speed", "number"],
        ["switch.trillium_sync_send", "Sync Send", "toggle"],
      ]],
      ["Workshop", "light.workshop_lights", [
        ["switch.basement_light", "Basement", "toggle"],
        ["switch.3d_printer_light", "3D Printer", "toggle"],
        ["switch.cnc_table_light", "CNC Table", "toggle"],
        ["switch.laser_station_light", "Laser Station", "toggle"],
        ["switch.paint_booth_light", "Paint Booth", "toggle"],
      ]],
      ["Bathroom", null, [
        ["switch.bathroom_mirror", "Mirror", "toggle"],
      ]],
      ["Exterior", null, [
        ["switch.outdoor_white_lights", "Outdoor Lights", "toggle"],
      ]],
    ];

    return `
      <div class="sc-full glass">
        <div class="sc-card-title">LIGHTING DECK · REAL ZONE GROUPINGS</div>
        <div class="sc-zone-grid">
          ${zones.map(([title, master, ents]) => `
            <div class="sc-zone">
              <div class="sc-zone-head">
                <strong>${title}</strong>
                ${master
                  ? `<button class="sc-chip mini ${this._on(master) ? "on" : ""}" data-act="toggle" data-entity="${master}">ALL · ${this._pct(master)}</button>`
                  : ""}
              </div>
              <div class="sc-zone-ents">
                ${ents.map((e) => this._renderControl(e)).join("")}
              </div>
            </div>`).join("")}
        </div>
      </div>`;
  }

  _renderControl([entity, label, kind]) {
    if (kind === "select") {
      const opts = this._attr(entity, "options", []) || [];
      const cur = this._state(entity);
      return `
        <div class="sc-ctl">
          <span class="sc-ctl-label">${label}</span>
          <select class="sc-select" data-act="select" data-entity="${entity}">
            ${opts.map((o) => `<option ${o === cur ? "selected" : ""} value="${o}">${o}</option>`).join("")}
          </select>
        </div>`;
    }
    if (kind === "number") {
      const min = this._attr(entity, "min", 0);
      const max = this._attr(entity, "max", 100);
      const step = this._attr(entity, "step", 1);
      const val = this._state(entity, min);
      return `
        <div class="sc-ctl">
          <span class="sc-ctl-label">${label}</span>
          <div class="sc-slider-wrap">
            <input type="range" class="sc-slider" min="${min}" max="${max}" step="${step}" value="${val}" data-act="number" data-entity="${entity}">
            <em class="sc-slider-val">${val}</em>
          </div>
        </div>`;
    }
    if (kind === "audio") {
      const on = this._on(entity);
      return `
        <button class="sc-ent audio ${on ? "lit" : ""}" data-act="toggle" data-entity="${entity}">
          <span>🔊 ${label}</span><em>${this._state(entity).toUpperCase()}</em>
        </button>`;
    }
    return `
      <button class="sc-ent ${this._on(entity) ? "lit" : ""}" data-act="toggle" data-entity="${entity}">
        <span>${label}</span><em>${this._pct(entity)}</em>
      </button>`;
  }

  /* ---------- MEDIA (full controls + adaptive auto-follow) ---------- */
  _htmlMedia() {
    const player = this._activePlayer();
    const info = this._mediaInfo(player);
    const dests = this._mediaDestinations();
    const active = this._activeSources().filter((id) => id !== player);
    const spotifyDown = this._state("media_player.spotify_etcetre") === "unavailable";
    const liveCount = this._activeSources().filter((id) => this._state(id) === "playing").length;

    return `
      <div class="sc-full glass">
        <div class="sc-media-head">
          <div>
            <div class="sc-card-title" style="margin:0">MEDIA BAY</div>
            <div class="sc-media-sub">${liveCount ? `${liveCount} SOURCE${liveCount === 1 ? "" : "S"} LIVE` : "SCANNING ALL SOURCES"} · ${this._mediaAuto ? "AUTO-FOLLOW ON" : "MANUAL LOCK"}</div>
          </div>
          <button class="sc-auto-btn ${this._mediaAuto ? "on" : ""}" data-act="media-auto">
            ${this._mediaAuto ? "◉ AUTO FOLLOW" : "○ AUTO FOLLOW"}
          </button>
        </div>

        ${this._renderPlayerCard(info)}

        ${spotifyDown ? `<div class="sc-note">⚠ Native Spotify integration is offline (upstream API bug). Use Music Assistant destinations below — or wait for the HA fix.</div>` : ""}

        ${
          active.length
            ? `<div class="sc-card-title" style="margin-top:22px">OTHER ACTIVE SOURCES</div>
               <div class="sc-active-list">
                 ${active
                   .map((id) => {
                     const i = this._mediaInfo(id);
                     return `<button class="sc-active-row ${i.playing ? "live" : ""}" data-act="pick" data-entity="${id}">
                       <div class="sc-active-art" style="${i.art ? `background-image:url('${i.art}')` : ""}">${i.art ? "" : "♫"}</div>
                       <div class="sc-active-meta">
                         <strong>${i.name}</strong>
                         <span>${i.title}${i.artist ? " · " + i.artist : ""}</span>
                       </div>
                       <em>${i.state.toUpperCase()}</em>
                     </button>`;
                   })
                   .join("")}
               </div>`
            : `<div class="sc-note quiet" style="margin-top:16px">No other sources are currently playing. Primary will auto-switch when something starts.</div>`
        }

        <div class="sc-card-title" style="margin-top:22px">DESTINATIONS · TAP TO LOCK</div>
        <div class="sc-player-pick">
          ${dests
            .map((id) => {
              const st = this._state(id);
              const live = st === "playing";
              return `<button class="sc-pick ${id === player && !this._mediaAuto ? "active" : ""} ${id === player && this._mediaAuto ? "watching" : ""} ${this._avail(id) ? "" : "dim"}" data-act="pick" data-entity="${id}">
                ${this._name(id)}${live ? " ●" : ""}
              </button>`;
            })
            .join("")}
        </div>

        <div class="sc-card-title" style="margin-top:22px">MONA VOICE</div>
        <div class="sc-media-grid">
          <button class="sc-ent ${this._on("switch.home_assistant_voice_0aab68_mute") ? "lit" : ""}" data-act="toggle" data-entity="switch.home_assistant_voice_0aab68_mute">
            <span>Mute MONA</span><em>${this._state("switch.home_assistant_voice_0aab68_mute").toUpperCase()}</em>
          </button>
          <div class="sc-ctl inline">
            <span class="sc-ctl-label">Wake Word</span>
            <select class="sc-select" data-act="select" data-entity="select.home_assistant_voice_0aab68_wake_word">
              ${(this._attr("select.home_assistant_voice_0aab68_wake_word", "options", []) || [])
                .map((o) => `<option ${o === this._state("select.home_assistant_voice_0aab68_wake_word") ? "selected" : ""} value="${o}">${o}</option>`).join("")}
            </select>
          </div>
          <div class="sc-ent"><span>Voice Satellite</span><em>${this._state("assist_satellite.home_assistant_voice_0aab68_assist_satellite").toUpperCase()}</em></div>
          <div class="sc-ent"><span>MONA Speaker</span><em>${this._state("media_player.home_assistant_voice_0aab68_media_player").toUpperCase()}</em></div>
        </div>
      </div>`;
  }

  /* ---------- WORKSHOP ---------- */
  _htmlWorkshop() {
    const lights = [
      ["switch.basement_light", "Basement"],
      ["switch.3d_printer_light", "3D Printer"],
      ["switch.cnc_table_light", "CNC Table"],
      ["switch.laser_station_light", "Laser Station"],
      ["switch.paint_booth_light", "Paint Booth"],
    ];
    const motion = "binary_sensor.motion_sensor_2_occupancy";
    const motionOn = this._on(motion);
    const battery = this._state("sensor.motion_sensor_2_battery", "—");

    return `
      <div class="sc-full glass">
        <div class="sc-card-title">WORKSHOP / ENGINEERING</div>

        <div class="sc-workshop-master">
          <div class="sc-wm-left">
            <div class="sc-wm-title">ALL WORKSHOP LIGHTS</div>
            <div class="sc-wm-sub">Group · ${this._pct("light.workshop_lights")}</div>
          </div>
          <div class="sc-wm-btns">
            <button class="sc-chip on" data-act="turn_on" data-entity="light.workshop_lights">ALL ON</button>
            <button class="sc-chip off" data-act="turn_off" data-entity="light.workshop_lights">ALL OFF</button>
          </div>
        </div>

        <div class="sc-card-title" style="margin-top:20px">INDIVIDUAL STATIONS</div>
        <div class="sc-media-grid three">
          ${lights.map(([e, label]) => `
            <button class="sc-ent ${this._on(e) ? "lit" : ""}" data-act="toggle" data-entity="${e}">
              <span>${label}</span><em>${this._state(e).toUpperCase()}</em>
            </button>`).join("")}
        </div>

        <div class="sc-motion ${motionOn ? "active" : ""}">
          <div class="sc-motion-ico">${motionOn ? "◉" : "○"}</div>
          <div class="sc-motion-body">
            <div class="sc-motion-title">MOTION SENSOR 2 · WORKSHOP</div>
            <div class="sc-motion-state">${motionOn ? "MOTION DETECTED" : "CLEAR — NO MOTION"}</div>
          </div>
          <div class="sc-motion-batt">BATT ${battery}${battery !== "—" ? "%" : ""}</div>
        </div>
        <p class="sc-hint">Motion Sensor 2 drives workshop auto-on · Studio Off can blackout the whole studio.</p>
      </div>`;
  }

  /* ---------- SYSTEM ---------- */
  _htmlSystem() {
    const upd = (id) => (this._state(id) === "on" ? "UPDATE READY" : "CURRENT");
    return `
      <div class="sc-full glass">
        <div class="sc-card-title">SHIP SYSTEMS</div>
        <div class="sc-media-grid">
          <div class="sc-ent"><span>HA Core</span><em>${upd("update.home_assistant_core_update")}</em></div>
          <div class="sc-ent"><span>HA OS</span><em>${upd("update.home_assistant_operating_system_update")}</em></div>
          <div class="sc-ent"><span>Trillium Firmware</span><em>${upd("update.trillium_firmware")}</em></div>
          <div class="sc-ent"><span>HA Voice (MONA)</span><em>${upd("update.home_assistant_voice_0aab68")}</em></div>
          <div class="sc-ent"><span>Trillium IP</span><em>${this._state("sensor.trillium_ip")}</em></div>
          <div class="sc-ent"><span>Trillium LEDs</span><em>${this._state("sensor.trillium_led_count")}</em></div>
        </div>
      </div>`;
  }

  /* ---------- CREW MODAL ---------- */
  _openCrew() {
    this._modalOpen = true;
    this._renderCrew();
  }
  _closeCrew() {
    this._modalOpen = false;
    const m = this.querySelector("#sc-modal");
    if (m) m.innerHTML = "";
  }
  _renderCrew() {
    const m = this.querySelector("#sc-modal");
    if (!m) return;
    const crew = this._crewIds();
    const homeCount = crew.filter((id) => this._state(id) === "home").length;
    const summary =
      homeCount === crew.length
        ? "FULL CREW ON SITE"
        : homeCount === 0
        ? "ALL CREW OFF-SITE"
        : `${homeCount} OF ${crew.length} ON SITE`;

    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-modal-bd"></div>
      <div class="sc-modal glass">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">CREW STATUS</div>
            <div class="sc-modal-sub">${summary} · LAUNCHPAD</div>
          </div>
          <button class="sc-modal-x" id="sc-modal-x">✕</button>
        </div>
        <div class="sc-crew-list">
          ${crew.map((id) => {
            const st = this._s(id);
            const home = st.state === "home";
            const pic = st.attributes?.entity_picture;
            const loc = home ? "At LaunchPad" : (this._geocoded(id) || this._locationShort(id));
            const trackers = (st.attributes?.device_trackers || []).length;
            return `
              <div class="sc-crew-card ${home ? "home" : "away"}">
                <div class="sc-crew-ava" style="${pic ? `background-image:url('${pic}')` : ""}">${pic ? "" : "👤"}</div>
                <div class="sc-crew-info">
                  <div class="sc-crew-name">${this._name(id)}</div>
                  <div class="sc-crew-loc">${loc}</div>
                  <div class="sc-crew-meta">${trackers} device${trackers === 1 ? "" : "s"} tracked</div>
                </div>
                <div class="sc-crew-badge ${home ? "on" : "off"}">${home ? "HOME" : "AWAY"}</div>
              </div>`;
          }).join("")}
        </div>
        <div class="sc-modal-foot">MONA · ${this._state("assist_satellite.home_assistant_voice_0aab68_assist_satellite").toUpperCase()}</div>
      </div>`;
    m.querySelector("#sc-modal-bd").addEventListener("click", () => this._closeCrew());
    m.querySelector("#sc-modal-x").addEventListener("click", () => this._closeCrew());
  }

  /* ---------- bind view events ---------- */
  _bind(root) {
    root.querySelectorAll("[data-act]").forEach((el) => {
      const act = el.dataset.act;
      if (act === "select") {
        el.addEventListener("change", () => this._selectOption(el.dataset.entity, el.value));
        return;
      }
      if (act === "number") {
        const val = el.parentElement?.querySelector(".sc-slider-val");
        el.addEventListener("input", () => { if (val) val.textContent = el.value; });
        el.addEventListener("change", () => this._setNumber(el.dataset.entity, el.value));
        return;
      }
      if (act === "volume") {
        const em = el.parentElement?.querySelector("em");
        el.addEventListener("input", () => { if (em) em.textContent = el.value + "%"; });
        el.addEventListener("change", () => {
          if (!el.dataset.entity) return;
          this._call("media_player", "volume_set", { volume_level: Number(el.value) / 100 }, { entity_id: el.dataset.entity });
        });
        return;
      }
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        const entity = el.dataset.entity;
        if (act === "toggle" && entity) this._toggle(entity);
        else if (act === "turn_on" && entity) this._turn(entity, true);
        else if (act === "turn_off" && entity) this._turn(entity, false);
        else if (act === "script" && entity) this._script(entity);
        else if (act === "media-auto") {
          this._mediaAuto = true;
          this._mediaPlayer = null;
          this._paint();
        }
        else if (act === "pick" && entity) {
          this._mediaAuto = false;
          this._mediaPlayer = entity;
          this._paint();
        }
        else if (act === "media") {
          if (el.dataset.service === "volume_mute") {
            this._mediaSvc("volume_mute", { is_volume_muted: el.dataset.mute === "1" });
          } else {
            this._mediaSvc(el.dataset.service);
          }
        }
      });
    });
  }
}

SpaceCadetsPanel.styles = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@400;500;600;700&display=swap');

:host, .sc-app {
  display: block; width: 100%; height: 100%; min-height: 100vh;
  color: #f3e9ff; font-family: "Rajdhani", system-ui, sans-serif;
}
.sc-app {
  position: relative;
  display: grid; grid-template-columns: 220px 1fr; min-height: 100%;
  background:
    radial-gradient(1200px 700px at 15% 0%, rgba(168, 85, 247, 0.28), transparent 55%),
    radial-gradient(900px 600px at 90% 20%, rgba(56, 189, 248, 0.18), transparent 50%),
    radial-gradient(800px 500px at 50% 100%, rgba(236, 72, 153, 0.12), transparent 50%),
    linear-gradient(180deg, #07010f 0%, #0b0318 40%, #05010d 100%);
  overflow: auto;
}
.sc-app::before {
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: url('/local/jwst/carina.jpg') center/cover no-repeat fixed;
  opacity: 0.16;
  filter: saturate(1.1) contrast(1.02);
  mix-blend-mode: screen;
}
.sc-app > * { position: relative; z-index: 1; }
.sc-app.narrow { grid-template-columns: 1fr; }
.sc-app.narrow .sc-nav { display: none; }

.glass {
  background: linear-gradient(160deg, rgba(40, 16, 70, 0.5), rgba(12, 6, 28, 0.66));
  border: 1px solid rgba(216, 180, 254, 0.28);
  border-radius: 22px;
  box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.08), 0 0 40px rgba(168, 85, 247, 0.16),
    0 20px 50px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
}

.sc-nav {
  padding: 22px 16px; border-right: 1px solid rgba(216, 180, 254, 0.15);
  background: linear-gradient(180deg, rgba(20, 6, 40, 0.82), rgba(8, 2, 20, 0.9));
  display: flex; flex-direction: column; gap: 18px;
}
.sc-brand { display: flex; gap: 12px; align-items: center; padding: 8px; }
.sc-planet {
  width: 38px; height: 38px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f0abfc, #7c3aed 55%, #0ea5e9);
  box-shadow: 0 0 24px rgba(192, 132, 252, 0.8); position: relative;
}
.sc-planet::after {
  content: ""; position: absolute; inset: 40% -20%;
  border: 2px solid rgba(125, 211, 252, 0.7); border-radius: 50%; transform: rotate(-20deg);
}
.sc-brand-title { font-family: Orbitron, sans-serif; font-size: 12px; letter-spacing: 0.18em; color: #f5d0fe; text-shadow: 0 0 18px rgba(232, 121, 249, 0.8); }
.sc-brand-sub { font-size: 11px; letter-spacing: 0.24em; color: #a5b4fc; }

.sc-nav-links { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.sc-nav-item {
  display: flex; align-items: center; gap: 12px; border: 1px solid transparent; background: transparent;
  color: #d8b4fe; padding: 12px 14px; border-radius: 14px; cursor: pointer; font: inherit;
  letter-spacing: 0.08em; text-align: left; transition: 0.2s ease;
}
.sc-nav-item:hover { background: rgba(168, 85, 247, 0.12); border-color: rgba(216,180,254,0.2); }
.sc-nav-item.active {
  background: linear-gradient(90deg, rgba(168,85,247,0.35), rgba(56,189,248,0.12));
  border-color: rgba(216,180,254,0.45); box-shadow: 0 0 24px rgba(168,85,247,0.35); color: #fff;
}
.sc-nav-ico { width: 20px; text-align: center; text-shadow: 0 0 12px #e879f9; }
.sc-nav-foot { margin-top: auto; text-align: center; color: #c4b5fd; font-size: 11px; letter-spacing: 0.08em; line-height: 1.45; }
.sc-monument {
  width: 54px; height: 54px; margin: 0 auto 10px;
  background: radial-gradient(circle at 50% 30%, #f0abfc, transparent 40%), linear-gradient(180deg, rgba(192,132,252,0), rgba(192,132,252,0.5));
  border-radius: 16px; box-shadow: 0 0 30px rgba(192,132,252,0.45);
}
.sc-foot-brand { margin-top: 8px; font-family: Orbitron, sans-serif; color: #f5d0fe; letter-spacing: 0.2em; }

.sc-main { padding: 18px 22px 28px; display: flex; flex-direction: column; gap: 16px; }
.sc-top { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.sc-greet-line {
  font-family: Orbitron, sans-serif; font-size: clamp(22px, 3vw, 34px); letter-spacing: 0.04em;
  background: linear-gradient(90deg, #f0abfc, #c084fc, #67e8f9);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 18px rgba(232,121,249,0.55));
}
.sc-greet-sub { color: #a5b4fc; letter-spacing: 0.2em; margin-top: 4px; font-size: 13px; }
.sc-top-meta { display: flex; gap: 14px; flex-wrap: wrap; }
.sc-meta-block {
  min-width: 150px; padding: 10px 14px; border-radius: 16px; background: rgba(24, 8, 48, 0.55);
  border: 1px solid rgba(216,180,254,0.22); box-shadow: 0 0 20px rgba(168,85,247,0.15);
  font: inherit; color: inherit; text-align: left;
}
.sc-crew-btn { cursor: pointer; transition: 0.2s ease; }
.sc-crew-btn:hover { border-color: rgba(232,121,249,0.6); box-shadow: 0 0 24px rgba(232,121,249,0.35); }
.sc-meta-label { font-size: 10px; letter-spacing: 0.16em; color: #a78bfa; }
.sc-meta-value { margin-top: 4px; font-size: 14px; font-weight: 600; }
.sc-meta-value.ok { color: #86efac; }
.sc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px #4ade80; margin-right: 6px; }
.sc-dot.amber { background: #fbbf24; box-shadow: 0 0 10px #fbbf24; }

.sc-studiobar {
  display: flex; justify-content: space-between; align-items: center; gap: 18px;
  padding: 14px 20px; flex-wrap: wrap;
}
.sc-studiobar-label { display: flex; align-items: center; gap: 14px; }
.sc-studiobar-ico {
  width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 20px;
  background: radial-gradient(circle at 40% 35%, rgba(240,171,252,0.6), rgba(124,58,237,0.5));
  box-shadow: 0 0 22px rgba(168,85,247,0.5); color: #fff;
}
.sc-studiobar-title { font-family: Orbitron, sans-serif; letter-spacing: 0.16em; font-size: 14px; color: #f5d0fe; }
.sc-studiobar-sub { font-size: 12px; color: #a5b4fc; letter-spacing: 0.14em; margin-top: 2px; }
.sc-studiobar-btns { display: flex; gap: 10px; }

.sc-grid { display: grid; grid-template-columns: 280px minmax(0, 1.4fr) 280px; grid-auto-rows: minmax(120px, auto); gap: 16px; }
.sc-col.hero { min-height: 280px; position: relative; overflow: hidden; }
.sc-col.side { grid-row: span 2; }
.sc-row.quick { grid-column: 1 / -1; }
.sc-row.media { grid-column: 1 / 2; }
.sc-row.autos { grid-column: 2 / 3; }
.sc-row.mantra { grid-column: 3 / 4; }
.sc-full { grid-column: 1 / -1; padding: 20px; }

.sc-card-title { font-family: Orbitron, sans-serif; font-size: 12px; letter-spacing: 0.2em; color: #e9d5ff; margin-bottom: 14px; text-shadow: 0 0 14px rgba(232,121,249,0.45); }
.sc-col, .sc-row { padding: 18px; }

.sc-quick-grid { display: grid; gap: 12px; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.sc-quick-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.sc-quick {
  border: 1px solid rgba(216,180,254,0.22); background: rgba(24, 8, 48, 0.42); border-radius: 18px;
  padding: 16px 10px; color: #e9d5ff; cursor: pointer; font: inherit; text-align: center; transition: 0.2s ease;
}
.sc-quick:hover { transform: translateY(-2px); }
.sc-quick.lit { border-color: rgba(232,121,249,0.65); box-shadow: 0 0 28px rgba(232,121,249,0.35), inset 0 0 20px rgba(168,85,247,0.2); }
.sc-quick-ring {
  width: 46px; height: 46px; margin: 0 auto 8px; border-radius: 50%;
  border: 2px solid rgba(192,132,252,0.55);
  box-shadow: 0 0 18px rgba(192,132,252,0.45), inset 0 0 12px rgba(56,189,248,0.25);
  background: radial-gradient(circle at 40% 35%, rgba(255,255,255,0.35), transparent 45%);
}
.sc-quick.lit .sc-quick-ring { box-shadow: 0 0 26px rgba(232,121,249,0.7), inset 0 0 16px rgba(240,171,252,0.5); }
.sc-quick-name { font-size: 13px; letter-spacing: 0.04em; }
.sc-quick-pct { margin-top: 4px; color: #67e8f9; font-weight: 700; text-shadow: 0 0 10px rgba(103,232,249,0.5); }

.sc-hero-bg {
  position: absolute; inset: 0;
  background: linear-gradient(120deg, rgba(76,29,149,0.5), rgba(8,2,20,0.15) 40%, rgba(14,165,233,0.25)), url('/local/jwst/carina.jpg') center/cover;
  filter: saturate(1.25) contrast(1.05);
}
.sc-hero-overlay { position: absolute; inset: 0; padding: 22px; display: flex; flex-direction: column; justify-content: flex-end; background: linear-gradient(180deg, transparent 20%, rgba(5,1,14,0.85)); }
.sc-hero-kicker { letter-spacing: 0.24em; color: #a5b4fc; font-size: 11px; }
.sc-hero-title { font-family: Orbitron, sans-serif; font-size: 28px; letter-spacing: 0.08em; text-shadow: 0 0 24px rgba(232,121,249,0.7); }
.sc-hero-status { margin-top: 8px; color: #c4b5fd; letter-spacing: 0.08em; }

.sc-metric { margin-bottom: 14px; }
.sc-metric > div:first-child { display: flex; justify-content: space-between; margin-bottom: 6px; color: #ddd6fe; }
.spark { height: 36px; border-radius: 10px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent), repeating-linear-gradient(90deg, transparent 0 10px, rgba(255,255,255,0.03) 10px 11px), radial-gradient(80px 20px at 20% 70%, currentColor, transparent 70%); opacity: 0.9; }
.spark.s1 { color: #e879f9; } .spark.s2 { color: #38bdf8; } .spark.s3 { color: #4ade80; }
.sc-status-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; color: #e9d5ff; }

.sc-now { display: flex; gap: 14px; align-items: center; }
.sc-art { width: 78px; height: 78px; border-radius: 16px; background: linear-gradient(145deg, #7c3aed, #0ea5e9) center/cover; box-shadow: 0 0 24px rgba(168,85,247,0.45); }
.sc-track { font-size: 18px; font-weight: 700; }
.sc-artist { color: #c4b5fd; margin-bottom: 8px; }
.sc-transport { display: flex; gap: 8px; }
.sc-transport button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(216,180,254,0.35); background: rgba(76,29,149,0.45); color: #fff; cursor: pointer; box-shadow: 0 0 14px rgba(168,85,247,0.3); font-size: 14px; }
.sc-transport button:hover { background: rgba(124,58,237,0.6); }
.sc-transport .big { width: 44px; height: 44px; background: linear-gradient(135deg, #e879f9, #38bdf8); }

.sc-auto-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(216,180,254,0.12); letter-spacing: 0.06em; }
.sc-toggle { width: 46px; height: 26px; border-radius: 999px; border: 1px solid rgba(216,180,254,0.3); background: rgba(30, 20, 50, 0.8); position: relative; cursor: pointer; }
.sc-toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #94a3b8; transition: 0.2s ease; }
.sc-toggle.on { background: linear-gradient(90deg, #a855f7, #38bdf8); box-shadow: 0 0 16px rgba(168,85,247,0.5); }
.sc-toggle.on::after { left: 23px; background: #fff; }

.sc-mantra { display: flex; flex-direction: column; justify-content: center; gap: 14px; text-align: left; letter-spacing: 0.06em; line-height: 1.5; }
.sc-astro { width: 64px; height: 64px; border-radius: 20px; background: radial-gradient(circle at 50% 40%, #fff 0 3px, transparent 4px), radial-gradient(circle at 50% 55%, rgba(240,171,252,0.9), transparent 55%), linear-gradient(180deg, #312e81, #7c3aed); box-shadow: 0 0 30px rgba(232,121,249,0.55); }

.sc-chip { flex: 1; border-radius: 999px; border: 1px solid rgba(216,180,254,0.35); padding: 10px 16px; cursor: pointer; font: inherit; font-weight: 700; letter-spacing: 0.08em; color: #fff; background: rgba(76, 29, 149, 0.45); box-shadow: 0 0 18px rgba(168,85,247,0.25); }
.sc-chip.on { background: linear-gradient(90deg, #22d3ee, #a855f7); box-shadow: 0 0 22px rgba(34,211,238,0.45); }
.sc-chip.off { background: linear-gradient(90deg, #f59e0b, #db2777); box-shadow: 0 0 22px rgba(244,114,182,0.4); }
.sc-chip.mini { flex: 0 0 auto; padding: 6px 12px; font-size: 11px; }

.sc-zone-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
.sc-zone { padding: 14px; border-radius: 18px; background: rgba(20, 8, 40, 0.42); border: 1px solid rgba(216,180,254,0.2); }
.sc-zone-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; }
.sc-zone-ents { display: grid; gap: 8px; }
.sc-ent { display: flex; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(216,180,254,0.2); background: rgba(24,8,48,0.4); color: #f3e8ff; cursor: pointer; font: inherit; text-align: left; }
.sc-ent.lit { border-color: rgba(232,121,249,0.6); box-shadow: 0 0 18px rgba(232,121,249,0.25); }
.sc-ent.audio { border-color: rgba(56,189,248,0.4); }
.sc-ent.audio.lit { border-color: rgba(56,189,248,0.8); box-shadow: 0 0 18px rgba(56,189,248,0.35); }
.sc-ent em { color: #67e8f9; font-style: normal; font-weight: 700; }

.sc-ctl { display: flex; flex-direction: column; gap: 6px; padding: 10px 14px; border-radius: 14px; border: 1px solid rgba(216,180,254,0.2); background: rgba(24,8,48,0.4); }
.sc-ctl-label { font-size: 12px; color: #ddd6fe; letter-spacing: 0.06em; }
.sc-select { background: rgba(12,6,28,0.85); color: #f3e8ff; border: 1px solid rgba(216,180,254,0.35); border-radius: 10px; padding: 8px 10px; font: inherit; cursor: pointer; }
.sc-slider-wrap { display: flex; align-items: center; gap: 10px; }
.sc-slider { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px; flex: 1; background: linear-gradient(90deg, #a855f7, #38bdf8); outline: none; }
.sc-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 0 12px rgba(232,121,249,0.8); cursor: pointer; }
.sc-slider::-moz-range-thumb { width: 18px; height: 18px; border: none; border-radius: 50%; background: #fff; box-shadow: 0 0 12px rgba(232,121,249,0.8); cursor: pointer; }
.sc-slider-val, .sc-vol em { color: #67e8f9; font-style: normal; font-weight: 700; min-width: 42px; text-align: right; }
.sc-hint { color: #c4b5fd; margin: 14px 0 0; letter-spacing: 0.04em; }

.sc-media-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0,1fr)); }
.sc-media-grid.three { grid-template-columns: repeat(3, minmax(0,1fr)); }

.sc-player-pick { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.sc-pick { padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(216,180,254,0.3); background: rgba(24,8,48,0.5); color: #e9d5ff; cursor: pointer; font: inherit; letter-spacing: 0.04em; }
.sc-pick.active { background: linear-gradient(90deg, rgba(168,85,247,0.5), rgba(56,189,248,0.3)); border-color: rgba(232,121,249,0.6); color: #fff; box-shadow: 0 0 18px rgba(168,85,247,0.4); }
.sc-pick.watching { border-color: rgba(103,232,249,0.55); box-shadow: 0 0 14px rgba(56,189,248,0.35); }
.sc-pick.dim { opacity: 0.5; }
.sc-media-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.sc-media-sub { color: #a5b4fc; letter-spacing: 0.12em; font-size: 12px; margin-top: 4px; }
.sc-auto-btn {
  padding: 10px 16px; border-radius: 999px; border: 1px solid rgba(216,180,254,0.35);
  background: rgba(24,8,48,0.55); color: #e9d5ff; cursor: pointer; font: inherit; font-weight: 700; letter-spacing: 0.08em;
}
.sc-auto-btn.on { background: linear-gradient(90deg, rgba(34,211,238,0.35), rgba(168,85,247,0.4)); border-color: rgba(103,232,249,0.65); box-shadow: 0 0 18px rgba(56,189,248,0.35); }
.sc-auto-tag {
  display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; font-size: 10px; letter-spacing: 0.1em;
  background: rgba(34,211,238,0.25); color: #67e8f9; border: 1px solid rgba(103,232,249,0.4); vertical-align: middle;
}
.sc-auto-tag.locked { background: rgba(251,191,36,0.2); color: #fbbf24; border-color: rgba(251,191,36,0.4); }
.sc-player { display: flex; gap: 20px; align-items: center; padding: 18px; border-radius: 18px; background: rgba(20,8,40,0.5); border: 1px solid rgba(216,180,254,0.2); }
.sc-player.live { border-color: rgba(74,222,128,0.45); box-shadow: 0 0 24px rgba(74,222,128,0.18); }
.sc-player-art { width: 120px; height: 120px; border-radius: 16px; background: linear-gradient(145deg, #7c3aed, #0ea5e9) center/cover; box-shadow: 0 0 30px rgba(168,85,247,0.5); display: grid; place-items: center; font-size: 40px; color: rgba(255,255,255,0.7); flex: 0 0 auto; }
.sc-player-body { flex: 1; min-width: 0; }
.sc-player-name { font-size: 12px; letter-spacing: 0.1em; color: #a5b4fc; }
.sc-player-name em { color: #67e8f9; font-style: normal; }
.sc-player-track { font-size: 22px; font-weight: 700; margin: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-player-artist { color: #c4b5fd; margin-bottom: 14px; }
.sc-transport.big-row button { width: 44px; height: 44px; font-size: 16px; }
.sc-transport.big-row .big { width: 54px; height: 54px; font-size: 20px; }
.sc-vol { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.sc-vol span { font-size: 12px; letter-spacing: 0.1em; color: #a5b4fc; }
.sc-progress { margin-top: 14px; }
.sc-progress-bar { height: 4px; border-radius: 999px; background: linear-gradient(90deg, #a855f7, #38bdf8); box-shadow: 0 0 10px rgba(168,85,247,0.5); }
.sc-progress-times { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #a5b4fc; letter-spacing: 0.06em; }
.sc-active-list { display: grid; gap: 8px; }
.sc-active-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px;
  border: 1px solid rgba(216,180,254,0.2); background: rgba(24,8,48,0.4); color: #f3e8ff; cursor: pointer; font: inherit; text-align: left;
}
.sc-active-row.live { border-color: rgba(74,222,128,0.45); }
.sc-active-art { width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(145deg, #7c3aed, #0ea5e9) center/cover; display: grid; place-items: center; flex: 0 0 auto; }
.sc-active-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sc-active-meta strong { font-size: 14px; }
.sc-active-meta span { color: #c4b5fd; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-active-row em { color: #67e8f9; font-style: normal; font-weight: 700; font-size: 11px; letter-spacing: 0.06em; }
.sc-note { margin-top: 14px; padding: 10px 14px; border-radius: 12px; background: rgba(244,114,182,0.12); border: 1px solid rgba(244,114,182,0.35); color: #fbcfe8; font-size: 13px; letter-spacing: 0.03em; }
.sc-note.quiet { background: rgba(24,8,48,0.35); border-color: rgba(216,180,254,0.2); color: #c4b5fd; }

.sc-workshop-master { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px; border-radius: 18px; background: linear-gradient(145deg, rgba(88,28,135,0.5), rgba(15,23,42,0.55)); border: 1px solid rgba(216,180,254,0.25); flex-wrap: wrap; }
.sc-wm-title { font-family: Orbitron, sans-serif; letter-spacing: 0.12em; font-size: 16px; }
.sc-wm-sub { color: #a5b4fc; margin-top: 4px; letter-spacing: 0.08em; }
.sc-wm-btns { display: flex; gap: 10px; }
.sc-motion { display: flex; align-items: center; gap: 16px; margin-top: 18px; padding: 16px 18px; border-radius: 16px; border: 1px solid rgba(216,180,254,0.2); background: rgba(20,8,40,0.45); }
.sc-motion.active { border-color: rgba(74,222,128,0.6); box-shadow: 0 0 24px rgba(74,222,128,0.3); }
.sc-motion-ico { font-size: 28px; color: #64748b; }
.sc-motion.active .sc-motion-ico { color: #4ade80; text-shadow: 0 0 16px #4ade80; }
.sc-motion-body { flex: 1; }
.sc-motion-title { font-size: 12px; letter-spacing: 0.12em; color: #a5b4fc; }
.sc-motion-state { font-size: 18px; font-weight: 700; margin-top: 2px; }
.sc-motion-batt { font-size: 12px; color: #86efac; letter-spacing: 0.08em; }

.sc-modal-root { position: fixed; inset: 0; z-index: 50; pointer-events: none; }
.sc-modal-backdrop { position: absolute; inset: 0; background: rgba(3,0,10,0.6); backdrop-filter: blur(4px); pointer-events: auto; }
.sc-modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(520px, 92vw); max-height: 86vh; overflow: auto; padding: 22px; pointer-events: auto; }
.sc-modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.sc-modal-sub { color: #a5b4fc; letter-spacing: 0.1em; font-size: 12px; margin-top: 4px; }
.sc-modal-x { width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(216,180,254,0.35); background: rgba(76,29,149,0.4); color: #fff; cursor: pointer; font-size: 14px; }
.sc-crew-list { display: grid; gap: 12px; }
.sc-crew-card { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 16px; border: 1px solid rgba(216,180,254,0.2); background: rgba(24,8,48,0.5); }
.sc-crew-card.home { border-color: rgba(74,222,128,0.4); }
.sc-crew-ava { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(145deg, #7c3aed, #0ea5e9) center/cover; display: grid; place-items: center; font-size: 24px; box-shadow: 0 0 18px rgba(168,85,247,0.5); flex: 0 0 auto; }
.sc-crew-info { flex: 1; min-width: 0; }
.sc-crew-name { font-size: 17px; font-weight: 700; }
.sc-crew-loc { color: #c4b5fd; margin-top: 2px; font-size: 13px; }
.sc-crew-meta { color: #7c83b0; font-size: 11px; margin-top: 2px; letter-spacing: 0.06em; }
.sc-crew-badge { padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 12px; letter-spacing: 0.08em; }
.sc-crew-badge.on { background: linear-gradient(90deg, #22c55e, #4ade80); color: #052e16; }
.sc-crew-badge.off { background: rgba(100,116,139,0.4); color: #cbd5e1; }
.sc-modal-foot { margin-top: 16px; text-align: center; color: #a5b4fc; letter-spacing: 0.1em; font-size: 12px; }

@media (max-width: 1200px) {
  .sc-grid { grid-template-columns: 1fr 1fr; }
  .sc-col.side, .sc-row.mantra, .sc-row.media, .sc-row.autos, .sc-row.quick { grid-column: 1 / -1; }
  .sc-quick-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .sc-zone-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 800px) {
  .sc-app { grid-template-columns: 1fr; }
  .sc-nav { display: none; }
  .sc-grid { grid-template-columns: 1fr; }
  .sc-quick-grid, .sc-quick-grid.four, .sc-zone-grid, .sc-media-grid, .sc-media-grid.three { grid-template-columns: 1fr 1fr; }
  .sc-player { flex-direction: column; align-items: flex-start; }
}
`;

customElements.define("spacecadets-panel", SpaceCadetsPanel);

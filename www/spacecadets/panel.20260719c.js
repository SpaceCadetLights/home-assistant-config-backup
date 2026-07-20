/**
 * Space Cadets — custom Home Assistant panel
 * Visual target: neon glass mission-control HUD over a James Webb deep-field.
 *
 * Groupings mirror the real LaunchPad dashboards:
 *   Quick Deploy  -> light.build_space_lights, light.workshop_lights,
 *                    light.lounge_lights, cover.smart_blinds
 *   Areas         -> Build Space / Lounge / Stage / Nebula (WLED) / Workshop / Bathroom / Exterior
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
    this._studioPlayer = "media_player.full_studio"; // Music Assistant whole-house sync group
    this._mediaPlayer = this._studioPlayer; // home player locks to the studio group by default
    this._mediaAuto = false;  // locked to studio group (toggle AUTO to scan/promote live sources)
    this._modalOpen = false;
    this._musicMode = this._loadMusicMode(); // "native" | "assistant"
  }

  _loadMusicMode() {
    // Default to the embedded Music Assistant UI (real HA library browser);
    // the Space Cadets native grid is the optional alternative.
    try {
      const v = window.localStorage.getItem("sc_music_mode");
      return v === "assistant" || v === "native" ? v : "assistant";
    } catch (_) { return "assistant"; }
  }

  _setMusicMode(mode) {
    this._musicMode = mode === "assistant" ? "assistant" : "native";
    try { window.localStorage.setItem("sc_music_mode", this._musicMode); } catch (_) {}
    this._paint();
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

  _norm(st) { return String(st || "").trim().toLowerCase(); }

  _isHome(idOrState) {
    const raw = typeof idOrState === "string" && idOrState.includes(".")
      ? this._state(idOrState)
      : (idOrState?.state ?? idOrState);
    const st = this._norm(raw);
    if (st === "home" || st === "launchpad") return true;
    // zone.home membership backup
    if (typeof idOrState === "string" && idOrState.startsWith("person.")) {
      const persons = this._attr("zone.home", "persons", []) || [];
      if (persons.includes(idOrState)) return true;
    }
    return false;
  }

  _on(id) {
    const st = this._norm(this._state(id));
    return ["on", "home", "playing", "open", "opening"].includes(st) || this._isHome(id);
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

  // Play button: resume if something is loaded, otherwise kick off the default
  // playlist on the Full Studio group via Music Assistant so it always plays.
  _studioPlay() {
    const p = this._activePlayer();
    if (!p) return;
    const st = this._s(p);
    const a = (st && st.attributes) || {};
    const hasLoaded = st && (st.state === "paused" || a.media_title || a.media_content_id);
    if (p === this._studioPlayer && !hasLoaded) {
      this._call("script", "turn_on", {}, { entity_id: "script.play_studio_music" });
      return;
    }
    this._mediaSvc("media_play");
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

  _ic(name) {
    const I = {
      prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2.2v12H6zM20 6v12l-9.2-6z"/></svg>',
      next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.8 6H18v12h-2.2zM4 6v12l9.2-6z"/></svg>',
      play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/></svg>',
      stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.4"/></svg>',
      vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5z" fill="currentColor" stroke="none"/><path d="M16 8.6a5 5 0 0 1 0 6.8M18.4 6a8.5 8.5 0 0 1 0 12"/></svg>',
      mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5z" fill="currentColor" stroke="none"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>',
      expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
      back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
      close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
      folder: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>',
      disc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>',
      playc: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 7.5v9a.8.8 0 0 0 1.2.7l7-4.5a.8.8 0 0 0 0-1.4l-7-4.5A.8.8 0 0 0 9 7.5z"/></svg>',
      target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>',
      bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 17.5h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8h5c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/></svg>',
      gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
      sofa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V8.6A2.6 2.6 0 0 1 7.6 6h8.8A2.6 2.6 0 0 1 19 8.6V11"/><path d="M3.6 11.4a2 2 0 0 1 2 2V16h12.8v-2.6a2 2 0 1 1 4 0V18a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1v-4.6a2 2 0 0 1 2-2z"/><path d="M6 19v1.6M18 19v1.6"/></svg>',
      blinds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="15" rx="1.2"/><path d="M4 7.4h16M4 11h16M4 14.6h16M12 18v3"/></svg>',
      bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.4 20a1.8 1.8 0 0 0 3.2 0"/></svg>',
      pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 3h6l-1 5 3 3v2H7v-2l3-3-1-5z"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
      assistant: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 4.9L18.5 8.5l-4.8 1.6L12 15l-1.7-4.9L5.5 8.5l4.8-1.6z"/><circle cx="18.4" cy="16.6" r="1.7"/><circle cx="6.2" cy="16.8" r="1.15"/></svg>',
      mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></svg>',
      send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.5l17.5-8.4a.7.7 0 0 0 0-1.27L3.4 2.4a.7.7 0 0 0-.98.83L4.7 10.2 14 12l-9.3 1.8-2.28 7a.7.7 0 0 0 .98.83z"/></svg>',
    };
    return I[name] || "";
  }

  _transportHtml(info) {
    return `
            <button data-act="media" data-service="media_previous_track" title="Previous" aria-label="Previous">${this._ic("prev")}</button>
            <button class="big" data-act="media" data-service="${info.playing ? "media_pause" : "media_play"}" title="Play/Pause" aria-label="Play or pause">${info.playing ? this._ic("pause") : this._ic("play")}</button>
            <button data-act="media" data-service="media_next_track" title="Next" aria-label="Next">${this._ic("next")}</button>
            <button data-act="media" data-service="media_stop" title="Stop" aria-label="Stop">${this._ic("stop")}</button>
            <button class="mute ${info.muted ? "on" : ""}" data-act="media" data-service="volume_mute" data-mute="${info.muted ? "0" : "1"}" title="Mute" aria-label="Mute">${info.muted ? this._ic("mute") : this._ic("vol")}</button>`;
  }

  /* ---------- Full-screen media experience (browse + play) ---------- */
  _mediaTarget() {
    const has = (id, bit) => ((this._attr(id, "supported_features", 0) || 0) & bit);
    const p = this._activePlayer();
    if (p && has(p, 131072)) return p; // BROWSE_MEDIA
    for (const id of this._mediaDestinations()) {
      if (has(id, 131072)) return id;
    }
    return p;
  }

  _openMediaExpand(el) {
    if (this._expandOpen) return;
    const m = this.querySelector("#sc-media-modal");
    if (!m) return;
    this._expandOpen = true;
    this._lockAppScroll(true);
    this._mediaStack = [];
    this._browseCurrent = null;
    const src = (el && (el.closest(".sc-player") || el.closest(".sc-col.hero"))) || el;
    this._expandSrc = src;

    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-mx-bd"></div>
      <div class="sc-mx-panel" id="sc-mx-panel">
        <div class="sc-mx-inner" id="sc-mx-inner">
          <div class="sc-mx-topbar">
            <div class="sc-mx-brand">${this._ic("disc")}<span>${this._musicMode === "assistant" ? "MUSIC ASSISTANT" : "MUSIC LIBRARY"}</span></div>
            <button class="sc-mx-close" id="sc-mx-close" data-act="mx-close" title="Close" aria-label="Close">${this._ic("close")}</button>
          </div>
          <div class="sc-mx-stage" id="sc-mx-stage"></div>
        </div>
      </div>`;

    const panel = m.querySelector("#sc-mx-panel");
    const inner = m.querySelector("#sc-mx-inner");
    m.classList.add("open");
    this._flipIn(panel, inner, src);
    m.querySelector("#sc-mx-bd").addEventListener("click", () => this._closeMediaExpand());
    this._bind(panel);
    this._initBrowsePane();
  }

  async _initBrowsePane() {
    const stage = this.querySelector("#sc-mx-stage");
    if (!stage) return;
    if (this._musicMode === "native") { this._initNativeBrowse(stage); return; }
    stage.innerHTML = `<div class="sc-mx-loading"><span class="sc-mx-spin">${this._ic("disc")}</span><span>Opening Music Assistant…</span></div>`;
    try {
      const url = await this._maIngressUrl();
      if (!this._expandOpen) return;
      if (!url) throw new Error("no ingress url");
      const f = document.createElement("iframe");
      f.className = "sc-mx-frame";
      f.setAttribute("allow", "autoplay; fullscreen; encrypted-media; clipboard-write");
      f.src = url;
      stage.innerHTML = "";
      stage.appendChild(f);
      this._startIngressKeepalive();
    } catch (e) {
      if (this._expandOpen) this._initNativeBrowse(stage);
    }
  }

  async _maIngressUrl() {
    const unwrap = (r) => (r && r.data !== undefined ? r.data : r);
    const info = unwrap(await this._hass.callWS({ type: "supervisor/api", endpoint: "/addons/d5369777_music_assistant/info", method: "get" }));
    const url = info && (info.ingress_url || info.ingress_entry);
    const sres = unwrap(await this._hass.callWS({ type: "supervisor/api", endpoint: "/ingress/session", method: "post" }));
    const session = sres && sres.session;
    if (session) {
      this._maSession = session;
      document.cookie = `ingress_session=${session}; path=/api/hassio_ingress/; SameSite=Strict`;
    }
    return url;
  }

  _startIngressKeepalive() {
    this._stopIngressKeepalive();
    this._ingressKeep = setInterval(() => {
      if (!this._maSession) return;
      this._hass.callWS({ type: "supervisor/api", endpoint: "/ingress/validate_session", method: "post", data: { session: this._maSession } }).catch(() => {});
    }, 55000);
  }

  _stopIngressKeepalive() {
    if (this._ingressKeep) { clearInterval(this._ingressKeep); this._ingressKeep = null; }
  }

  _initNativeBrowse(stage) {
    this._mediaStack = [];
    this._browseCurrent = null;
    stage.innerHTML = `
      <div class="sc-mx-browsewrap">
        <div class="sc-mx-bar">
          <button class="sc-mx-icbtn" id="sc-mx-back" data-act="mx-back" title="Back" aria-label="Back" disabled>${this._ic("back")}</button>
          <div class="sc-mx-crumb" id="sc-mx-crumb">LIBRARY</div>
          <div class="sc-mx-searchwrap">${this._ic("search")}<input id="sc-mx-search" class="sc-mx-search" placeholder="Filter this view…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        </div>
        <div class="sc-mx-grid" id="sc-mx-grid"></div>
      </div>`;
    this._bind(stage);
    const search = stage.querySelector("#sc-mx-search");
    if (search) search.addEventListener("input", () => this._filterBrowse(search.value));
    this._loadBrowseNode(null);
  }

  _flipIn(panel, inner, src) {
    try {
      const t = panel.getBoundingClientRect();
      const s = src ? src.getBoundingClientRect() : null;
      if (!s || !t.width) { if (inner) inner.style.opacity = "1"; return; }
      const dx = s.left - t.left, dy = s.top - t.top;
      const sx = Math.max(0.05, s.width / t.width), sy = Math.max(0.05, s.height / t.height);
      panel.style.transformOrigin = "top left";
      panel.style.transition = "none";
      panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      panel.style.borderRadius = "18px";
      if (inner) inner.style.opacity = "0";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        panel.style.transition = "transform .52s cubic-bezier(.22,1,.36,1), border-radius .52s ease";
        panel.style.transform = "none";
        panel.style.borderRadius = "";
        if (inner) { inner.style.transition = "opacity .34s ease .14s"; inner.style.opacity = "1"; }
      }));
    } catch (_) { if (inner) inner.style.opacity = "1"; }
  }

  _closeMediaExpand() {
    const m = this.querySelector("#sc-media-modal");
    if (!m || !this._expandOpen) return;
    this._expandOpen = false;
    this._lockAppScroll(false);
    this._stopIngressKeepalive();
    const panel = m.querySelector("#sc-mx-panel");
    const inner = m.querySelector("#sc-mx-inner");
    const src = this._expandSrc;
    m.classList.remove("open");
    const done = () => { m.innerHTML = ""; };
    try {
      const t = panel.getBoundingClientRect();
      const s = src ? src.getBoundingClientRect() : null;
      if (!s) { done(); return; }
      const dx = s.left - t.left, dy = s.top - t.top;
      const sx = Math.max(0.05, s.width / t.width), sy = Math.max(0.05, s.height / t.height);
      panel.style.transformOrigin = "top left";
      panel.style.transition = "transform .4s cubic-bezier(.4,0,.2,1), border-radius .4s ease";
      panel.style.borderRadius = "18px";
      if (inner) { inner.style.transition = "opacity .22s ease"; inner.style.opacity = "0"; }
      panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      let ended = false;
      const fin = () => { if (ended) return; ended = true; done(); };
      panel.addEventListener("transitionend", fin, { once: true });
      setTimeout(fin, 460);
    } catch (_) { done(); }
  }

  /* ==================== ASSIST (voice + chat) ==================== */
  _openAssist() {
    if (this._assistOpen) return;
    const m = this.querySelector("#sc-assist-modal");
    if (!m) return;
    this._assistOpen = true;
    this._assistMsgs = this._assistMsgs || [];
    this._assistState = "idle";
    this._lockAppScroll(true);

    m.innerHTML = `
      <div class="sc-assist-backdrop" id="sc-assist-bd"></div>
      <div class="sc-assist-panel" id="sc-assist-panel">
        <div class="sc-assist-head">
          <div class="sc-assist-headl">
            <span class="sc-assist-orb"></span>
            <div class="sc-assist-titlewrap">
              <div class="sc-assist-title">ASSIST</div>
              <button class="sc-assist-pipe" id="sc-assist-pipe" aria-label="Switch assistant">
                <span id="sc-assist-pipe-name">Assistant</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
              </button>
            </div>
          </div>
          <button class="sc-assist-x" id="sc-assist-x" aria-label="Close">${this._ic("close")}</button>
        </div>
        <div class="sc-assist-pipe-menu" id="sc-assist-pipe-menu" hidden></div>
        <div class="sc-assist-thread" id="sc-assist-thread"></div>
        <div class="sc-assist-status" id="sc-assist-status">
          <div class="sc-assist-wave">${Array.from({ length: 9 }).map((_, i) => `<i style="--d:${i}"></i>`).join("")}</div>
          <span class="sc-assist-status-label" id="sc-assist-status-label">Listening…</span>
        </div>
        <form class="sc-assist-input" id="sc-assist-form">
          <button type="button" class="sc-assist-mic" id="sc-assist-mic" aria-label="Toggle microphone">${this._ic("mic")}</button>
          <input class="sc-assist-text" id="sc-assist-text" type="text" placeholder="Type a message…" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="send">
          <button type="submit" class="sc-assist-send" aria-label="Send">${this._ic("send")}</button>
        </form>
      </div>`;

    requestAnimationFrame(() => m.classList.add("open"));
    m.querySelector("#sc-assist-bd").addEventListener("click", () => this._closeAssist());
    m.querySelector("#sc-assist-x").addEventListener("click", () => this._closeAssist());
    m.querySelector("#sc-assist-mic").addEventListener("click", () => this._assistToggleMic());
    m.querySelector("#sc-assist-pipe").addEventListener("click", (e) => { e.stopPropagation(); this._assistTogglePipeMenu(); });
    const form = m.querySelector("#sc-assist-form");
    const input = m.querySelector("#sc-assist-text");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = input.value;
      input.value = "";
      this._assistSendText(t);
    });
    this._assistEscHandler = (e) => { if (e.key === "Escape") this._closeAssist(); };
    window.addEventListener("keydown", this._assistEscHandler);

    this._assistRenderThread();
    if (!this._assistMsgs.length) this._assistAddSystem("Ask me anything, or tap the mic to speak.");
    this._assistLoadPipelines();
    // Auto-start listening on open (guards for mic availability inside).
    this._assistStartVoice();
  }

  _closeAssist() {
    this._assistTogglePipeMenu(false);
    const m = this.querySelector("#sc-assist-modal");
    if (!m || !this._assistOpen) return;
    this._assistOpen = false;
    this._assistStopVoice(true);
    this._assistCleanupRun();
    if (this._assistEscHandler) { window.removeEventListener("keydown", this._assistEscHandler); this._assistEscHandler = null; }
    if (this._assistAudio) { try { this._assistAudio.pause(); } catch (_) {} this._assistAudio = null; }
    this._lockAppScroll(false);
    m.classList.remove("open");
    setTimeout(() => { if (!this._assistOpen) m.innerHTML = ""; }, 420);
  }

  _assistSetState(state) {
    this._assistState = state;
    const m = this.querySelector("#sc-assist-modal");
    if (!m) return;
    m.classList.toggle("listening", state === "listening");
    m.classList.toggle("processing", state === "processing");
    const mic = m.querySelector("#sc-assist-mic");
    if (mic) mic.classList.toggle("on", state === "listening");
    const label = m.querySelector("#sc-assist-status-label");
    if (label) label.textContent = state === "processing" ? "Thinking…" : "Listening…";
  }

  _assistAddMessage(role, text) {
    if (!text) return;
    this._assistMsgs = this._assistMsgs || [];
    this._assistMsgs.push({ role, text });
    this._assistRenderThread();
  }

  _assistAddSystem(text) { this._assistAddMessage("system", text); }

  _assistNote(text) {
    const msgs = this._assistMsgs || [];
    const last = msgs[msgs.length - 1];
    if (last && last.role === "system" && last.text === text) return;
    this._assistAddSystem(text);
  }

  /* ---- pipeline (assistant) picker ---- */
  async _assistLoadPipelines() {
    try {
      const r = await this._hass.callWS({ type: "assist_pipeline/pipeline/list" });
      this._assistPipelines = (r && r.pipelines) || [];
      this._assistPreferred = r && r.preferred_pipeline;
      if (!this._assistPipelineId) {
        let saved = null;
        try { saved = window.localStorage.getItem("sc_assist_pipeline"); } catch (_) {}
        const ok = saved && this._assistPipelines.some((p) => p.id === saved);
        this._assistPipelineId = ok ? saved : (this._assistPreferred || (this._assistPipelines[0] && this._assistPipelines[0].id) || null);
      }
      this._assistUpdatePipeLabel();
    } catch (_) {}
  }

  _assistUpdatePipeLabel() {
    const el = this.querySelector("#sc-assist-pipe-name");
    if (!el) return;
    const p = (this._assistPipelines || []).find((x) => x.id === this._assistPipelineId);
    el.textContent = p ? p.name : "Assistant";
  }

  _assistTogglePipeMenu(force) {
    const menu = this.querySelector("#sc-assist-pipe-menu");
    const modal = this.querySelector("#sc-assist-modal");
    if (!menu) return;
    const open = force === undefined ? menu.hasAttribute("hidden") : !!force;
    if (open) {
      this._assistRenderPipeMenu();
      menu.removeAttribute("hidden");
      if (modal) modal.classList.add("pipe-open");
      this._assistPipeOutside = (e) => {
        if (!menu.contains(e.target) && !(e.target.closest && e.target.closest("#sc-assist-pipe"))) this._assistTogglePipeMenu(false);
      };
      setTimeout(() => document.addEventListener("click", this._assistPipeOutside, true), 0);
    } else {
      menu.setAttribute("hidden", "");
      if (modal) modal.classList.remove("pipe-open");
      if (this._assistPipeOutside) { document.removeEventListener("click", this._assistPipeOutside, true); this._assistPipeOutside = null; }
    }
  }

  _assistRenderPipeMenu() {
    const menu = this.querySelector("#sc-assist-pipe-menu");
    if (!menu) return;
    const list = this._assistPipelines || [];
    if (!list.length) { menu.innerHTML = `<div class="sc-pipe-item">No assistants found</div>`; return; }
    menu.innerHTML = list
      .map((p) => {
        const meta = [p.stt_engine ? "voice" : "text-only", p.id === this._assistPreferred ? "default" : ""].filter(Boolean).join(" · ");
        return `<button class="sc-pipe-item ${p.id === this._assistPipelineId ? "active" : ""}" data-pipe="${p.id}">
          <span class="sc-pipe-text"><strong>${this._esc(p.name)}</strong><span class="sc-pipe-meta">${this._esc(meta)}</span></span>
          <span class="sc-pipe-check">${this._ic("check")}</span>
        </button>`;
      })
      .join("");
    menu.querySelectorAll("[data-pipe]").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); this._assistSelectPipeline(b.dataset.pipe); })
    );
  }

  _assistSelectPipeline(id) {
    if (!id) return;
    const wasListening = this._assistState === "listening";
    this._assistPipelineId = id;
    try { window.localStorage.setItem("sc_assist_pipeline", id); } catch (_) {}
    this._assistUpdatePipeLabel();
    this._assistTogglePipeMenu(false);
    const p = (this._assistPipelines || []).find((x) => x.id === id);
    this._assistNote("Assistant set to " + (p ? p.name : "selected") + ".");
    if (wasListening) { this._assistStopVoice(true); this._assistStartVoice(); }
  }

  _assistRenderThread() {
    const thread = this.querySelector("#sc-assist-thread");
    if (!thread) return;
    const msgs = this._assistMsgs || [];
    let html = msgs
      .map((mm) => `<div class="sc-bubble ${mm.role}">${this._esc(mm.text)}</div>`)
      .join("");
    if (this._assistState === "processing") {
      html += `<div class="sc-bubble assistant"><span class="sc-typing"><i></i><i></i><i></i></span></div>`;
    }
    thread.innerHTML = html;
    thread.scrollTop = thread.scrollHeight;
  }

  /* ---- audio helpers ---- */
  _floatTo16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      let s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  _downsample(buffer, from, to) {
    if (to >= from) return buffer;
    const ratio = from / to;
    const outLen = Math.floor(buffer.length / ratio);
    const out = new Float32Array(outLen);
    let pos = 0;
    for (let i = 0; i < outLen; i++) {
      const next = Math.floor((i + 1) * ratio);
      let sum = 0, count = 0;
      for (let j = Math.floor(i * ratio); j < next && j < buffer.length; j++) { sum += buffer[j]; count++; }
      out[i] = count ? sum / count : 0;
      pos = next;
    }
    return out;
  }

  async _assistStartVoice() {
    if (this._assistState === "listening" || this._assistMicStarting) return;
    if (!this._hass || !this._hass.connection) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._assistNote("Voice needs a secure (HTTPS) connection — open Space Cadets via your Nabu Casa / Homeway URL or the mobile app. You can type here meanwhile.");
      this._assistSetState("idle");
      return;
    }
    this._assistMicStarting = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      this._assistMicStarting = false;
      const n = (e && e.name) || "";
      if (n === "NotAllowedError" || n === "SecurityError") this._assistNote("Microphone permission is blocked — allow mic access for Home Assistant, then tap the mic to retry.");
      else if (n === "NotFoundError" || n === "OverconstrainedError" || n === "NotReadableError") this._assistNote("No usable microphone found — you can type instead.");
      else this._assistNote("Microphone unavailable — you can type instead.");
      this._assistSetState("idle");
      return;
    }
    this._assistStream = stream;
    this._assistBinHandler = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      let ctx;
      try { ctx = new AC({ sampleRate: 16000 }); } catch (_) { ctx = new AC(); }
      this._assistCtx = ctx;
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch (_) {} }
      const srcRate = ctx.sampleRate || 48000;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      this._assistSource = source;
      this._assistProc = proc;
      proc.onaudioprocess = (e) => {
        const h = this._assistBinHandler;
        if (h == null) return;
        const input = e.inputBuffer.getChannelData(0);
        const down = srcRate === 16000 ? input : this._downsample(input, srcRate, 16000);
        const pcm = this._floatTo16(down);
        const msg = new Uint8Array(pcm.byteLength + 1);
        msg[0] = h;
        msg.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
        try { this._hass.connection.socket.send(msg); } catch (_) {}
      };
      source.connect(proc);
      proc.connect(sink);
      sink.connect(ctx.destination);

      const runMsg = { type: "assist_pipeline/run", start_stage: "stt", end_stage: "tts", input: { sample_rate: 16000 } };
      if (this._assistPipelineId) runMsg.pipeline = this._assistPipelineId;
      if (this._assistConvId) runMsg.conversation_id = this._assistConvId;
      this._assistUnsub = await this._hass.connection.subscribeMessage(
        (ev) => this._assistPipelineEvent(ev),
        runMsg
      );
      this._assistSetState("listening");
    } catch (e) {
      this._assistAddSystem("Couldn't start voice — you can type instead.");
      this._assistStopVoice(true);
      this._assistSetState("idle");
    }
    this._assistMicStarting = false;
  }

  _assistStopVoice(full) {
    // Signal end-of-audio to the pipeline (VAD may have already ended it).
    if (this._assistBinHandler != null && this._hass && this._hass.connection && this._hass.connection.socket) {
      try { this._hass.connection.socket.send(new Uint8Array([this._assistBinHandler])); } catch (_) {}
    }
    this._assistBinHandler = null;
    try { if (this._assistProc) this._assistProc.disconnect(); } catch (_) {}
    try { if (this._assistSource) this._assistSource.disconnect(); } catch (_) {}
    this._assistProc = null;
    this._assistSource = null;
    if (this._assistStream) { try { this._assistStream.getTracks().forEach((t) => t.stop()); } catch (_) {} this._assistStream = null; }
    if (this._assistCtx) { try { this._assistCtx.close(); } catch (_) {} this._assistCtx = null; }
    if (full && this._assistState === "listening") this._assistSetState("idle");
  }

  _assistCleanupRun() {
    if (this._assistUnsub) { try { this._assistUnsub.then ? this._assistUnsub.then((u) => u && u()) : this._assistUnsub(); } catch (_) {} this._assistUnsub = null; }
  }

  _assistToggleMic() {
    if (this._assistState === "listening") { this._assistStopVoice(true); }
    else { this._assistStartVoice(); }
  }

  _assistPipelineEvent(ev) {
    const t = ev.type;
    const d = ev.data || {};
    if (t === "run-start") {
      this._assistBinHandler = d.runner_data && d.runner_data.stt_binary_handler_id;
    } else if (t === "stt-vad-end" || t === "stt-end") {
      // Speech finished — stop capturing and show thinking state.
      this._assistStopVoice(false);
      if (t === "stt-end") {
        const txt = d.stt_output && d.stt_output.text;
        if (txt) this._assistAddMessage("user", txt.trim());
      }
      this._assistSetState("processing");
    } else if (t === "intent-end") {
      const io = d.intent_output || {};
      if (io.conversation_id) this._assistConvId = io.conversation_id;
      const resp = io.response || {};
      const speech = resp.speech && resp.speech.plain && resp.speech.plain.speech;
      this._assistSetState("idle");
      if (speech) this._assistAddMessage("assistant", speech);
    } else if (t === "tts-end") {
      const url = d.tts_output && d.tts_output.url;
      if (url) this._assistPlayTts(url);
    } else if (t === "run-end") {
      this._assistCleanupRun();
      if (this._assistState !== "listening") this._assistSetState("idle");
    } else if (t === "error") {
      this._assistStopVoice(false);
      this._assistCleanupRun();
      const code = d.code || "";
      if (code === "stt-no-text-recognized") this._assistAddSystem("Didn't catch that — try again.");
      else if (code !== "wake-word-timeout") this._assistAddSystem(d.message || "Something went wrong.");
      this._assistSetState("idle");
    }
    if (t !== "run-start") this._assistRenderThread();
  }

  async _assistSendText(text) {
    text = (text || "").trim();
    if (!text || !this._hass) return;
    this._assistStopVoice(true);
    this._assistCleanupRun();
    this._assistAddMessage("user", text);
    this._assistSetState("processing");
    this._assistRenderThread();
    try {
      const runMsg = { type: "assist_pipeline/run", start_stage: "intent", end_stage: "intent", input: { text } };
      if (this._assistPipelineId) runMsg.pipeline = this._assistPipelineId;
      if (this._assistConvId) runMsg.conversation_id = this._assistConvId;
      this._assistUnsub = await this._hass.connection.subscribeMessage(
        (ev) => this._assistPipelineEvent(ev),
        runMsg
      );
    } catch (e) {
      try {
        const r = await this._hass.callWS({ type: "conversation/process", text, conversation_id: this._assistConvId });
        if (r && r.conversation_id) this._assistConvId = r.conversation_id;
        const speech = r && r.response && r.response.speech && r.response.speech.plain && r.response.speech.plain.speech;
        this._assistSetState("idle");
        this._assistAddMessage("assistant", speech || "…");
      } catch (_) {
        this._assistSetState("idle");
        this._assistAddSystem("No response from the assistant.");
      }
    }
  }

  _assistPlayTts(url) {
    try {
      const full = url.startsWith("http") ? url : (this._hass && this._hass.hassUrl ? this._hass.hassUrl(url) : url);
      if (this._assistAudio) { try { this._assistAudio.pause(); } catch (_) {} }
      const a = new Audio(full);
      a.volume = 1;
      this._assistAudio = a;
      a.play().catch(() => {});
    } catch (_) {}
  }

  _expandHeaderHtml() {
    const info = this._mediaInfo(this._activePlayer());
    const target = this._mediaTarget();
    const progress = info.dur && info.dur > 0 && info.pos != null ? Math.min(100, Math.round((info.pos / info.dur) * 100)) : null;
    const sub = [info.artist, info.album, info.app, info.source].filter(Boolean).join(" · ") || "No media metadata";
    return `
      <button class="sc-mx-close" id="sc-mx-close" data-act="mx-close" title="Close" aria-label="Close">${this._ic("close")}</button>
      <div class="sc-mx-art ${info.playing ? "live" : ""}" style="${info.art ? `background-image:url('${info.art}')` : ""}">${info.art ? "" : this._ic("disc")}</div>
      <div class="sc-mx-info">
        <div class="sc-mx-kicker">${(info.name || "—").toUpperCase()} · <em>${(info.state || "idle").toUpperCase()}</em></div>
        <div class="sc-mx-title" title="${this._esc(info.title || "")}">${info.title || "Nothing playing"}</div>
        <div class="sc-mx-sub">${this._esc(sub)}</div>
        <div class="sc-transport big-row sc-mx-transport">${this._transportHtml(info)}</div>
        <div class="sc-vol"><span>${this._ic("vol")}</span><input type="range" class="sc-slider" min="0" max="100" step="1" value="${info.volPct ?? 0}" data-act="volume" data-entity="${info.id || ""}" ${info.volPct == null ? "disabled" : ""}><em>${info.volPct != null ? info.volPct + "%" : "—"}</em></div>
        ${progress != null ? `<div class="sc-progress"><div class="sc-progress-bar" style="width:${progress}%"></div><div class="sc-progress-times"><span>${this._fmtTime(info.pos)}</span><span>${this._fmtTime(info.dur)}</span></div></div>` : ""}
        <div class="sc-mx-target">PLAYING TO · <strong>${this._esc(this._name(target) || "—")}</strong></div>
      </div>`;
  }

  _refreshExpandHeader() {
    const head = this.querySelector("#sc-mx-head");
    if (!head) return;
    const active = document.activeElement;
    if (active && head.contains(active) && active.tagName === "INPUT") return;
    head.innerHTML = this._expandHeaderHtml();
    this._bind(head);
  }

  async _loadBrowseNode(node) {
    const grid = this.querySelector("#sc-mx-grid");
    const crumb = this.querySelector("#sc-mx-crumb");
    const back = this.querySelector("#sc-mx-back");
    const search = this.querySelector("#sc-mx-search");
    if (!grid) return;
    if (search) search.value = "";
    grid.innerHTML = `<div class="sc-mx-loading"><span class="sc-mx-spin">${this._ic("disc")}</span><span>Loading…</span></div>`;
    const target = this._mediaTarget();
    try {
      const msg = { type: "media_player/browse_media", entity_id: target };
      if (node) { msg.media_content_id = node.id; msg.media_content_type = node.type; }
      const res = await this._hass.callWS(msg);
      if (!this._expandOpen) return;
      // At the library root, hide non-music "media source" apps (Camera, TTS, iCloud, images, My media, Radio Browser)
      if (this._mediaStack.length === 0 && Array.isArray(res.children)) {
        res.children = res.children.filter((c) => c.media_class !== "app");
      }
      this._browseCurrent = res;
      if (crumb) crumb.textContent = (this._mediaStack.map((n) => n.title).concat(res.title || "").filter(Boolean).join("  ›  ") || "LIBRARY").toUpperCase();
      if (back) back.disabled = this._mediaStack.length === 0;
      this._renderBrowseGrid(res);
    } catch (e) {
      grid.innerHTML = `<div class="sc-mx-empty">Can't browse this source.<br><small>${this._esc(String((e && e.message) || e))}</small></div>`;
    }
  }

  _renderBrowseGrid(res) {
    const grid = this.querySelector("#sc-mx-grid");
    if (!grid) return;
    const kids = res.children || [];
    if (!kids.length) { grid.innerHTML = `<div class="sc-mx-empty">Nothing here yet.</div>`; return; }
    grid.innerHTML = kids
      .map((c, i) => {
        const isDir = c.media_class === "directory" || c.media_class === "app";
        const art = c.thumbnail ? `background-image:url('${c.thumbnail}')` : "";
        const icon = isDir ? this._ic("folder") : this._ic("disc");
        const act = c.can_expand ? "mx-open" : "mx-play";
        const showPlay = c.can_expand && c.can_play;
        const d = `data-mid="${this._esc(c.media_content_id)}" data-mtype="${this._esc(c.media_content_type)}" data-title="${this._esc(c.title)}"`;
        return `<button class="sc-mx-item ${isDir ? "dir" : ""}" data-act="${act}" ${d} data-name="${this._esc((c.title || "").toLowerCase())}" style="--i:${Math.min(i, 32)}">
          <span class="sc-mx-thumb ${c.thumbnail ? "" : "noart"}" style="${art}">${c.thumbnail ? "" : icon}${showPlay ? `<span class="sc-mx-play" data-act="mx-play" ${d}>${this._ic("playc")}</span>` : ""}</span>
          <span class="sc-mx-name">${this._esc(c.title || "")}</span>
        </button>`;
      })
      .join("");
    this._bind(grid);
  }

  _browseInto(type, id, title) {
    if (this._browseCurrent) {
      this._mediaStack.push({ title: this._browseCurrent.title, type: this._browseCurrent.media_content_type, id: this._browseCurrent.media_content_id });
    }
    this._loadBrowseNode({ type, id, title });
  }

  _browseBack() {
    if (!this._mediaStack.length) return;
    const prev = this._mediaStack.pop();
    const node = prev && prev.id !== "" ? { type: prev.type, id: prev.id, title: prev.title } : null;
    this._loadBrowseNode(node);
  }

  _maPlay(type, id, title) {
    const target = this._mediaTarget();
    if (!target || !id) return;
    this._call("media_player", "play_media", { media_content_id: id, media_content_type: type }, { entity_id: target });
    this._mxToast(`▶  ${title || "Playing"}  →  ${this._name(target)}`);
  }

  _mxToast(msg) {
    const p = this.querySelector("#sc-mx-panel");
    if (!p) return;
    let t = p.querySelector(".sc-mx-toast");
    if (!t) { t = document.createElement("div"); t.className = "sc-mx-toast"; p.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(this._mxToastT);
    this._mxToastT = setTimeout(() => t && t.classList.remove("show"), 2400);
  }

  _filterBrowse(q) {
    const grid = this.querySelector("#sc-mx-grid");
    if (!grid) return;
    const s = (q || "").trim().toLowerCase();
    grid.querySelectorAll(".sc-mx-item").forEach((el) => {
      const n = el.dataset.name || "";
      el.style.display = !s || n.includes(s) ? "" : "none";
    });
  }

  _renderPlayerCard(info, { compact = false } = {}) {
    const progress =
      info.dur && info.dur > 0 && info.pos != null
        ? Math.min(100, Math.round((info.pos / info.dur) * 100))
        : null;
    const subBits = [info.artist, info.album, info.app, info.source].filter(Boolean);
    return `
      <div class="sc-player ${compact ? "compact" : ""} ${info.playing ? "live" : ""}" data-act="expand-player" role="button" tabindex="0" title="Tap to open full player">
        <button class="sc-player-expand" data-act="expand-player" title="Open full player" aria-label="Expand player">${this._ic("expand")}</button>
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

          <div class="sc-transport big-row">${this._transportHtml(info)}
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
  _tabs() {
    return [
      ["overview", "Overview", "◈"],
      ["lighting", "Lighting", "✦"],
      ["media", "Media", "♫"],
      ["workshop", "Workshop", "⚒"],
      ["system", "System", "⚙"],
    ];
  }

  _mount() {
    this._ensureFonts();
    this.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "sc-app" + (this._narrow ? " narrow" : "");
    wrap.innerHTML = `
      <style>${SpaceCadetsPanel.styles}</style>
      <main class="sc-main">
        <header class="sc-top">
          <div class="sc-top-row sc-top-greet-row">
            <button class="sc-menu-btn" id="sc-menu-btn" aria-label="Open mission menu" title="Mission menu">
              <span class="sc-menu-planet"></span>
              <span class="sc-menu-chevs" aria-hidden="true"><i></i><i></i><i></i></span>
            </button>
            <div class="sc-greet">
              <div class="sc-greet-line" id="sc-greet">—</div>
              <div class="sc-greet-sub" id="sc-greet-sub">LAUNCHPAD</div>
            </div>
            <button class="sc-assist-btn" id="sc-assist-btn" aria-label="Talk to Assist" title="Talk to Assist">
              <span class="sc-assist-btn-glow" aria-hidden="true"></span>
              ${this._ic("assistant")}
            </button>
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
              <div class="sc-meta-label">CREW</div>
              <div class="sc-meta-value" id="sc-crew">--</div>
            </button>
          </div>
        </header>

        <div class="sc-studiobar glass" id="sc-studiobar">
          <div class="sc-studiobar-btns">
            <button class="sc-chip on" data-act="script" data-entity="script.studio_all_lights_on">STUDIO ON</button>
            <button class="sc-chip off" data-act="script" data-entity="script.studio_all_lights_off">STUDIO OFF</button>
          </div>
        </div>

        <section class="sc-grid" id="sc-view"></section>
      </main>

      <div class="sc-drawer-root" id="sc-drawer" aria-hidden="true">
        <div class="sc-drawer-backdrop" id="sc-drawer-bd"></div>
        <aside class="sc-drawer glass">
          <div class="sc-drawer-head">
            <div class="sc-brand">
              <div class="sc-planet"></div>
              <div>
                <div class="sc-brand-title">SPACE CADETS</div>
                <div class="sc-brand-sub">MISSION MENU</div>
              </div>
            </div>
            <button class="sc-drawer-x" id="sc-drawer-x" aria-label="Close">✕</button>
          </div>
          <nav class="sc-drawer-links">
            ${this._tabs()
              .map(
                ([id, label, icon], i) => `
              <button class="sc-drawer-item ${id === this._tab ? "active" : ""}" data-tab="${id}" style="--i:${i}">
                <span class="sc-nav-ico">${icon}</span>
                <span class="sc-drawer-text">
                  <strong>${label}</strong>
                  <em>${id.toUpperCase()}</em>
                </span>
                <span class="sc-drawer-arrow">→</span>
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
      </div>

      <div class="sc-modal-root" id="sc-modal"></div>
      <div class="sc-modal-root" id="sc-picker-modal"></div>
      <div class="sc-modal-root sc-media-modal" id="sc-media-modal"></div>
      <div class="sc-modal-root sc-radar-modal-root" id="sc-radar-modal"></div>
      <div class="sc-modal-root sc-assist-modal" id="sc-assist-modal"></div>
    `;
    this.appendChild(wrap);
    this._root = wrap;
    this._menuOpen = false;

    wrap.querySelector("#sc-menu-btn").addEventListener("click", () => this._toggleMenu(true));
    wrap.querySelector("#sc-drawer-bd").addEventListener("click", () => this._toggleMenu(false));
    wrap.querySelector("#sc-drawer-x").addEventListener("click", () => this._toggleMenu(false));
    wrap.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        this._toggleMenu(false);
        this._syncMenuTab();
        this._paint();
      });
    });
    wrap.querySelector("#sc-crew-btn").addEventListener("click", () => this._openCrew());
    wrap.querySelector("#sc-assist-btn").addEventListener("click", () => this._openAssist());
    wrap.querySelectorAll("#sc-studiobar [data-act]").forEach((el) =>
      el.addEventListener("click", () => this._script(el.dataset.entity))
    );

    this._syncMenuTab();
    this._paint();
  }

  _syncMenuTab() {
    this.querySelectorAll(".sc-drawer-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === this._tab);
    });
  }

  _ensureFonts() {
    if (document.getElementById("sc-fonts")) return;
    const style = document.createElement("style");
    style.id = "sc-fonts";
    style.textContent = `
      @font-face{font-family:'Orbitron';font-style:normal;font-weight:500;font-display:swap;src:url('/local/spacecadets/fonts/orbitron-500.woff2') format('woff2')}
      @font-face{font-family:'Orbitron';font-style:normal;font-weight:700;font-display:swap;src:url('/local/spacecadets/fonts/orbitron-700.woff2') format('woff2')}
      @font-face{font-family:'Rajdhani';font-style:normal;font-weight:400;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-400.woff2') format('woff2')}
      @font-face{font-family:'Rajdhani';font-style:normal;font-weight:500;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-500.woff2') format('woff2')}
      @font-face{font-family:'Rajdhani';font-style:normal;font-weight:600;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-600.woff2') format('woff2')}
      @font-face{font-family:'Rajdhani';font-style:normal;font-weight:700;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-700.woff2') format('woff2')}
    `;
    document.head.appendChild(style);
  }

  _toggleMenu(force) {
    this._menuOpen = force == null ? !this._menuOpen : !!force;
    const root = this.querySelector("#sc-drawer");
    if (!root) return;
    root.classList.toggle("open", this._menuOpen);
    root.setAttribute("aria-hidden", this._menuOpen ? "false" : "true");
    document.body?.classList?.toggle("sc-menu-lock", this._menuOpen);
  }

  /* ---------- greeting (intelligent) ---------- */
  _crewIds() {
    // Household = Isaac + Jared only. person.space_cadets is the shared login, not a third cadet.
    return ["person.isaac_norris", "person.jared_lee_lyons"].filter((id) => this._s(id));
  }

  _greeting() {
    const crew = this._crewIds().map((id) => this._s(id));
    const homeCount = crew.filter((s) => this._isHome(s)).length;
    const total = crew.length;
    const now = Date.now();
    const justArrived = crew.some(
      (s) => this._isHome(s) && now - Date.parse(s.last_changed) < 15 * 60 * 1000
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
    if (this._isHome(st)) return "LaunchPad";
    if (["not_home", "away"].includes(this._norm(st.state))) return "Away";
    return st.state;
  }

  _geocoded(personId) {
    const map = {
      "person.isaac_norris": "sensor.isaacs_iphone_14_geocoded_location",
      "person.jared_lee_lyons": "sensor.jareds_iphone_geocoded_location",
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
    const dots = crew.map((id) => (this._isHome(id) ? "●" : "○")).join(" ");
    const homeCount = crew.filter((id) => this._isHome(id)).length;
    const crewEl = this.querySelector("#sc-crew");
    if (crewEl) crewEl.textContent = `${dots}  ${homeCount}/${crew.length}`;

    const statusEl = this.querySelector("#sc-status");
    if (statusEl) {
      const secured = homeCount === 0;
      statusEl.innerHTML = `<span class="sc-dot ${secured ? "amber" : ""}"></span> ${secured ? "SECURED" : "ALL SYSTEMS NOMINAL"}`;
    }

    const active = document.activeElement;
    const view = this.querySelector("#sc-view");
    if (view && !(active && view.contains(active) && ["INPUT", "SELECT"].includes(active.tagName))) {
      // Keep the live radar node across re-renders so RainViewer does not reload constantly.
      const keepRadar = view.querySelector("#sc-radar-keep");
      view.classList.toggle("ov", this._tab === "overview");
      if (this._tab === "overview") view.innerHTML = this._htmlOverview();
      else if (this._tab === "lighting") view.innerHTML = this._htmlLighting();
      else if (this._tab === "media") view.innerHTML = this._htmlMedia();
      else if (this._tab === "workshop") view.innerHTML = this._htmlWorkshop();
      else view.innerHTML = this._htmlSystem();
      if (keepRadar && this._tab === "overview") {
        const slot = view.querySelector("#sc-radar-keep");
        if (slot) slot.replaceWith(keepRadar);
      }
      this._bind(view);
      this._bindRadarPreview();
    }

    if (this._modalOpen) {
      if (this._crewTrailPerson) this._refreshCrewTrailHeader();
      else this._renderCrew(false);
    }
    if (this._expandOpen) this._refreshExpandHeader();
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
            ["Build Space", "light.build_space_lights", "bulb"],
            ["Workshop", "light.workshop_lights", "gear"],
            ["Lounge", "light.lounge_lights", "sofa"],
            ["Smart Blinds", "cover.smart_blinds", "blinds"],
          ]
            .map(
              ([name, entity, icon]) => `
            <button class="sc-quick ${this._on(entity) ? "lit" : ""}" data-act="toggle" data-entity="${entity}">
              <div class="sc-quick-ico">${this._ic(icon)}</div>
              <div class="sc-quick-name">${name}</div>
              <div class="sc-quick-pct">${this._pct(entity)}</div>
            </button>`
            )
            .join("")}
        </div>
      </div>

      ${this._htmlReminders()}

      <div class="sc-col hero glass ${info.playing ? "live" : ""}">
        <div class="sc-hero-bg ${info.art ? "has-art" : "galaxy"}" style="${info.art ? `background-image:url('${info.art}')` : ""}"></div>
        <div class="sc-hero-overlay sc-hero-player">
          <div class="sc-hero-top">
            <div>
              <div class="sc-hero-kicker">NOW PLAYING · ${info.name ? info.name.toUpperCase() : "—"} ${this._mediaAuto ? "· AUTO" : "· LOCKED"}${activeCount > 1 ? ` · ${activeCount} LIVE` : ""}</div>
              <div class="sc-hero-title">${info.title || "Nothing playing"}</div>
              <div class="sc-hero-status">${[info.artist, info.album, info.app || info.source].filter(Boolean).join(" · ") || (info.state || "idle").toUpperCase()}</div>
            </div>
            <div class="sc-hero-state-wrap">
              <em class="sc-hero-state">${(info.state || "idle").toUpperCase()}</em>
              <button class="sc-hero-expand" data-act="expand-player" title="Open full player" aria-label="Expand player">${this._ic("expand")}</button>
            </div>
          </div>
          <div class="sc-hero-controls">
            <div class="sc-transport big-row">${this._transportHtml(info)}
            </div>
            <div class="sc-vol sc-hero-vol">
              <span>VOL</span>
              <input type="range" class="sc-slider" min="0" max="100" step="1" value="${info.volPct ?? 0}" data-act="volume" data-entity="${info.id || ""}" ${info.volPct == null ? "disabled" : ""}>
              <em>${info.volPct != null ? info.volPct + "%" : "—"}</em>
            </div>
          </div>
        </div>
      </div>

      <div class="sc-ov-nebula">
        ${this._renderNebula()}
      </div>

      <div class="sc-row weather glass">
        ${this._htmlWeatherRadar()}
      </div>

      <div class="sc-row env glass">
        <div class="sc-card-title">ENVIRONMENT</div>
        <div class="sc-env-grid">
          <div class="sc-metric">
            <div><span>Workshop Motion</span><strong>${this._state("binary_sensor.motion_sensor_2_occupancy").toUpperCase()}</strong></div>
            <div class="spark s1"></div>
          </div>
          <div class="sc-metric">
            <div><span>Bathroom Motion</span><strong>${this._state("binary_sensor.motion_sensor_1_occupancy").toUpperCase()}</strong></div>
            <div class="spark s2"></div>
          </div>
        </div>
      </div>

      <div class="sc-row mantra glass">
        <div class="sc-astro"></div>
        <p>THE UNIVERSE IS OUR CANVAS.<br/>LIGHT IS OUR LANGUAGE.<br/><strong>WE ARE SPACE CADETS.</strong></p>
      </div>
    `;
  }

  /* ---------- REMINDERS ---------- */
  _reminders() {
    const st = this._s("sensor.sc_reminders");
    const items = st && st.attributes && st.attributes.items;
    return Array.isArray(items) ? items : [];
  }

  _visibleReminders() {
    const now = Date.now();
    const horizon = now + 24 * 3600 * 1000;
    const items = this._reminders().map((r) => ({ ...r, dueMs: Date.parse(r.due) }));
    const pinned = items
      .filter((r) => r.pinned)
      .sort((a, b) => (a.dueMs || 0) - (b.dueMs || 0));
    const upcoming = items
      .filter((r) => !r.pinned && !isNaN(r.dueMs) && r.dueMs <= horizon)
      .sort((a, b) => a.dueMs - b.dueMs);
    return { pinned, upcoming };
  }

  _relTime(dueMs) {
    if (isNaN(dueMs)) return "";
    const diff = dueMs - Date.now();
    const past = diff < 0;
    const mins = Math.round(Math.abs(diff) / 60000);
    let label;
    if (mins < 1) label = "now";
    else if (mins < 60) label = mins + "m";
    else if (mins < 1440) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      label = m ? `${h}h ${m}m` : `${h}h`;
    } else {
      label = Math.round(mins / 1440) + "d";
    }
    if (label === "now") return past ? "due now" : "now";
    return past ? label + " ago" : "in " + label;
  }

  _reminderCard(r) {
    const overdue = !isNaN(r.dueMs) && r.dueMs <= Date.now();
    const when = this._relTime(r.dueMs);
    const rid = this._esc(String(r.id));
    return `
      <div class="sc-rem ${overdue && !r.pinned ? "overdue" : ""} ${r.pinned ? "pinned" : ""}">
        <span class="sc-rem-tick"></span>
        <div class="sc-rem-body">
          <div class="sc-rem-msg">${this._esc(r.message || "Reminder")}</div>
          <div class="sc-rem-when">${overdue && !r.pinned ? "DUE · " : ""}${when}${r.pinned ? " · PINNED" : ""}</div>
        </div>
        <div class="sc-rem-actions">
          <button class="sc-rem-btn pin ${r.pinned ? "on" : ""}" data-act="rem-pin" data-id="${rid}" title="${r.pinned ? "Unpin" : "Pin to dashboard"}" aria-label="Pin reminder">${this._ic("pin")}</button>
          <button class="sc-rem-btn done" data-act="rem-dismiss" data-id="${rid}" title="Dismiss reminder" aria-label="Dismiss reminder">${this._ic("check")}</button>
        </div>
      </div>`;
  }

  _htmlReminders() {
    const { pinned, upcoming } = this._visibleReminders();
    if (!pinned.length && !upcoming.length) return "";
    return `
      <div class="sc-row reminders glass">
        <div class="sc-card-title">${this._ic("bell")}REMINDERS</div>
        ${upcoming.length ? `<div class="sc-rem-list">${upcoming.map((r) => this._reminderCard(r)).join("")}</div>` : ""}
        ${pinned.length ? `<div class="sc-rem-sub">PINNED</div><div class="sc-rem-list">${pinned.map((r) => this._reminderCard(r)).join("")}</div>` : ""}
      </div>`;
  }

  _radarMapUrl(zoom = 10) {
    const { lat, lon } = this._homeCoords();
    // RainViewer web map (clean, interactive). Zoom 10 ≈ Asheville city scale.
    return (
      `https://www.rainviewer.com/map.html?loc=${lat},${lon},${zoom}` +
      `&oFa=0&oC=0&oU=0&oCS=1&oF=0&oAP=0&c=3&o=90&lm=1&layer=radar&sm=1&sn=1&hu=0`
    );
  }

  _homeCoords() {
    const z = this._s("zone.home");
    const lat = z?.attributes?.latitude ?? 35.62852373042681;
    const lon = z?.attributes?.longitude ?? -82.6036047935486;
    return { lat, lon };
  }

  _weatherIcon(cond) {
    const c = this._norm(cond);
    if (c.includes("thunder")) return "⛈";
    if (c.includes("rain") || c.includes("pour")) return "🌧";
    if (c.includes("snow")) return "❄";
    if (c.includes("cloud") || c.includes("overcast")) return "☁";
    if (c.includes("fog") || c.includes("haze")) return "🌫";
    if (c.includes("wind")) return "🌬";
    if (c.includes("clear") || c.includes("sunny")) return "☀";
    if (c.includes("partly")) return "⛅";
    return "🌤";
  }

  _htmlWeatherRadar() {
    const wid = "weather.forecast_home";
    const st = this._s(wid);
    const a = st?.attributes || {};
    const cond = st?.state || "unknown";
    const temp = a.temperature != null ? `${Math.round(a.temperature)}°` : "—";
    const unit = (a.temperature_unit || "F").replace("°", "");
    const hum = a.humidity != null ? `${a.humidity}%` : "—";
    const src = this._radarMapUrl(10);
    return `
      <div class="sc-wx">
        <div class="sc-wx-head">
          <div>
            <div class="sc-card-title" style="margin:0">LAUNCHPAD WEATHER</div>
            <div class="sc-wx-cond">${this._weatherIcon(cond)} ${String(cond).replace(/_/g, " ").toUpperCase()}</div>
          </div>
          <div class="sc-wx-temp">${temp}<small>${unit}</small></div>
        </div>
        <div class="sc-wx-stats">
          <div><span>HUMIDITY</span><strong>${hum}</strong></div>
          <div><span>ZONE</span><strong>ASHEVILLE</strong></div>
          <div><span>SOURCE</span><strong>RAINVIEWER</strong></div>
        </div>
        <div class="sc-radar-wrap" id="sc-radar-keep">
          <iframe
            class="sc-radar"
            id="sc-radar-frame"
            title="Live weather radar over LaunchPad"
            src="${src}"
            loading="eager"
            referrerpolicy="no-referrer"
            allowfullscreen
          ></iframe>
          <div class="sc-radar-shade" aria-hidden="true"></div>
          <button type="button" class="sc-radar-expand" id="sc-radar-expand" title="Open full radar">EXPAND · ZOOM &amp; PAN</button>
          <div class="sc-radar-badge" id="sc-radar-badge">ASHEVILLE RADAR</div>
        </div>
      </div>`;
  }

  _bindRadarPreview() {
    const host = this.querySelector("#sc-radar-keep");
    const btn = this.querySelector("#sc-radar-expand");
    if (!host) return;
    // iframe must stay mounted — never rewrite its src after first load
    if (btn && btn.dataset.bound !== "1") {
      btn.dataset.bound = "1";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._openRadarExplorer();
      });
    }
  }

  _openRadarExplorer() {
    const m = this.querySelector("#sc-radar-modal");
    if (!m) return;
    const src = this._radarMapUrl(10);
    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-radar-bd"></div>
      <div class="sc-modal sc-radar-explorer glass">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">RADAR EXPLORER</div>
            <div class="sc-modal-sub">PINCH / SCROLL TO ZOOM · DRAG TO PAN · ASHEVILLE</div>
          </div>
          <button class="sc-modal-x" id="sc-radar-x">✕</button>
        </div>
        <div class="sc-radar-ex-stage sc-radar-ex-iframe">
          <iframe
            class="sc-radar-ex-frame"
            title="Interactive Asheville radar"
            src="${src}"
            loading="eager"
            referrerpolicy="no-referrer"
            allowfullscreen
          ></iframe>
        </div>
        <div class="sc-radar-ex-controls">
          <button type="button" class="sc-chip mini on" id="sc-radar-home">RECENTER HOME</button>
        </div>
      </div>`;
    m.querySelector("#sc-radar-bd").addEventListener("click", () => this._closeRadarExplorer());
    m.querySelector("#sc-radar-x").addEventListener("click", () => this._closeRadarExplorer());
    m.querySelector("#sc-radar-home").addEventListener("click", () => {
      const frame = m.querySelector(".sc-radar-ex-frame");
      if (frame) frame.src = this._radarMapUrl(10);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
  }

  _closeRadarExplorer() {
    const m = this.querySelector("#sc-radar-modal");
    if (!m) return;
    m.classList.remove("open");
    setTimeout(() => {
      m.innerHTML = "";
    }, 380);
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
      ${this._renderNebula()}
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

  _esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _ensureWledPalettes() {
    if (this._wledPalettes || this._wledPalLoading) return;
    this._wledPalLoading = true;
    fetch("/local/spacecadets/wled-palettes.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => {
        this._wledPalettes = j || {};
        this._wledPalLoading = false;
        if (this._tab === "lighting" && !this._pickerOpen) this._paint();
      })
      .catch(() => {
        this._wledPalettes = {};
        this._wledPalLoading = false;
      });
  }

  _openEffectPicker() {
    const st = this._s("light.trillium");
    const effects = (st?.attributes?.effect_list) || [];
    const cur = st?.attributes?.effect || "";
    this._renderPicker({ title: "NEBULA · EFFECT", kind: "effect", options: effects, current: cur });
  }

  async _openPalettePicker() {
    const ent = "select.trillium_color_palette";
    const options = this._attr(ent, "options", []) || [];
    const cur = this._state(ent);
    await this._loadWledPalettesAsync();
    this._renderPicker({
      title: "NEBULA · PALETTE",
      kind: "palette",
      options,
      current: cur,
      gradients: this._wledPalettes || {},
    });
  }

  _loadWledPalettesAsync() {
    if (this._wledPalettes) return Promise.resolve(this._wledPalettes);
    return fetch("/local/spacecadets/wled-palettes.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => (this._wledPalettes = j || {}))
      .catch(() => (this._wledPalettes = {}));
  }

  _renderPicker({ title, kind, options, current, gradients }) {
    const m = this.querySelector("#sc-picker-modal");
    if (!m) return;
    this._pickerOpen = true;
    this._lockAppScroll(true);

    const grid = options
      .map((o) => {
        const active = o === current ? "active" : "";
        if (kind === "palette") {
          const g = (gradients && gradients[o]) || "linear-gradient(90deg,#a855f7,#22d3ee)";
          return `<button type="button" class="sc-pick-item palette ${active}" data-pick="${this._esc(o)}">
            <span class="sc-pick-sw" style="background:${g}"></span>
            <span class="sc-pick-name">${this._esc(o)}</span>
          </button>`;
        }
        return `<button type="button" class="sc-pick-item ${active}" data-pick="${this._esc(o)}">
          <span class="sc-pick-name">${this._esc(o)}</span>
        </button>`;
      })
      .join("");

    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-pick-bd"></div>
      <div class="sc-modal sc-pick-modal">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">${title}</div>
            <div class="sc-modal-sub">${options.length} OPTIONS · TAP TO APPLY</div>
          </div>
          <button class="sc-modal-x" id="sc-pick-x">✕</button>
        </div>
        <input type="text" class="sc-pick-search" id="sc-pick-search" placeholder="Search…" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="sc-pick-grid ${kind}" id="sc-pick-grid">${grid}</div>
      </div>`;

    const close = () => this._closePicker();
    m.querySelector("#sc-pick-bd").addEventListener("click", close);
    m.querySelector("#sc-pick-x").addEventListener("click", close);

    const search = m.querySelector("#sc-pick-search");
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      m.querySelectorAll(".sc-pick-item").forEach((el) => {
        const name = (el.dataset.pick || "").toLowerCase();
        el.style.display = !q || name.includes(q) ? "" : "none";
      });
    });

    m.querySelectorAll("[data-pick]").forEach((el) => {
      el.addEventListener("click", () => {
        const val = el.dataset.pick;
        this._applyPick(kind, val);
        m.querySelectorAll(".sc-pick-item").forEach((b) => b.classList.toggle("active", b.dataset.pick === val));
        const sub = m.querySelector(".sc-modal-sub");
        if (sub) sub.textContent = `APPLIED · ${val}`;
        setTimeout(close, 220);
      });
    });

    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
    // scroll active into view
    setTimeout(() => {
      const act = m.querySelector(".sc-pick-item.active");
      if (act) act.scrollIntoView({ block: "center" });
    }, 140);
  }

  _applyPick(kind, val) {
    if (kind === "effect") this._call("light", "turn_on", { effect: val }, { entity_id: "light.trillium" });
    else if (kind === "palette") this._selectOption("select.trillium_color_palette", val);
  }

  _closePicker() {
    const m = this.querySelector("#sc-picker-modal");
    this._pickerOpen = false;
    this._lockAppScroll(false);
    if (!m) return;
    m.classList.remove("open");
    setTimeout(() => {
      if (!this._pickerOpen) m.innerHTML = "";
    }, 380);
  }

  _renderNebula() {
    const light = "light.trillium";
    const st = this._s(light);
    const on = this._on(light);
    const effects = (st?.attributes?.effect_list) || [];
    const curEffect = st?.attributes?.effect || "";
    const bri = st?.attributes?.brightness;
    const briPct = bri != null ? Math.round((bri / 255) * 100) : on ? 100 : 0;

    const paletteEnt = "select.trillium_color_palette";
    const palettes = this._attr(paletteEnt, "options", []) || [];
    const curPalette = this._state(paletteEnt);

    const speed = this._state("number.trillium_speed", 0);
    const distortion = this._state("number.trillium_intensity", 0);

    this._ensureWledPalettes();
    const curGrad =
      (this._wledPalettes && this._wledPalettes[curPalette]) ||
      "linear-gradient(90deg,#a855f7,#22d3ee)";

    const subtitle = on
      ? [curEffect || "CUSTOM", curPalette && curPalette !== "unavailable" ? curPalette : ""]
          .filter(Boolean)
          .join(" · ")
      : "OFFLINE";

    return `
      <div class="sc-full glass sc-nebula ${on ? "live" : ""}">
        <div class="sc-nebula-aura" aria-hidden="true"></div>
        <div class="sc-nebula-inner">
          <div class="sc-nebula-head">
            <div class="sc-nebula-brand">
              <span class="sc-nebula-orb"></span>
              <div>
                <div class="sc-card-title" style="margin:0">NEBULA</div>
                <div class="sc-nebula-sub">${this._esc(subtitle)}</div>
              </div>
            </div>
            <button class="sc-nebula-power ${on ? "on" : ""}" data-act="toggle" data-entity="${light}">
              <span class="dot"></span>${on ? "ON" : "OFF"}
            </button>
          </div>

          <div class="sc-nebula-grid">
            <div class="sc-nebula-field wide">
              <span class="sc-nebula-lbl">EFFECT <em>${effects.length} FX</em></span>
              <button type="button" class="sc-nebula-pick" data-act="pick-effect" ${effects.length ? "" : "disabled"}>
                <span class="txt">${this._esc(curEffect || "—")}</span>
                <span class="chev">GRID ▸</span>
              </button>
            </div>

            <div class="sc-nebula-field wide">
              <span class="sc-nebula-lbl">PALETTE <em>${palettes.length}</em></span>
              <button type="button" class="sc-nebula-pick palette" data-act="pick-palette" ${palettes.length ? "" : "disabled"}>
                <span class="sw" style="background:${curGrad}"></span>
                <span class="txt">${this._esc(curPalette && curPalette !== "unavailable" ? curPalette : "—")}</span>
                <span class="chev">GRID ▸</span>
              </button>
            </div>

            <div class="sc-nebula-field">
              <span class="sc-nebula-lbl">SPEED <em class="sc-slider-val">${speed}</em></span>
              <input type="range" class="sc-slider nebula speed" min="0" max="255" step="1" value="${speed}" data-act="number" data-entity="number.trillium_speed">
            </div>

            <div class="sc-nebula-field">
              <span class="sc-nebula-lbl">DISTORTION <em class="sc-slider-val">${distortion}</em></span>
              <input type="range" class="sc-slider nebula distort" min="0" max="255" step="1" value="${distortion}" data-act="number" data-entity="number.trillium_intensity">
            </div>

            <div class="sc-nebula-field wide">
              <span class="sc-nebula-lbl">BRIGHTNESS <em class="sc-slider-val">${briPct}%</em></span>
              <input type="range" class="sc-slider nebula bright" min="0" max="100" step="1" value="${briPct}" data-act="bright" data-entity="${light}">
            </div>
          </div>
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

        ${spotifyDown ? `<div class="sc-note">⚠ Native Spotify (etcêtre) is in setup_retry — upstream Spotify API / spotifyaio issue. Reliable path: Music Assistant → Spotify provider → play to AirPlay / Spotify Connect (HA speaker). Update Music Assistant when prompted.</div>` : ""}

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

        <div class="sc-card-title" style="margin-top:22px">PA SPEAKERS · MAIN SYSTEM</div>
        <div class="sc-pa-row">
          <button class="sc-pa-master ${this._on("switch.p_a_speakers") ? "on" : ""}" data-act="toggle" data-entity="switch.p_a_speakers">
            <span class="sc-pa-ico">🔊</span>
            <span class="sc-pa-meta">
              <strong>P.A. SPEAKERS</strong>
              <em>${this._on("switch.p_a_speakers") ? "SYSTEM LIVE" : "SYSTEM OFF"}</em>
            </span>
            <span class="sc-pa-state">${this._state("switch.p_a_speakers").toUpperCase()}</span>
          </button>
          <button class="sc-chip ${this._on("switch.p_a_speakers") ? "on" : ""}" data-act="turn_on" data-entity="switch.p_a_speakers">PA ON</button>
          <button class="sc-chip off" data-act="turn_off" data-entity="switch.p_a_speakers">PA OFF</button>
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
    const mode = this._musicMode;
    return `
      <div class="sc-full glass">
        <div class="sc-card-title">PREFERENCES</div>
        <div class="sc-setting">
          <div class="sc-setting-info">
            <div class="sc-setting-title">MUSIC BROWSER STYLE</div>
            <div class="sc-setting-sub">How the full-screen player browses your library</div>
          </div>
          <div class="sc-seg">
            <button class="sc-seg-btn ${mode === "assistant" ? "on" : ""}" data-act="music-mode" data-mode="assistant">
              <strong>Music Assistant</strong><em>Full library UI · default</em>
            </button>
            <button class="sc-seg-btn ${mode === "native" ? "on" : ""}" data-act="music-mode" data-mode="native">
              <strong>Native</strong><em>Space Cadets grid</em>
            </button>
          </div>
        </div>
      </div>

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

  /* ---------- CREW MODAL + LOCATION TRAILS ---------- */
  _ensureLeaflet() {
    const injectCss = () => {
      const cssId = "sc-leaflet-css";
      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href = "/local/spacecadets/leaflet/leaflet.css";
        document.head.appendChild(link);
      }
    };
    injectCss();
    if (!document.getElementById("sc-leaflet-fix")) {
      const fix = document.createElement("style");
      fix.id = "sc-leaflet-fix";
      fix.textContent = `
        /* Home Assistant sets img{max-width:100%} which breaks Leaflet tile grids */
        .leaflet-container img.leaflet-tile,
        .leaflet-tile-container img,
        .leaflet-container .leaflet-tile {
          max-width: none !important;
          max-height: none !important;
        }
      `;
      document.head.appendChild(fix);
    }
    if (window.L) return Promise.resolve(window.L);
    if (this._leafletPromise) return this._leafletPromise;
    this._leafletPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="/local/spacecadets/leaflet/leaflet.js"]');
      const done = () => {
        if (window.L?.Icon?.Default) {
          window.L.Icon.Default.mergeOptions({
            iconRetinaUrl: "/local/spacecadets/leaflet/images/marker-icon-2x.png",
            iconUrl: "/local/spacecadets/leaflet/images/marker-icon.png",
            shadowUrl: "/local/spacecadets/leaflet/images/marker-shadow.png",
          });
        }
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet missing after load"));
      };
      if (existing) {
        if (window.L) done();
        else existing.addEventListener("load", done);
        return;
      }
      const script = document.createElement("script");
      script.src = "/local/spacecadets/leaflet/leaflet.js";
      script.onload = done;
      script.onerror = () => reject(new Error("Leaflet failed to load"));
      document.head.appendChild(script);
    });
    return this._leafletPromise;
  }

  _lockAppScroll(lock) {
    const app = this._root;
    if (!app) return;
    if (lock) {
      this._appScrollTop = app.scrollTop;
      app.classList.add("sc-scroll-lock");
      app.style.top = `-${this._appScrollTop}px`;
    } else {
      app.classList.remove("sc-scroll-lock");
      app.style.top = "";
      app.scrollTop = this._appScrollTop || 0;
    }
  }

  _scheduleMapResize(map, { refit = false } = {}) {
    const kicks = [0, 40, 120, 280, 500];
    kicks.forEach((ms) => {
      setTimeout(() => {
        if (this._trailMap !== map) return;
        try {
          map.invalidateSize({ animate: false });
          // Only refit on first settle — never while the user is panning/zooming
          if (refit && ms === 120 && this._trailFitBounds) {
            map.fitBounds(this._trailFitBounds, { animate: false, maxZoom: 15, padding: [28, 28] });
          }
        } catch (_) {}
      }, ms);
    });
  }

  _localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  _bestTrailEntity(personId) {
    const st = this._s(personId);
    const trackers = st?.attributes?.device_trackers || [];
    const phone = trackers.find((t) => /iphone|phone|pixel|android|galaxy/i.test(t));
    // Prefer phone GPS over person aggregate / Mac Wi-Fi
    return phone || trackers[0] || personId;
  }

  _notifyServiceFor(personId) {
    const ent = this._bestTrailEntity(personId);
    if (ent && ent.startsWith("device_tracker.")) {
      const slug = ent.split(".")[1];
      if (this._hass?.services?.notify?.["mobile_app_" + slug]) return "mobile_app_" + slug;
    }
    // Fallback: known phones by person
    const known = {
      "person.isaac_norris": "mobile_app_isaacs_iphone_14",
      "person.jared_lee_lyons": "mobile_app_jareds_iphone",
    };
    const svc = known[personId];
    if (svc && this._hass?.services?.notify?.[svc]) return svc;
    return null;
  }

  _requestLocation(personId) {
    const svc = this._notifyServiceFor(personId);
    if (!svc) return false;
    try {
      this._call("notify", svc, { message: "request_location_update" });
      return true;
    } catch (_) { return false; }
  }

  _trackerFix(ent) {
    const s = this._s(ent);
    if (!s) return "";
    const a = s.attributes || {};
    return `${s.last_updated}|${a.latitude}|${a.longitude}`;
  }

  _locateNow(personId) {
    const name = this._name(personId);
    const ent = this._bestTrailEntity(personId);
    const ok = this._requestLocation(personId);
    const status = this.querySelector("#sc-trail-status");
    const btn = this.querySelector("#sc-trail-locate");
    if (btn) { btn.classList.remove("located"); btn.classList.toggle("pinging", ok); }
    if (status) {
      status.textContent = ok ? `PINGING ${(name || "DEVICE").toUpperCase()}'S DEVICE…` : "LIVE PING UNAVAILABLE FOR THIS CREW";
      status.classList.add("show");
    }
    if (!ok) {
      setTimeout(() => { status && status.classList.remove("show"); btn && btn.classList.remove("pinging"); }, 2600);
      return;
    }
    // Make sure we're viewing today so the fresh fix appears
    const todayKey = this._localDateKey(new Date());
    if (this._crewTrailDayKey !== todayKey) { this._crewTrailDayKey = todayKey; this._refreshTrailDayChips(); }

    const baseFix = this._trackerFix(ent);
    const started = Date.now();
    let pings = 1;              // already sent one above
    let lastPing = Date.now();
    clearInterval(this._locatePoll);
    this._locatePoll = setInterval(async () => {
      if (!this._crewTrailPerson) { clearInterval(this._locatePoll); return; }
      const s = this._s(ent);
      const curFix = this._trackerFix(ent);
      const changed = curFix && curFix !== baseFix && s?.attributes?.latitude != null;
      // Re-send the wake push a couple more times (iOS silent pushes are unreliable)
      if (!changed && pings < 3 && Date.now() - lastPing >= 5000) {
        this._requestLocation(personId);
        pings++;
        lastPing = Date.now();
      }
      if (changed) {
        clearInterval(this._locatePoll);
        await this._loadCrewTrailDay({ reuseMap: true });
        // Zoom + center on the fresh point with a live blue ring
        this._postTrailMap({ type: "sc-trail-live", lat: s.attributes.latitude, lon: s.attributes.longitude });
        if (btn) { btn.classList.remove("pinging"); btn.classList.add("located"); setTimeout(() => btn.classList.remove("located"), 2600); }
        if (status) {
          status.textContent = `● LIVE FIX · ${name.toUpperCase()}`;
          status.classList.add("show");
          setTimeout(() => status.classList.remove("show"), 1900);
        }
        return;
      }
      if (Date.now() - started > 30000) {
        clearInterval(this._locatePoll);
        if (btn) btn.classList.remove("pinging");
        if (status) { status.textContent = "NO LIVE FIX — SHOWING LAST KNOWN"; setTimeout(() => status.classList.remove("show"), 2800); }
      }
    }, 1500);
  }

  _trailArchiveSlug(personId) {
    const ent = this._bestTrailEntity(personId) || "";
    if (/isaac/i.test(ent) || /isaac/i.test(personId || "")) return "isaac";
    if (/jared/i.test(ent) || /jared/i.test(personId || "")) return "jared";
    return null;
  }

  async _loadTrailArchiveIndex(slug) {
    if (!slug) return null;
    if (this._trailArchiveIndex?.[slug]) return this._trailArchiveIndex[slug];
    try {
      const res = await fetch(`/local/spacecadets/location-history/index.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const all = await res.json();
      this._trailArchiveIndex = all || {};
      return all?.[slug] || null;
    } catch (e) {
      console.warn("trail archive index", e);
      return null;
    }
  }

  async _fetchArchiveDayPoints(slug, dayKey) {
    if (!slug || !dayKey) return [];
    try {
      const res = await fetch(
        `/local/spacecadets/location-history/${encodeURIComponent(slug)}/${encodeURIComponent(dayKey)}.json?t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .map((r) => {
          const lat = Number(r[0]);
          const lon = Number(r[1]);
          const t = Number(r[2]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) return null;
          return { lat, lon, t, state: "archive" };
        })
        .filter(Boolean)
        .sort((a, b) => a.t - b.t);
    } catch (_) {
      return [];
    }
  }

  _trailDayWindows() {
    // Scrollable day chips: today → older. Default ~1 year; Older → adds another year.
    const count = Math.max(30, this._crewTrailDayCount || 400);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysWith = this._trailDaysWithData || {};
    const days = [];
    for (let i = 0; i < count; i++) {
      const dayStart = new Date(startOfToday);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const key = this._localDateKey(dayStart);
      let label;
      if (i === 0) label = "TODAY";
      else if (i === 1) label = "YESTERDAY";
      else {
        label = dayStart
          .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          .toUpperCase();
      }
      days.push({
        key,
        label,
        start: dayStart,
        end: i === 0 ? now : dayEnd,
        hasData: !!daysWith[key],
        count: daysWith[key] || 0,
      });
    }
    return days;
  }

  _selectedTrailDay() {
    const days = this._trailDayWindows();
    const key = this._crewTrailDayKey;
    return days.find((d) => d.key === key) || days[0];
  }

  _dedupeTrailPoints(pts) {
    const cleaned = [];
    for (const p of pts) {
      const prev = cleaned[cleaned.length - 1];
      if (!prev) {
        cleaned.push(p);
        continue;
      }
      const d = this._haversineM(prev.lat, prev.lon, p.lat, p.lon);
      if (d < 12 && p.t - prev.t < 3 * 60 * 1000) cleaned[cleaned.length - 1] = p;
      else cleaned.push(p);
    }
    return cleaned;
  }

  async _fetchTrailPoints(entityId, start, end) {
    if (!this._hass?.callApi) return [];
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const path =
      `history/period/${encodeURIComponent(startIso)}` +
      `?filter_entity_id=${encodeURIComponent(entityId)}` +
      `&end_time=${encodeURIComponent(endIso)}` +
      `&significant_changes_only=0`;
    let rows = [];
    try {
      const hist = await this._hass.callApi("GET", path);
      rows = hist?.[0] || [];
    } catch (e) {
      console.warn("trail history failed", e);
      return [];
    }
    const pts = [];
    for (const r of rows) {
      const a = r.attributes || {};
      const lat = Number(a.latitude);
      const lon = Number(a.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) continue;
      const t = Date.parse(r.last_changed || r.last_updated || r.time || 0);
      if (!Number.isFinite(t)) continue;
      pts.push({ lat, lon, t, state: r.state });
    }
    pts.sort((a, b) => a.t - b.t);
    return this._dedupeTrailPoints(pts);
  }

  async _fetchTrailPointsMerged(personId, day) {
    const entityId = this._bestTrailEntity(personId);
    const slug = this._trailArchiveSlug(personId);
    const [archivePts, histPts] = await Promise.all([
      slug ? this._fetchArchiveDayPoints(slug, day.key) : Promise.resolve([]),
      this._fetchTrailPoints(entityId, day.start, day.end),
    ]);
    // Merge by timestamp; prefer denser combined set
    const byT = new Map();
    for (const p of [...archivePts, ...histPts]) {
      const k = Math.round(p.t / 1000);
      if (!byT.has(k)) byT.set(k, p);
    }
    return this._dedupeTrailPoints([...byT.values()].sort((a, b) => a.t - b.t));
  }

  _haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(lat2 - lat1);
    const dLon = toR(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  _trailDistanceKm(pts) {
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += this._haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    return m / 1000;
  }

  _openCrew() {
    this._modalOpen = true;
    this._crewTrailPerson = null;
    this._destroyTrailMap();
    this._lockAppScroll(true);
    this._renderCrew(true);
  }

  _closeCrew() {
    const m = this.querySelector("#sc-modal");
    clearInterval(this._locatePoll);
    this._lockAppScroll(false);
    if (!m) {
      this._modalOpen = false;
      this._crewTrailPerson = null;
      this._destroyTrailMap();
      return;
    }
    m.classList.remove("open", "sc-trail-open");
    this._destroyTrailMap();
    this._trailFitBounds = null;
    setTimeout(() => {
      this._modalOpen = false;
      this._crewTrailPerson = null;
      m.innerHTML = "";
      m.classList.remove("open", "sc-trail-open");
    }, 380);
  }

  _destroyTrailMap() {
    if (this._trailMap) {
      try {
        this._trailMap.remove();
      } catch (_) {}
    }
    this._trailMap = null;
    this._trailLayer = null;
    this._trailTiles = null;
    this._trailFitBounds = null;
    this._trailIframe = null;
    this._trailIframeReady = false;
    if (this._trailMsgHandler) {
      window.removeEventListener("message", this._trailMsgHandler);
      this._trailMsgHandler = null;
    }
  }

  _postTrailMap(msg) {
    const iframe = this._trailIframe || this.querySelector("#sc-trail-frame");
    if (!iframe?.contentWindow) return false;
    try {
      iframe.contentWindow.postMessage(msg, "*");
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  _ensureTrailIframe() {
    const wrap = this.querySelector("#sc-trail-map-wrap");
    if (!wrap) return null;
    let iframe = wrap.querySelector("#sc-trail-frame");
    if (iframe && this._trailIframe === iframe) return iframe;

    wrap.innerHTML = `
      <iframe
        id="sc-trail-frame"
        class="sc-trail-frame"
        title="Crew location trail"
        src="/local/spacecadets/trail-map.html?v=20260717g"
        loading="eager"
        referrerpolicy="no-referrer"
      ></iframe>
      <div class="sc-trail-status show" id="sc-trail-status">LOADING MAP…</div>`;

    iframe = wrap.querySelector("#sc-trail-frame");
    this._trailIframe = iframe;
    this._trailIframeReady = false;

    if (!this._trailMsgHandler) {
      this._trailMsgHandler = (ev) => {
        if (ev.data?.type === "sc-trail-ready") {
          this._trailIframeReady = true;
          if (this._trailPendingMsg) {
            this._postTrailMap(this._trailPendingMsg);
            this._trailPendingMsg = null;
          }
          this._postTrailMap({ type: "sc-trail-resize" });
        }
      };
      window.addEventListener("message", this._trailMsgHandler);
    }

    iframe.addEventListener("load", () => {
      // Fallback if ready message raced
      this._trailIframeReady = true;
      if (this._trailPendingMsg) {
        this._postTrailMap(this._trailPendingMsg);
        this._trailPendingMsg = null;
      }
      this._postTrailMap({ type: "sc-trail-resize" });
    });

    return iframe;
  }

  _renderCrew(animateIn = false) {
    const m = this.querySelector("#sc-modal");
    if (!m) return;
    this._crewTrailPerson = null;
    this._destroyTrailMap();
    m.classList.remove("sc-trail-open");
    const crew = this._crewIds();
    const homeCount = crew.filter((id) => this._isHome(id)).length;
    const summary =
      homeCount === crew.length
        ? "FULL CREW ON SITE"
        : homeCount === 0
        ? "ALL CREW OFF-SITE"
        : `${homeCount} OF ${crew.length} ON SITE`;

    const wasOpen = m.classList.contains("open");
    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-modal-bd"></div>
      <div class="sc-modal glass sc-modal-crew">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">CREW STATUS</div>
            <div class="sc-modal-sub">${summary} · TAP A CADET FOR TRAIL</div>
          </div>
          <button class="sc-modal-x" id="sc-modal-x">✕</button>
        </div>
        <div class="sc-crew-list">
          ${crew
            .map((id, i) => {
              const st = this._s(id);
              const home = this._isHome(st);
              const pic = st.attributes?.entity_picture;
              const loc = home ? "At LaunchPad" : this._geocoded(id) || this._locationShort(id);
              const trackers = (st.attributes?.device_trackers || []).length;
              return `
              <button type="button" class="sc-crew-card ${home ? "home" : "away"}" style="--i:${i}" data-crew="${id}">
                <div class="sc-crew-ava" style="${pic ? `background-image:url('${pic}')` : ""}">${pic ? "" : "👤"}</div>
                <div class="sc-crew-info">
                  <div class="sc-crew-name">${this._name(id)}</div>
                  <div class="sc-crew-loc">${loc}</div>
                  <div class="sc-crew-meta">${trackers} device${trackers === 1 ? "" : "s"} · TAP FOR MAP</div>
                </div>
                <div class="sc-crew-badge ${home ? "on" : "off"}">${home ? "HOME" : "AWAY"}</div>
              </button>`;
            })
            .join("")}
        </div>
        <div class="sc-modal-foot">LOCATION HISTORY · INDEFINITE ARCHIVE</div>
      </div>`;
    m.querySelector("#sc-modal-bd").addEventListener("click", () => this._closeCrew());
    m.querySelector("#sc-modal-x").addEventListener("click", () => this._closeCrew());
    m.querySelectorAll("[data-crew]").forEach((el) => {
      el.addEventListener("click", () => this._openCrewTrail(el.dataset.crew));
    });
    if (animateIn || !wasOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
    } else {
      m.classList.add("open");
    }
  }

  _refreshCrewTrailHeader() {
    // lightweight — avoid wiping the map on hass updates
    const name = this.querySelector("#sc-trail-name");
    if (name && this._crewTrailPerson) name.textContent = this._name(this._crewTrailPerson);
  }

  async _openCrewTrail(personId) {
    this._crewTrailPerson = personId;
    this._crewTrailDayCount = 400; // ~13 months of day chips
    this._crewTrailDayKey = this._localDateKey(new Date());
    this._crewTrailCache = {};
    this._trailTileFallback = false;
    this._trailDaysWithData = {};
    const slug = this._trailArchiveSlug(personId);
    const idx = await this._loadTrailArchiveIndex(slug);
    if (idx?.days) this._trailDaysWithData = { ...idx.days };
    // Extend chip window to earliest archived day if older than default
    if (idx?.day_list?.length) {
      const earliest = idx.day_list[idx.day_list.length - 1];
      const earliestDate = new Date(earliest + "T12:00:00");
      const today = new Date();
      const diff = Math.ceil((today - earliestDate) / 86400000) + 5;
      if (diff > this._crewTrailDayCount) this._crewTrailDayCount = Math.min(diff, 3700);
    }
    await this._renderCrewTrail(true);
    // Actively ask the device for a fresh GPS fix the moment the trail opens
    this._locateNow(personId);
  }

  _bindTrailDayChips(root) {
    const strip = root.querySelector("#sc-trail-days");
    if (!strip) return;
    strip.querySelectorAll("[data-day-key]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.dataset.dayKey;
        if (!key || key === this._crewTrailDayKey) return;
        this._crewTrailDayKey = key;
        strip.querySelectorAll("[data-day-key]").forEach((b) => b.classList.toggle("active", b.dataset.dayKey === key));
        const lab = root.querySelector("#sc-trail-day-label");
        const day = this._selectedTrailDay();
        if (lab && day) lab.textContent = day.label;
        this._loadCrewTrailDay({ reuseMap: true });
      });
    });
    const more = root.querySelector("#sc-trail-more-days");
    if (more) {
      more.addEventListener("click", () => {
        this._crewTrailDayCount = (this._crewTrailDayCount || 400) + 365;
        this._refreshTrailDayChips();
      });
    }
  }

  _refreshTrailDayChips() {
    const strip = this.querySelector("#sc-trail-days");
    if (!strip) return;
    const days = this._trailDayWindows();
    const key = this._crewTrailDayKey || days[0].key;
    strip.innerHTML =
      days
        .map(
          (d) => `
        <button type="button" class="sc-trail-day-chip ${d.key === key ? "active" : ""} ${d.hasData ? "has-data" : ""}" data-day-key="${d.key}" title="${d.count ? d.count + " pings" : "no archived pings"}">${d.label}</button>`
        )
        .join("") +
      `<button type="button" class="sc-trail-day-chip more" id="sc-trail-more-days">+1 YEAR →</button>`;
    this._bindTrailDayChips(this.querySelector("#sc-modal") || this);
  }

  async _renderCrewTrail(animateIn = false) {
    const m = this.querySelector("#sc-modal");
    if (!m || !this._crewTrailPerson) return;
    const personId = this._crewTrailPerson;
    if (!this._crewTrailDayCount) this._crewTrailDayCount = 90;
    const days = this._trailDayWindows();
    if (!this._crewTrailDayKey) this._crewTrailDayKey = days[0].key;
    const day = this._selectedTrailDay();
    const trailEntity = this._bestTrailEntity(personId);
    const st = this._s(personId);
    const pic = st?.attributes?.entity_picture;

    // Destroy any prior map before replacing DOM
    this._destroyTrailMap();
    m.classList.add("sc-trail-open");

    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-modal-bd"></div>
      <div class="sc-modal sc-modal-trail">
        <div class="sc-modal-head">
          <div class="sc-trail-head">
            <button type="button" class="sc-trail-back" id="sc-trail-back">← CREW</button>
            <div class="sc-trail-identity">
              <div class="sc-crew-ava sc-trail-ava" style="${pic ? `background-image:url('${pic}')` : ""}">${pic ? "" : "👤"}</div>
              <div>
                <div class="sc-card-title" style="margin:0" id="sc-trail-name">${this._name(personId)}</div>
                <div class="sc-modal-sub">TRAIL · ${this._name(trailEntity)}</div>
              </div>
              <button type="button" class="sc-trail-locate" id="sc-trail-locate" title="Ping device for live location">${this._ic("target")}<span>LOCATE</span></button>
            </div>
          </div>
          <button class="sc-modal-x" id="sc-modal-x">✕</button>
        </div>

        <div class="sc-trail-day">
          <div class="sc-trail-day-label" id="sc-trail-day-label">${day.label}</div>
          <div class="sc-trail-days" id="sc-trail-days">
            ${days
              .map(
                (d) => `
              <button type="button" class="sc-trail-day-chip ${d.key === day.key ? "active" : ""} ${d.hasData ? "has-data" : ""}" data-day-key="${d.key}" title="${d.count ? d.count + " pings" : "no archived pings"}">${d.label}</button>`
              )
              .join("")}
            <button type="button" class="sc-trail-day-chip more" id="sc-trail-more-days">+1 YEAR →</button>
          </div>
        </div>

        <div class="sc-trail-map-wrap" id="sc-trail-map-wrap">
          <iframe
            id="sc-trail-frame"
            class="sc-trail-frame"
            title="Crew location trail"
            src="/local/spacecadets/trail-map.html?v=20260717h"
            loading="eager"
            referrerpolicy="no-referrer"
          ></iframe>
          <div class="sc-trail-status show" id="sc-trail-status">LOADING MAP…</div>
        </div>

        <div class="sc-trail-stats" id="sc-trail-stats">
          <div><span>POINTS</span><strong>—</strong></div>
          <div><span>DISTANCE</span><strong>—</strong></div>
          <div><span>SPAN</span><strong>—</strong></div>
        </div>
      </div>`;

    m.querySelector("#sc-modal-bd").addEventListener("click", () => this._closeCrew());
    m.querySelector("#sc-modal-x").addEventListener("click", () => this._closeCrew());
    m.querySelector("#sc-trail-back").addEventListener("click", () => {
      clearInterval(this._locatePoll);
      this._destroyTrailMap();
      this._renderCrew(true);
    });
    m.querySelector("#sc-trail-locate")?.addEventListener("click", () => this._locateNow(this._crewTrailPerson));
    this._bindTrailDayChips(m);
    this._trailIframe = m.querySelector("#sc-trail-frame");
    this._trailIframeReady = false;
    if (!this._trailMsgHandler) {
      this._trailMsgHandler = (ev) => {
        if (ev.data?.type === "sc-trail-ready") {
          this._trailIframeReady = true;
          if (this._trailPendingMsg) {
            this._postTrailMap(this._trailPendingMsg);
            this._trailPendingMsg = null;
          }
          this._postTrailMap({ type: "sc-trail-resize" });
        }
      };
      window.addEventListener("message", this._trailMsgHandler);
    }
    this._trailIframe?.addEventListener("load", () => {
      this._trailIframeReady = true;
      if (this._trailPendingMsg) {
        this._postTrailMap(this._trailPendingMsg);
        this._trailPendingMsg = null;
      }
      this._postTrailMap({ type: "sc-trail-resize" });
    });

    if (animateIn) {
      requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
    } else {
      m.classList.add("open");
    }
    await new Promise((r) => setTimeout(r, animateIn ? 100 : 20));
    await this._loadCrewTrailDay({ reuseMap: true });
  }

  async _loadCrewTrailDay({ reuseMap = true } = {}) {
    const personId = this._crewTrailPerson;
    const status = this.querySelector("#sc-trail-status");
    const stats = this.querySelector("#sc-trail-stats");
    if (!personId) return;

    // Isolated Leaflet iframe — avoids HA CSS stacking bugs (tiles covering the path)
    if (!this.querySelector("#sc-trail-frame")) this._ensureTrailIframe();
    this._trailIframe = this.querySelector("#sc-trail-frame");

    const day = this._selectedTrailDay();
    const trailEntity = this._bestTrailEntity(personId);
    const cacheKey = `${trailEntity}|${day.key}`;

    if (status) {
      status.textContent = "LOADING PATH…";
      status.classList.add("show");
    }

    let pts = this._crewTrailCache?.[cacheKey];
    if (!pts) {
      pts = await this._fetchTrailPointsMerged(personId, day);
      this._crewTrailCache = this._crewTrailCache || {};
      this._crewTrailCache[cacheKey] = pts;
      if (pts.length) {
        this._trailDaysWithData = this._trailDaysWithData || {};
        this._trailDaysWithData[day.key] = pts.length;
        // refresh chip styling lightly
        const chip = this.querySelector(`[data-day-key="${day.key}"]`);
        if (chip) chip.classList.add("has-data");
      }
    }

    const dist = this._trailDistanceKm(pts);
    const span =
      pts.length >= 2
        ? `${new Date(pts[0].t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} → ${new Date(pts[pts.length - 1].t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : "—";
    if (stats) {
      stats.innerHTML = `
        <div><span>POINTS</span><strong>${pts.length}</strong></div>
        <div><span>DISTANCE</span><strong>${pts.length ? dist.toFixed(1) + " KM" : "—"}</strong></div>
        <div><span>SPAN</span><strong>${span}</strong></div>`;
    }

    const home = this._homeCoords();
    const msg = {
      type: "sc-trail-set",
      label: day.label,
      home: { lat: home.lat, lon: home.lon },
      points: pts.map((p) => [p.lat, p.lon]),
    };

    if (this._trailIframeReady) {
      this._postTrailMap(msg);
      this._postTrailMap({ type: "sc-trail-resize" });
    } else {
      this._trailPendingMsg = msg;
      // Also try immediately — load handler may have already fired
      this._postTrailMap(msg);
    }

    if (status) {
      if (!pts.length) {
        status.textContent = "NO GPS POINTS FOR THIS DAY";
        status.classList.add("show");
      } else {
        status.textContent = `${day.label} · ${pts.length} PINGS`;
        setTimeout(() => status.classList.remove("show"), 1400);
      }
    }

    // Keep iframe sized after modal animation
    [50, 200, 450].forEach((ms) => {
      setTimeout(() => this._postTrailMap({ type: "sc-trail-resize" }), ms);
    });
  }

  /* ---------- bind view events ---------- */
  _bind(root) {
    root.querySelectorAll("[data-act]").forEach((el) => {
      const act = el.dataset.act;
      if (act === "select") {
        el.addEventListener("change", () => this._selectOption(el.dataset.entity, el.value));
        return;
      }
      if (act === "effect") {
        el.addEventListener("change", () =>
          this._call("light", "turn_on", { effect: el.value }, { entity_id: el.dataset.entity })
        );
        return;
      }
      if (act === "bright") {
        const val = el.parentElement?.querySelector(".sc-slider-val");
        el.addEventListener("input", () => { if (val) val.textContent = el.value + "%"; });
        el.addEventListener("change", () =>
          this._call("light", "turn_on", { brightness_pct: Number(el.value) }, { entity_id: el.dataset.entity })
        );
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
        if (act === "pick-effect") { this._openEffectPicker(); return; }
        if (act === "pick-palette") { this._openPalettePicker(); return; }
        if (act === "expand-player") {
          const hit = ev.target.closest("button, input, select, a, .sc-transport, .sc-vol, .sc-progress");
          if (hit && hit !== el) return;
          this._openMediaExpand(el);
          return;
        }
        if (act === "music-mode") { this._setMusicMode(el.dataset.mode); return; }
        if (act === "rem-dismiss") { this._call("script", "reminder_dismiss", { id: el.dataset.id }); return; }
        if (act === "rem-pin") { this._call("script", "reminder_pin_toggle", { id: el.dataset.id }); return; }
        if (act === "mx-close") { this._closeMediaExpand(); return; }
        if (act === "mx-back") { this._browseBack(); return; }
        if (act === "mx-open") { this._browseInto(el.dataset.mtype, el.dataset.mid, el.dataset.title); return; }
        if (act === "mx-play") { ev.stopPropagation(); this._maPlay(el.dataset.mtype, el.dataset.mid, el.dataset.title); return; }
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
          } else if (el.dataset.service === "media_play") {
            this._studioPlay();
          } else {
            this._mediaSvc(el.dataset.service);
          }
        }
      });
    });
  }
}

SpaceCadetsPanel.styles = `
@font-face{font-family:'Orbitron';font-style:normal;font-weight:500;font-display:swap;src:url('/local/spacecadets/fonts/orbitron-500.woff2') format('woff2')}
@font-face{font-family:'Orbitron';font-style:normal;font-weight:700;font-display:swap;src:url('/local/spacecadets/fonts/orbitron-700.woff2') format('woff2')}
@font-face{font-family:'Rajdhani';font-style:normal;font-weight:400;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-400.woff2') format('woff2')}
@font-face{font-family:'Rajdhani';font-style:normal;font-weight:500;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-500.woff2') format('woff2')}
@font-face{font-family:'Rajdhani';font-style:normal;font-weight:600;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-600.woff2') format('woff2')}
@font-face{font-family:'Rajdhani';font-style:normal;font-weight:700;font-display:swap;src:url('/local/spacecadets/fonts/rajdhani-700.woff2') format('woff2')}

:host, .sc-app {
  display: block; width: 100%; height: 100%; min-height: 100vh;
  color: #f3e9ff; font-family: "Rajdhani", "Segoe UI", system-ui, sans-serif;
}
.sc-app {
  position: relative;
  display: grid; grid-template-columns: 1fr; min-height: 100%;
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

.sc-main { padding: 14px 16px 24px; display: flex; flex-direction: column; gap: 12px; max-width: 1400px; margin: 0 auto; width: 100%; box-sizing: border-box; }
.sc-top { display: flex; flex-direction: column; gap: 10px; }
.sc-top-greet-row {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
}
.sc-menu-spacer { width: 58px; height: 1px; }
.sc-greet { text-align: center; min-width: 0; }
.sc-greet-line {
  font-family: Orbitron, "Rajdhani", sans-serif; font-weight: 700;
  font-size: clamp(16px, 4.2vw, 30px); letter-spacing: 0.04em; line-height: 1.2;
  background: linear-gradient(90deg, #f0abfc, #c084fc, #67e8f9);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 18px rgba(232,121,249,0.55));
}
.sc-greet-sub { color: #a5b4fc; letter-spacing: 0.18em; margin-top: 4px; font-size: clamp(10px, 2.5vw, 13px); }
.sc-top-meta {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
  width: 100%;
}
.sc-meta-block {
  min-width: 0; padding: 8px 10px; border-radius: 14px; background: rgba(24, 8, 48, 0.55);
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
  display: flex; justify-content: center; align-items: center;
  padding: 10px 14px;
}
.sc-studiobar-btns { display: flex; gap: 12px; justify-content: center; align-items: center; width: 100%; }
.sc-studiobar .sc-chip { min-width: 140px; text-align: center; }

.sc-grid { display: grid; grid-template-columns: 1fr; grid-auto-rows: minmax(0, auto); gap: 12px; }
.sc-col.hero {
  grid-column: 1 / -1;
  min-height: 220px;
  max-height: 340px;
  /* NOTE: no aspect-ratio here — with a max-height it would derive (and cap)
     the hero's WIDTH from the height, overriding grid stretch and leaving the
     block narrower + left-aligned once the column is wider than ~384px. Height
     is driven by min/max-height + content so the block always fills its column. */
  position: relative;
  overflow: hidden;
  padding: 0;
}
.sc-col.hero.live { box-shadow: 0 0 0 1px rgba(74,222,128,0.35), 0 0 40px rgba(74,222,128,0.18), 0 20px 50px rgba(0,0,0,0.45); }
.sc-row.quick { grid-column: 1 / -1; }
.sc-row.weather { grid-column: 1 / -1; }
.sc-row.mantra { grid-column: 1 / -1; }
.sc-row.env { grid-column: 1 / -1; }
.sc-row.reminders { grid-column: 1 / -1; }
.sc-full { grid-column: 1 / -1; padding: 20px; }

.sc-card-title { font-family: Orbitron, sans-serif; font-size: 12px; letter-spacing: 0.2em; color: #e9d5ff; margin-bottom: 14px; text-shadow: 0 0 14px rgba(232,121,249,0.45); }
.sc-card-title svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: 8px; }

/* Reminders block */
.sc-rem-list { display: grid; gap: 10px; }
.sc-rem-sub { font-family: Orbitron, sans-serif; font-size: 10px; letter-spacing: 0.24em; color: #c4b5fd; opacity: 0.72; margin: 18px 0 10px; }
.sc-rem { display: flex; align-items: center; gap: 14px; border: 1px solid rgba(216,180,254,0.2); background: rgba(24, 8, 48, 0.42); border-radius: 16px; padding: 13px 14px; transition: 0.2s ease; }
.sc-rem:hover { border-color: rgba(216,180,254,0.4); }
.sc-rem.overdue { border-color: rgba(251,191,36,0.5); box-shadow: inset 0 0 22px rgba(251,191,36,0.12); }
.sc-rem.pinned { border-color: rgba(94,234,212,0.4); box-shadow: inset 0 0 22px rgba(45,212,191,0.1); }
.sc-rem-tick { width: 9px; height: 9px; border-radius: 50%; flex: none; background: radial-gradient(circle at 30% 30%, #e879f9, #a855f7); box-shadow: 0 0 12px rgba(232,121,249,0.7); }
.sc-rem.overdue .sc-rem-tick { background: radial-gradient(circle at 30% 30%, #fde68a, #f59e0b); box-shadow: 0 0 12px rgba(251,191,36,0.8); animation: sc-rem-pulse 1.6s ease-in-out infinite; }
.sc-rem.pinned .sc-rem-tick { background: radial-gradient(circle at 30% 30%, #99f6e4, #14b8a6); box-shadow: 0 0 12px rgba(45,212,191,0.7); }
@keyframes sc-rem-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: 0.55; } }
.sc-rem-body { flex: 1; min-width: 0; }
.sc-rem-msg { font-family: Rajdhani, sans-serif; font-weight: 600; font-size: 16px; color: #f5ecff; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-rem-when { font-family: Orbitron, sans-serif; font-size: 10px; letter-spacing: 0.14em; color: #c4b5fd; margin-top: 5px; text-transform: uppercase; }
.sc-rem.overdue .sc-rem-when { color: #fbbf24; }
.sc-rem.pinned .sc-rem-when { color: #5eead4; }
.sc-rem-actions { display: flex; gap: 8px; flex: none; }
.sc-rem-btn { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; border: 1px solid rgba(216,180,254,0.25); background: rgba(40,14,66,0.5); color: #e9d5ff; cursor: pointer; transition: 0.18s ease; padding: 0; }
.sc-rem-btn svg { width: 18px; height: 18px; }
.sc-rem-btn:hover { transform: translateY(-1px); border-color: rgba(232,121,249,0.6); }
.sc-rem-btn.pin.on { color: #5eead4; border-color: rgba(94,234,212,0.6); box-shadow: 0 0 16px rgba(45,212,191,0.3); }
.sc-rem-btn.done:hover { color: #4ade80; border-color: rgba(74,222,128,0.6); box-shadow: 0 0 16px rgba(74,222,128,0.3); }
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
.sc-quick-ico { width: 30px; height: 30px; margin: 0 auto 8px; color: #c4b5fd; display: grid; place-items: center; filter: drop-shadow(0 0 8px rgba(192,132,252,0.4)); transition: color 0.2s ease, filter 0.2s ease; }
.sc-quick-ico svg { width: 100%; height: 100%; display: block; }
.sc-quick.lit .sc-quick-ico { color: #f0abfc; filter: drop-shadow(0 0 12px rgba(232,121,249,0.85)); }
.sc-quick-name { font-size: 13px; letter-spacing: 0.04em; }
.sc-quick-pct { margin-top: 4px; color: #67e8f9; font-weight: 700; text-shadow: 0 0 10px rgba(103,232,249,0.5); }

.sc-hero-bg {
  position: absolute; inset: 0;
  background: center/cover no-repeat;
  filter: saturate(1.2) contrast(1.05);
  transform: scale(1.02);
}
.sc-hero-bg.galaxy {
  background-image:
    linear-gradient(120deg, rgba(76,29,149,0.55), rgba(8,2,20,0.2) 40%, rgba(14,165,233,0.28)),
    url('/local/jwst/carina.jpg');
}
.sc-hero-bg.has-art {
  background-color: #0b0318;
  filter: saturate(1.15) contrast(1.08) brightness(0.85);
}
.sc-hero-bg.has-art::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(circle at 70% 30%, transparent 20%, rgba(5,1,14,0.45) 70%),
    linear-gradient(180deg, rgba(5,1,14,0.15), rgba(5,1,14,0.82));
}
.sc-hero-overlay {
  position: absolute; inset: 0; padding: 22px;
  display: flex; flex-direction: column; justify-content: flex-end;
  background: linear-gradient(180deg, transparent 15%, rgba(5,1,14,0.55) 55%, rgba(5,1,14,0.92));
}
.sc-hero-player { gap: 18px; }
.sc-hero-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
.sc-hero-kicker { letter-spacing: 0.2em; color: #a5b4fc; font-size: 11px; margin-bottom: 6px; }
.sc-hero-title {
  font-family: Orbitron, sans-serif; font-size: clamp(22px, 3vw, 32px); letter-spacing: 0.04em;
  text-shadow: 0 0 24px rgba(232,121,249,0.7); line-height: 1.15;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.sc-hero-status { margin-top: 8px; color: #c4b5fd; letter-spacing: 0.06em; font-size: 14px; }
.sc-hero-state {
  flex: 0 0 auto; padding: 8px 12px; border-radius: 999px; font-style: normal; font-weight: 700;
  font-size: 11px; letter-spacing: 0.12em; color: #67e8f9;
  background: rgba(12,6,28,0.55); border: 1px solid rgba(103,232,249,0.35);
}
.sc-col.hero.live .sc-hero-state { color: #86efac; border-color: rgba(74,222,128,0.5); background: rgba(20,83,45,0.35); }
.sc-hero-controls { display: flex; flex-direction: column; gap: 12px; }
.sc-hero-vol { margin-top: 0; max-width: 420px; }
.sc-hero-vol .sc-slider { background: linear-gradient(90deg, rgba(168,85,247,0.85), rgba(56,189,248,0.9)); }
.sc-hero .sc-transport button {
  background: rgba(12,6,28,0.55); backdrop-filter: blur(8px);
  border-color: rgba(216,180,254,0.4);
}
.sc-hero .sc-transport .big { background: linear-gradient(135deg, #e879f9, #38bdf8); }

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
.sc-transport button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(216,180,254,0.35); background: rgba(76,29,149,0.45); color: #fff; cursor: pointer; box-shadow: 0 0 14px rgba(168,85,247,0.3); font-size: 14px; display: inline-flex; align-items: center; justify-content: center; padding: 0; transition: transform 0.14s ease, background 0.16s ease, box-shadow 0.16s ease; }
.sc-transport button:hover { background: rgba(124,58,237,0.6); transform: translateY(-1px); }
.sc-transport button:active { transform: scale(0.92); }
.sc-transport button svg { width: 46%; height: 46%; display: block; }
.sc-transport button.mute.on { background: rgba(244,114,182,0.4); border-color: rgba(244,114,182,0.65); box-shadow: 0 0 16px rgba(244,114,182,0.4); }
.sc-transport .big { width: 44px; height: 44px; background: linear-gradient(135deg, #e879f9, #38bdf8); }
.sc-transport .big svg { width: 42%; height: 42%; }

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

.sc-zone-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
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

.sc-app.sc-scroll-lock {
  position: fixed !important; left: 0; right: 0; width: 100%;
  overflow: hidden !important; overscroll-behavior: none;
}
.sc-modal-root {
  position: fixed; inset: 0; z-index: 400;
  display: flex; align-items: center; justify-content: center;
  padding: 16px; box-sizing: border-box;
  pointer-events: none;
}
.sc-modal-root.open { pointer-events: auto; }
.sc-modal-backdrop {
  position: absolute; inset: 0; background: rgba(3,0,12,0.72);
  opacity: 0; backdrop-filter: blur(0px);
  transition: opacity 0.35s ease, backdrop-filter 0.35s ease;
  pointer-events: auto;
  z-index: 0;
}
.sc-modal-root.open .sc-modal-backdrop { opacity: 1; backdrop-filter: blur(10px); }
/* IMPORTANT: no CSS transform on the modal shell — Leaflet tiles break under transformed ancestors */
.sc-modal {
  position: relative; z-index: 1;
  width: min(520px, 92vw); max-height: min(90vh, 900px); overflow: auto; padding: 22px;
  pointer-events: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  opacity: 0;
  transition: opacity 0.3s ease, box-shadow 0.35s ease;
  box-shadow: 0 0 0 rgba(168,85,247,0);
}
.sc-modal-trail {
  overflow: hidden !important;
  display: flex;
  flex-direction: column;
  max-height: min(92vh, 920px);
  /* Solid panel — backdrop-filter on .glass ancestors breaks Leaflet tile compositing */
  background: #140a22 !important;
  border: 1px solid rgba(216,180,254,0.35);
  border-radius: 22px;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: 0 0 80px rgba(168,85,247,0.35), 0 24px 60px rgba(0,0,0,0.6);
}
.sc-modal-root.sc-trail-open .sc-modal-backdrop {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: rgba(2,0,10,0.88);
}
.sc-modal-root.open .sc-modal {
  opacity: 1;
  box-shadow: 0 0 80px rgba(168,85,247,0.4), 0 24px 60px rgba(0,0,0,0.55);
}
.sc-crew-card {
  display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 16px;
  border: 1px solid rgba(216,180,254,0.2); background: rgba(24,8,48,0.5);
  opacity: 0; transform: translateY(14px);
  transition: transform 0.35s ease, opacity 0.35s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  transition-delay: 0s;
  font: inherit; color: inherit; text-align: left;
}
.sc-modal-root.open .sc-crew-card {
  opacity: 1; transform: translateY(0);
  transition-delay: calc(0.06s * var(--i, 0) + 0.12s);
}
.sc-modal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.sc-modal-sub { color: #a5b4fc; letter-spacing: 0.1em; font-size: 12px; margin-top: 4px; }
.sc-modal-x { width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(216,180,254,0.35); background: rgba(76,29,149,0.4); color: #fff; cursor: pointer; font-size: 14px; }

/* ==================== ASSIST button + chat overlay ==================== */
.sc-assist-btn {
  position: relative; width: 52px; height: 52px; flex: 0 0 auto; border-radius: 16px;
  border: 1px solid rgba(216,180,254,0.4); cursor: pointer; display: grid; place-items: center;
  background: radial-gradient(120% 120% at 30% 20%, rgba(129,140,248,0.4), rgba(76,29,149,0.4));
  color: #f5d0fe; overflow: hidden; transition: 0.2s ease;
  box-shadow: 0 0 22px rgba(129,140,248,0.35), inset 0 0 18px rgba(168,85,247,0.22);
}
.sc-assist-btn svg { width: 24px; height: 24px; position: relative; z-index: 1; filter: drop-shadow(0 0 6px rgba(232,121,249,0.75)); }
.sc-assist-btn:hover { transform: translateY(-1px) scale(1.05); border-color: rgba(232,121,249,0.75); box-shadow: 0 0 34px rgba(232,121,249,0.55); }
.sc-assist-btn-glow { position: absolute; inset: -45%; opacity: 0.55; background: conic-gradient(from 0deg, rgba(232,121,249,0), rgba(129,140,248,0.6), rgba(94,234,212,0.35), rgba(232,121,249,0)); animation: sc-assist-spin 6s linear infinite; }
@keyframes sc-assist-spin { to { transform: rotate(360deg); } }

.sc-assist-modal { z-index: 500; }
.sc-assist-backdrop {
  position: absolute; inset: 0; background: rgba(6,2,18,0.32);
  opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px);
  transition: opacity 0.4s ease, backdrop-filter 0.4s ease, -webkit-backdrop-filter 0.4s ease;
  pointer-events: auto;
}
.sc-assist-modal.open .sc-assist-backdrop { opacity: 1; backdrop-filter: blur(20px) saturate(1.15); -webkit-backdrop-filter: blur(20px) saturate(1.15); }
.sc-assist-panel {
  position: relative; z-index: 1; margin: auto; width: min(560px, 96vw);
  max-height: min(86vh, 840px); display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid rgba(216,180,254,0.3); border-radius: 26px;
  background: linear-gradient(180deg, rgba(22,11,38,0.94), rgba(11,5,22,0.96));
  box-shadow: 0 0 90px rgba(129,140,248,0.35), 0 30px 70px rgba(0,0,0,0.62);
  opacity: 0; transform: translateY(26px) scale(0.97);
  transition: opacity 0.42s cubic-bezier(.22,1,.36,1), transform 0.42s cubic-bezier(.22,1,.36,1);
}
.sc-assist-modal.open .sc-assist-panel { opacity: 1; transform: none; }

.sc-assist-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; border-bottom: 1px solid rgba(216,180,254,0.14); }
.sc-assist-title { display: flex; align-items: center; gap: 11px; font-family: Orbitron, sans-serif; font-size: 12px; letter-spacing: 0.22em; color: #e9d5ff; }
.sc-assist-orb { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 34% 30%, #a5b4fc, #7c3aed 62%, #4c1d95); box-shadow: 0 0 16px rgba(129,140,248,0.75); animation: sc-orb-breathe 3s ease-in-out infinite; }
@keyframes sc-orb-breathe { 0%,100% { transform: scale(1); box-shadow: 0 0 16px rgba(129,140,248,0.6); } 50% { transform: scale(1.12); box-shadow: 0 0 24px rgba(129,140,248,0.9); } }
.sc-assist-modal.processing .sc-assist-orb { animation-duration: 0.9s; }
.sc-assist-x { width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(216,180,254,0.35); background: rgba(76,29,149,0.4); color: #fff; cursor: pointer; display: grid; place-items: center; }
.sc-assist-x svg { width: 16px; height: 16px; }
.sc-assist-headl { display: flex; align-items: center; gap: 11px; min-width: 0; }
.sc-assist-titlewrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sc-assist-pipe { display: inline-flex; align-items: center; gap: 5px; max-width: 230px; padding: 2px 2px; border: none; background: none; color: #a5b4fc; font-family: Rajdhani, sans-serif; font-weight: 600; font-size: 13px; cursor: pointer; }
.sc-assist-pipe span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-assist-pipe svg { width: 13px; height: 13px; flex: 0 0 auto; transition: transform 0.2s ease; }
.sc-assist-pipe:hover { color: #e9d5ff; }
.sc-assist-modal.pipe-open .sc-assist-pipe svg { transform: rotate(180deg); }
.sc-assist-pipe-menu { position: absolute; z-index: 6; left: 16px; top: 66px; width: min(320px, 82vw); max-height: 52vh; overflow-y: auto; padding: 8px; border-radius: 16px; border: 1px solid rgba(216,180,254,0.28); background: rgba(18,9,32,0.98); box-shadow: 0 20px 50px rgba(0,0,0,0.6); -webkit-overflow-scrolling: touch; }
.sc-assist-pipe-menu[hidden] { display: none; }
.sc-pipe-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; background: none; color: #e9d5ff; font: inherit; font-family: Rajdhani, sans-serif; font-size: 15px; cursor: pointer; }
.sc-pipe-item:hover { background: rgba(76,29,149,0.35); }
.sc-pipe-item.active { border-color: rgba(232,121,249,0.5); background: rgba(76,29,149,0.5); }
.sc-pipe-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sc-pipe-meta { font-size: 11px; color: #8b7ab8; text-transform: uppercase; letter-spacing: 0.06em; }
.sc-pipe-check { flex: 0 0 auto; color: #e879f9; opacity: 0; }
.sc-pipe-check svg { width: 16px; height: 16px; }
.sc-pipe-item.active .sc-pipe-check { opacity: 1; }

.sc-assist-thread { flex: 1; min-height: 200px; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 11px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.sc-bubble { max-width: 82%; padding: 11px 15px; border-radius: 18px; font-family: Rajdhani, sans-serif; font-weight: 500; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; animation: sc-bubble-in 0.3s ease both; }
@keyframes sc-bubble-in { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
.sc-bubble.user { align-self: flex-end; background: linear-gradient(135deg, #a21caf, #7c3aed); color: #fff; border-bottom-right-radius: 6px; box-shadow: 0 6px 20px rgba(168,85,247,0.35); }
.sc-bubble.assistant { align-self: flex-start; background: rgba(42,21,68,0.72); border: 1px solid rgba(216,180,254,0.18); color: #f5ecff; border-bottom-left-radius: 6px; }
.sc-bubble.system { align-self: center; background: none; color: #a5b4fc; font-size: 12px; letter-spacing: 0.06em; text-align: center; max-width: 90%; }
.sc-typing { display: inline-flex; gap: 4px; align-items: center; padding: 2px 0; }
.sc-typing i { width: 7px; height: 7px; border-radius: 50%; background: #c4b5fd; animation: sc-typing 1s infinite ease-in-out; }
.sc-typing i:nth-child(2) { animation-delay: 0.15s; }
.sc-typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes sc-typing { 0%,60%,100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }

.sc-assist-status { height: 0; overflow: hidden; display: flex; align-items: center; gap: 12px; padding: 0 20px; transition: height 0.28s ease; }
.sc-assist-modal.listening .sc-assist-status { height: 44px; }
.sc-assist-wave { display: flex; align-items: center; gap: 3px; height: 30px; }
.sc-assist-wave i { width: 4px; height: 8px; border-radius: 2px; background: linear-gradient(#e879f9, #818cf8); animation: sc-wave 1s infinite ease-in-out; animation-delay: calc(var(--d) * 0.09s); }
@keyframes sc-wave { 0%,100% { height: 7px; } 50% { height: 26px; } }
.sc-assist-status-label { font-family: Orbitron, sans-serif; font-size: 10px; letter-spacing: 0.2em; color: #e879f9; text-transform: uppercase; }
.sc-assist-modal.processing .sc-assist-status-label { color: #a5b4fc; }

.sc-assist-input { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-top: 1px solid rgba(216,180,254,0.14); background: rgba(9,4,18,0.55); }
.sc-assist-mic { width: 46px; height: 46px; flex: 0 0 auto; border-radius: 50%; border: 1px solid rgba(216,180,254,0.3); background: rgba(40,14,66,0.6); color: #e9d5ff; cursor: pointer; display: grid; place-items: center; transition: 0.18s ease; }
.sc-assist-mic svg { width: 22px; height: 22px; }
.sc-assist-mic:hover { border-color: rgba(232,121,249,0.6); }
.sc-assist-mic.on { background: linear-gradient(135deg, #e879f9, #a855f7); color: #fff; border-color: transparent; animation: sc-mic-pulse 1.4s infinite; }
@keyframes sc-mic-pulse { 0% { box-shadow: 0 0 0 0 rgba(232,121,249,0.55); } 70% { box-shadow: 0 0 0 14px rgba(232,121,249,0); } 100% { box-shadow: 0 0 0 0 rgba(232,121,249,0); } }
.sc-assist-text { flex: 1; min-width: 0; background: rgba(24,8,48,0.6); border: 1px solid rgba(216,180,254,0.22); border-radius: 24px; padding: 12px 16px; color: #f5ecff; font: inherit; font-family: Rajdhani, sans-serif; font-size: 16px; outline: none; transition: 0.18s ease; }
.sc-assist-text::placeholder { color: #8b7ab8; }
.sc-assist-text:focus { border-color: rgba(232,121,249,0.6); box-shadow: 0 0 20px rgba(232,121,249,0.22); }
.sc-assist-send { width: 46px; height: 46px; flex: 0 0 auto; border-radius: 50%; border: none; background: linear-gradient(135deg, #7c3aed, #2563eb); color: #fff; cursor: pointer; display: grid; place-items: center; transition: 0.18s ease; }
.sc-assist-send svg { width: 20px; height: 20px; }
.sc-assist-send:hover { transform: scale(1.06); box-shadow: 0 0 22px rgba(129,140,248,0.5); }
.sc-crew-list { display: grid; gap: 12px; }
.sc-crew-card.home { border-color: rgba(74,222,128,0.4); }
.sc-crew-ava { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(145deg, #7c3aed, #0ea5e9) center/cover; display: grid; place-items: center; font-size: 24px; box-shadow: 0 0 18px rgba(168,85,247,0.5); flex: 0 0 auto; }
.sc-crew-info { flex: 1; min-width: 0; }
.sc-crew-name { font-size: 17px; font-weight: 700; }
.sc-crew-loc { color: #c4b5fd; margin-top: 2px; font-size: 13px; }
.sc-crew-meta { color: #7c83b0; font-size: 11px; margin-top: 2px; letter-spacing: 0.06em; }
.sc-crew-badge { padding: 6px 12px; border-radius: 999px; font-weight: 700; font-size: 12px; letter-spacing: 0.08em; }
.sc-crew-badge.on { background: linear-gradient(90deg, #22c55e, #4ade80); color: #052e16; }
.sc-crew-badge.off { background: rgba(100,116,139,0.4); color: #cbd5e1; }

.sc-modal-crew, .sc-modal-trail { width: min(640px, 94vw) !important; }
.sc-crew-card {
  width: 100%; cursor: pointer;
}
.sc-crew-card:hover { transform: translateY(-1px); border-color: rgba(232,121,249,0.55); }
.sc-trail-head { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sc-trail-back {
  align-self: flex-start; border: 1px solid rgba(216,180,254,0.3); background: rgba(24,8,48,0.55);
  color: #c4b5fd; border-radius: 999px; padding: 6px 12px; font: inherit; cursor: pointer;
  letter-spacing: 0.1em; font-size: 11px;
}
.sc-trail-identity { display: flex; align-items: center; gap: 12px; }
.sc-trail-ava { width: 42px; height: 42px; font-size: 18px; }
.sc-trail-day { margin: 2px 0 10px; flex: 0 0 auto; }
.sc-trail-day-label {
  font-family: Orbitron, sans-serif; letter-spacing: 0.16em; color: #f5d0fe; font-size: 13px; margin-bottom: 8px;
}
.sc-trail-days {
  display: flex; gap: 8px; overflow-x: auto; overflow-y: hidden;
  padding: 2px 2px 10px; margin: 0 -4px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}
.sc-trail-day-chip {
  flex: 0 0 auto; scroll-snap-align: start;
  border: 1px solid rgba(216,180,254,0.28);
  background: rgba(24,8,48,0.65);
  color: #c4b5fd; border-radius: 999px;
  padding: 8px 14px; font: inherit; cursor: pointer;
  letter-spacing: 0.08em; font-size: 11px; white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.sc-trail-day-chip:hover { border-color: rgba(103,232,249,0.45); color: #e9d5ff; }
.sc-trail-day-chip.active {
  background: linear-gradient(120deg, rgba(232,121,249,0.35), rgba(14,165,233,0.28));
  border-color: rgba(103,232,249,0.7);
  color: #f5d0fe;
  box-shadow: 0 0 18px rgba(168,85,247,0.35);
}
.sc-trail-day-chip.more {
  border-style: dashed; color: #67e8f9;
}
.sc-trail-day-chip.has-data {
  border-color: rgba(103,232,249,0.55);
  box-shadow: inset 0 -2px 0 rgba(34,211,238,0.85);
}
.sc-trail-day-chip:not(.has-data):not(.more):not(.active) {
  opacity: 0.55;
}
.sc-trail-map-wrap {
  position: relative; border-radius: 18px; overflow: hidden;
  border: 1px solid rgba(103,232,249,0.45);
  box-shadow: 0 0 30px rgba(56,189,248,0.25);
  height: min(52vh, 460px); min-height: 280px; background: #1a2332;
  z-index: 5;
  flex: 1 1 auto;
  touch-action: manipulation;
  overscroll-behavior: contain;
}
.sc-trail-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #1a2332;
  /* iframe isolates Leaflet from HA/global CSS — tiles + path stay aligned */
}
.sc-trail-status {
  position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
  padding: 6px 12px; border-radius: 999px; z-index: 1000;
  background: rgba(5,1,14,0.78); border: 1px solid rgba(103,232,249,0.4);
  color: #67e8f9; font-size: 11px; letter-spacing: 0.12em;
  opacity: 0; transition: opacity 0.25s ease; pointer-events: none;
}
.sc-trail-status.show { opacity: 1; }
.sc-trail-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px;
}
.sc-trail-stats > div {
  padding: 10px 12px; border-radius: 14px; background: rgba(12,6,28,0.45);
  border: 1px solid rgba(216,180,254,0.2); display: flex; flex-direction: column; gap: 4px;
}
.sc-trail-stats span { font-size: 10px; letter-spacing: 0.12em; color: #a5b4fc; }
.sc-trail-stats strong { font-size: 13px; letter-spacing: 0.04em; color: #f3e8ff; }
.sc-trail-home-ico span {
  display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fff, #e879f9 60%, #7c3aed);
  color: #fff; font-size: 11px; box-shadow: 0 0 14px rgba(232,121,249,0.8);
}
.sc-trail-endpoint {
  display: grid; place-items: center;
}
.sc-trail-endpoint span {
  width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
  font-size: 11px; font-weight: 700; color: #041016;
  box-shadow: 0 0 14px rgba(103,232,249,0.55);
}
.sc-trail-endpoint.start span { background: #86efac; }
.sc-trail-endpoint.end span { background: #67e8f9; }
.leaflet-container { background: #0b1220; font: inherit; }

.sc-modal-foot { margin-top: 16px; text-align: center; color: #a5b4fc; letter-spacing: 0.1em; font-size: 12px; }


/* ---- mission menu ---- */
.sc-menu-btn {
  display: flex; align-items: center; gap: 8px; flex: 0 0 auto; z-index: 2;
  padding: 6px 10px 6px 6px; border-radius: 999px; cursor: pointer; font: inherit; color: inherit;
  border: 1px solid rgba(216,180,254,0.35);
  background: linear-gradient(135deg, rgba(76,29,149,0.55), rgba(14,165,233,0.25));
  box-shadow: 0 0 24px rgba(168,85,247,0.35); transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.sc-menu-btn:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 0 32px rgba(232,121,249,0.5); }
.sc-menu-planet {
  width: 34px; height: 34px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f0abfc, #7c3aed 55%, #0ea5e9);
  box-shadow: 0 0 18px rgba(192,132,252,0.85); position: relative;
}
.sc-menu-planet::after {
  content: ""; position: absolute; inset: 40% -18%;
  border: 2px solid rgba(125,211,252,0.7); border-radius: 50%; transform: rotate(-20deg);
}
.sc-menu-chevs { display: flex; flex-direction: column; gap: 3px; margin-right: 2px; }
.sc-menu-chevs i { display: block; width: 12px; height: 2px; border-radius: 2px; background: #e9d5ff; box-shadow: 0 0 8px #e879f9; }

.sc-drawer-root { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
.sc-drawer-root.open { pointer-events: auto; }
.sc-drawer-backdrop {
  position: absolute; inset: 0; background: rgba(3,0,12,0.55);
  opacity: 0; backdrop-filter: blur(0px); transition: opacity 0.35s ease, backdrop-filter 0.35s ease;
}
.sc-drawer-root.open .sc-drawer-backdrop { opacity: 1; backdrop-filter: blur(8px); }
.sc-drawer {
  position: absolute; top: 0; left: 0; height: 100%; width: min(360px, 92vw);
  padding: 22px 18px; display: flex; flex-direction: column; gap: 18px;
  transform: translateX(-108%);
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s ease;
  border-radius: 0 24px 24px 0; border-left: none;
}
.sc-drawer-root.open .sc-drawer {
  transform: translateX(0);
  box-shadow: 0 0 80px rgba(168,85,247,0.45), 20px 0 60px rgba(0,0,0,0.5);
}
.sc-drawer-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.sc-drawer-x {
  width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(216,180,254,0.35);
  background: rgba(76,29,149,0.45); color: #fff; cursor: pointer;
}
.sc-drawer-links { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.sc-drawer-item {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 18px;
  border: 1px solid rgba(216,180,254,0.22); background: rgba(24,8,48,0.45);
  color: #e9d5ff; cursor: pointer; font: inherit; text-align: left;
  opacity: 0; transform: translateX(-18px);
  transition: transform 0.35s ease, opacity 0.35s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  transition-delay: 0s;
}
.sc-drawer-root.open .sc-drawer-item {
  opacity: 1; transform: translateX(0);
  transition-delay: calc(0.06s * var(--i, 0) + 0.12s);
}
.sc-drawer-item:hover, .sc-drawer-item.active {
  border-color: rgba(232,121,249,0.65);
  background: linear-gradient(120deg, rgba(168,85,247,0.35), rgba(56,189,248,0.18));
  box-shadow: 0 0 28px rgba(168,85,247,0.35);
}
.sc-drawer-text { flex: 1; display: flex; flex-direction: column; }
.sc-drawer-text strong { font-size: 16px; letter-spacing: 0.08em; }
.sc-drawer-text em { font-style: normal; font-size: 11px; color: #a5b4fc; letter-spacing: 0.14em; }
.sc-drawer-arrow { color: #67e8f9; opacity: 0.7; }

/* ---- weather / radar ---- */
.sc-wx { display: flex; flex-direction: column; gap: 14px; }
.sc-wx-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
.sc-wx-cond { margin-top: 6px; letter-spacing: 0.12em; color: #c4b5fd; font-size: 14px; }
.sc-wx-temp {
  font-family: Orbitron, sans-serif; font-size: clamp(28px, 8vw, 40px); line-height: 1; color: #f5d0fe;
  text-shadow: 0 0 24px rgba(232,121,249,0.7);
}
.sc-wx-temp small { font-size: 16px; margin-left: 4px; color: #67e8f9; }
.sc-wx-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sc-wx-stats > div {
  padding: 10px 12px; border-radius: 14px; background: rgba(12,6,28,0.45);
  border: 1px solid rgba(216,180,254,0.2); display: flex; flex-direction: column; gap: 4px;
}
.sc-wx-stats span { font-size: 10px; letter-spacing: 0.14em; color: #a5b4fc; }
.sc-wx-stats strong { font-size: 14px; letter-spacing: 0.06em; }
.sc-radar-wrap {
  position: relative; border-radius: 18px; overflow: hidden; min-height: 180px; height: min(42vw, 280px);
  border: 1px solid rgba(103,232,249,0.35);
  box-shadow: 0 0 40px rgba(56,189,248,0.25), inset 0 0 40px rgba(76,29,149,0.35);
  width: 100%; padding: 0; margin: 0; background: #0b0318;
}
.sc-radar-wrap:hover {
  border-color: rgba(232,121,249,0.45);
  box-shadow: 0 0 48px rgba(168,85,247,0.3), inset 0 0 40px rgba(76,29,149,0.35);
}
.sc-env-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.sc-radar {
  width: 100%; height: 100%; border: 0; display: block;
  filter: saturate(1.1) contrast(1.05);
}
.sc-radar-shade {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, transparent 55%, rgba(5,1,14,0.45));
}
.sc-radar-badge {
  position: absolute; left: 12px; bottom: 12px; padding: 6px 12px; border-radius: 999px;
  background: rgba(5,1,14,0.72); border: 1px solid rgba(103,232,249,0.45);
  color: #67e8f9; font-size: 11px; letter-spacing: 0.14em; pointer-events: none;
  backdrop-filter: blur(8px); z-index: 2;
}
.sc-radar-expand {
  position: absolute; right: 12px; bottom: 12px; z-index: 3;
  padding: 8px 14px; border-radius: 999px; cursor: pointer; font: inherit;
  background: linear-gradient(135deg, rgba(76,29,149,0.9), rgba(14,165,233,0.55));
  border: 1px solid rgba(232,121,249,0.55); color: #f5d0fe;
  font-size: 11px; letter-spacing: 0.12em;
  box-shadow: 0 0 20px rgba(168,85,247,0.4);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.sc-radar-expand:hover { transform: translateY(-1px); box-shadow: 0 0 28px rgba(232,121,249,0.55); }
.sc-radar-explorer {
  width: min(960px, 96vw) !important; max-height: 94vh;
  display: flex; flex-direction: column; gap: 12px;
}
.sc-radar-ex-stage {
  position: relative; border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(103,232,249,0.35);
  background: #07010f; min-height: 320px; height: min(68vh, 640px);
}
.sc-radar-ex-frame { width: 100%; height: 100%; border: 0; display: block; }
.sc-radar-ex-controls {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
}
.sc-radar-ex-controls .sc-chip.mini { min-width: 44px; padding: 8px 14px; font-size: 13px; }

/* ---- PA speakers ---- */
.sc-pa-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sc-pa-master {
  flex: 1; min-width: 220px; display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 18px; cursor: pointer; font: inherit; color: inherit; text-align: left;
  border: 1px solid rgba(216,180,254,0.25); background: rgba(24,8,48,0.45);
}
.sc-pa-master.on {
  border-color: rgba(56,189,248,0.65);
  box-shadow: 0 0 28px rgba(56,189,248,0.35);
  background: linear-gradient(120deg, rgba(14,165,233,0.25), rgba(168,85,247,0.25));
}
.sc-pa-ico { font-size: 28px; }
.sc-pa-meta { flex: 1; display: flex; flex-direction: column; }
.sc-pa-meta strong { letter-spacing: 0.1em; }
.sc-pa-meta em { font-style: normal; color: #a5b4fc; font-size: 12px; letter-spacing: 0.08em; }
.sc-pa-state { font-weight: 700; color: #67e8f9; letter-spacing: 0.1em; }

/* ---- Nebula grid pickers ---- */
.sc-nebula-lbl em { font-style: normal; color: #67e8f9; letter-spacing: 0.08em; font-size: 10px; }
.sc-nebula-pick {
  display: flex; align-items: center; gap: 12px; width: 100%; cursor: pointer; font: inherit;
  padding: 12px 14px; border-radius: 12px; color: #f3e8ff; text-align: left;
  border: 1px solid rgba(216,180,254,0.4); background: rgba(20,10,40,0.9);
  box-shadow: inset 0 0 18px rgba(168,85,247,0.15); transition: 0.18s ease;
}
.sc-nebula-pick:hover { border-color: rgba(103,232,249,0.7); box-shadow: 0 0 18px rgba(103,232,249,0.3); }
.sc-nebula-pick .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; letter-spacing: 0.02em; }
.sc-nebula-pick .chev { color: #c084fc; font-size: 11px; letter-spacing: 0.12em; flex: 0 0 auto; }
.sc-nebula-pick .sw { width: 46px; height: 20px; border-radius: 6px; flex: 0 0 auto; box-shadow: 0 0 10px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.25); }
.sc-nebula-pick[disabled] { opacity: 0.5; cursor: default; }

.sc-pick-modal { width: min(680px, 94vw) !important; display: flex; flex-direction: column; max-height: min(88vh, 860px); }
.sc-pick-search {
  width: 100%; box-sizing: border-box; margin-bottom: 14px;
  padding: 12px 16px; border-radius: 12px; font: inherit; letter-spacing: 0.04em;
  background: rgba(12,6,28,0.85); color: #f3e8ff; border: 1px solid rgba(216,180,254,0.35);
}
.sc-pick-search:focus { outline: none; border-color: rgba(103,232,249,0.7); box-shadow: 0 0 16px rgba(103,232,249,0.3); }
.sc-pick-grid {
  display: grid; gap: 10px; overflow-y: auto; padding: 2px; flex: 1 1 auto;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  overscroll-behavior: contain;
}
.sc-pick-grid.palette { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
.sc-pick-item {
  display: flex; flex-direction: column; gap: 8px; cursor: pointer; font: inherit;
  padding: 12px; border-radius: 14px; text-align: left; color: #e9d5ff;
  border: 1px solid rgba(216,180,254,0.22); background: rgba(24,10,48,0.55);
  transition: 0.16s ease; min-height: 46px; justify-content: center;
}
.sc-pick-item:hover { transform: translateY(-2px); border-color: rgba(103,232,249,0.55); box-shadow: 0 0 20px rgba(103,232,249,0.28); }
.sc-pick-item.active { border-color: rgba(232,121,249,0.85); box-shadow: 0 0 22px rgba(232,121,249,0.5); background: rgba(76,29,149,0.5); }
.sc-pick-item .sc-pick-name { font-size: 13px; letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-pick-item.palette .sc-pick-sw {
  width: 100%; height: 34px; border-radius: 10px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25), 0 4px 14px rgba(0,0,0,0.4);
}
.sc-pick-item.active .sc-pick-name { color: #f5d0fe; font-weight: 700; }

/* ---- Nebula (WLED) control ---- */
.sc-nebula { position: relative; overflow: hidden; padding: 0; }
.sc-nebula-inner { position: relative; z-index: 1; padding: 20px; }
.sc-nebula-aura {
  position: absolute; inset: -40%; z-index: 0; pointer-events: none; opacity: 0.32;
  background:
    radial-gradient(40% 40% at 25% 30%, rgba(232,121,249,0.9), transparent 60%),
    radial-gradient(45% 45% at 75% 35%, rgba(56,189,248,0.85), transparent 60%),
    radial-gradient(50% 50% at 55% 80%, rgba(168,85,247,0.85), transparent 60%);
  filter: blur(26px) saturate(1.3);
  transition: opacity 0.6s ease;
}
.sc-nebula.live .sc-nebula-aura { opacity: 0.6; animation: sc-nebula-drift 18s ease-in-out infinite alternate; }
@keyframes sc-nebula-drift {
  0%   { transform: translate3d(-4%, -2%, 0) rotate(0deg) scale(1.05); }
  50%  { transform: translate3d(4%, 3%, 0) rotate(8deg) scale(1.15); }
  100% { transform: translate3d(-2%, 4%, 0) rotate(-6deg) scale(1.08); }
}
.sc-nebula-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
.sc-nebula-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.sc-nebula-orb {
  width: 42px; height: 42px; border-radius: 50%; flex: 0 0 auto;
  background: radial-gradient(circle at 35% 30%, #fff, #f0abfc 35%, #a855f7 62%, #0ea5e9 100%);
  box-shadow: 0 0 26px rgba(232,121,249,0.85), inset 0 0 12px rgba(255,255,255,0.5);
}
.sc-nebula.live .sc-nebula-orb { animation: sc-orb-pulse 3.2s ease-in-out infinite; }
@keyframes sc-orb-pulse {
  0%,100% { box-shadow: 0 0 22px rgba(232,121,249,0.7), inset 0 0 12px rgba(255,255,255,0.5); }
  50%     { box-shadow: 0 0 40px rgba(103,232,249,0.9), inset 0 0 14px rgba(255,255,255,0.7); }
}
.sc-nebula-sub { color: #c4b5fd; letter-spacing: 0.14em; font-size: 12px; margin-top: 3px; text-transform: uppercase; }
.sc-nebula-power {
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font: inherit;
  padding: 9px 16px; border-radius: 999px; letter-spacing: 0.14em; font-weight: 700; font-size: 12px;
  color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); background: rgba(15,23,42,0.55);
  transition: 0.2s ease;
}
.sc-nebula-power .dot { width: 9px; height: 9px; border-radius: 50%; background: #64748b; box-shadow: none; transition: 0.2s ease; }
.sc-nebula-power.on { color: #052e16; border-color: transparent; background: linear-gradient(90deg, #22d3ee, #a855f7); box-shadow: 0 0 22px rgba(168,85,247,0.5); }
.sc-nebula-power.on .dot { background: #ecfeff; box-shadow: 0 0 10px #fff; }
.sc-nebula-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.sc-nebula-field { display: flex; flex-direction: column; gap: 9px; padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(216,180,254,0.22); background: rgba(12,6,28,0.5); }
.sc-nebula-field.wide { grid-column: 1 / -1; }
.sc-nebula-lbl { display: flex; justify-content: space-between; align-items: center; color: #a5b4fc; letter-spacing: 0.16em; font-size: 11px; }
.sc-nebula-lbl .sc-slider-val { font-style: normal; color: #67e8f9; font-weight: 700; letter-spacing: 0.06em; }
.sc-nebula-selwrap { position: relative; }
.sc-nebula-selwrap::after {
  content: "▾"; position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
  color: #c084fc; pointer-events: none; font-size: 12px;
}
.sc-select.nebula {
  width: 100%; appearance: none; -webkit-appearance: none;
  background: rgba(20,10,40,0.9); color: #f3e8ff; cursor: pointer; font: inherit;
  border: 1px solid rgba(216,180,254,0.4); border-radius: 12px; padding: 11px 34px 11px 14px;
  letter-spacing: 0.03em; box-shadow: inset 0 0 18px rgba(168,85,247,0.15);
}
.sc-select.nebula:focus { outline: none; border-color: rgba(103,232,249,0.75); box-shadow: 0 0 18px rgba(103,232,249,0.35); }
.sc-slider.nebula {
  -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 999px; outline: none;
  background: linear-gradient(90deg, #a855f7, #38bdf8);
}
.sc-slider.nebula.distort { background: linear-gradient(90deg, #f472b6, #a855f7, #22d3ee); }
.sc-slider.nebula.speed { background: linear-gradient(90deg, #22d3ee, #a855f7); }
.sc-slider.nebula.bright { background: linear-gradient(90deg, #1e293b, #f0abfc); }
.sc-slider.nebula::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #e879f9 60%, #7c3aed);
  box-shadow: 0 0 12px rgba(232,121,249,0.9); cursor: pointer; border: 2px solid rgba(255,255,255,0.5);
}
.sc-slider.nebula::-moz-range-thumb {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.5);
  background: radial-gradient(circle at 35% 30%, #fff, #e879f9 60%, #7c3aed);
  box-shadow: 0 0 12px rgba(232,121,249,0.9); cursor: pointer;
}

/* ---- tappable player affordance ---- */
.sc-player { position: relative; cursor: pointer; transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.sc-player:hover { border-color: rgba(103,232,249,0.4); box-shadow: 0 0 26px rgba(56,189,248,0.18); }
.sc-player-expand, .sc-hero-expand {
  position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 10px;
  border: 1px solid rgba(216,180,254,0.35); background: rgba(12,6,28,0.6); color: #e9d5ff;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; z-index: 3;
  transition: 0.16s ease;
}
.sc-player-expand svg, .sc-hero-expand svg { width: 18px; height: 18px; }
.sc-player-expand:hover, .sc-hero-expand:hover { background: rgba(124,58,237,0.6); border-color: rgba(103,232,249,0.6); box-shadow: 0 0 16px rgba(56,189,248,0.35); }
.sc-hero-state-wrap { display: flex; align-items: center; gap: 10px; }
.sc-hero-expand { position: static; }

/* ---- Crew trail locate ---- */
.sc-trail-locate {
  display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 999px;
  border: 1px solid rgba(103,232,249,0.5); background: rgba(24,10,48,0.6); color: #67e8f9;
  cursor: pointer; font: inherit; font-weight: 700; letter-spacing: 0.08em; font-size: 12px;
  transition: 0.16s ease; flex: 0 0 auto;
}
.sc-trail-locate svg { width: 16px; height: 16px; }
.sc-trail-identity .sc-trail-locate { margin-left: auto; }
.sc-trail-locate:hover { background: rgba(56,189,248,0.25); box-shadow: 0 0 18px rgba(56,189,248,0.4); color: #cffafe; }
.sc-trail-locate.pinging { color: #a5f3fc; border-color: rgba(103,232,249,0.8); box-shadow: 0 0 20px rgba(56,189,248,0.5); }
.sc-trail-locate.pinging svg { animation: mxspin 1.1s linear infinite; }
.sc-trail-locate.located { color: #052e16; background: linear-gradient(135deg, #67e8f9, #38bdf8); border-color: rgba(103,232,249,0.9); box-shadow: 0 0 24px rgba(56,189,248,0.7); }

/* ---- Settings ---- */
.sc-setting { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sc-setting-title { font-size: 14px; letter-spacing: 0.08em; color: #f3e8ff; }
.sc-setting-sub { color: #a5b4fc; font-size: 12px; margin-top: 3px; letter-spacing: 0.03em; }
.sc-seg { display: inline-flex; gap: 6px; padding: 5px; border-radius: 14px; background: rgba(12,6,28,0.7); border: 1px solid rgba(216,180,254,0.22); }
.sc-seg-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 16px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: #c4b5fd; cursor: pointer; font: inherit; transition: 0.16s ease; }
.sc-seg-btn strong { font-size: 13px; letter-spacing: 0.04em; }
.sc-seg-btn em { font-style: normal; font-size: 10px; letter-spacing: 0.06em; opacity: 0.75; }
.sc-seg-btn:hover { color: #f3e8ff; }
.sc-seg-btn.on { background: linear-gradient(135deg, rgba(168,85,247,0.55), rgba(56,189,248,0.35)); border-color: rgba(232,121,249,0.6); color: #fff; box-shadow: 0 0 18px rgba(168,85,247,0.35); }

/* ---- Full-screen media experience ---- */
.sc-modal-root.sc-media-modal { padding: 24px; }
.sc-mx-panel {
  position: relative; z-index: 1; width: min(1120px, 96vw); height: min(90vh, 940px);
  background: linear-gradient(160deg, #170b30 0%, #0d0722 58%, #0a0418 100%);
  border: 1px solid rgba(216,180,254,0.26); border-radius: 26px;
  box-shadow: 0 40px 120px rgba(0,0,0,0.62), 0 0 70px rgba(124,58,237,0.28);
  overflow: hidden; will-change: transform; pointer-events: auto;
}
.sc-mx-inner { height: 100%; display: flex; flex-direction: column; }
.sc-mx-topbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid rgba(216,180,254,0.16); background: linear-gradient(180deg, rgba(76,29,149,0.35), rgba(12,6,32,0.15)); }
.sc-mx-brand { display: flex; align-items: center; gap: 10px; font-family: Orbitron, sans-serif; letter-spacing: 0.14em; font-size: 13px; color: #e9d5ff; }
.sc-mx-brand svg { width: 18px; height: 18px; color: #c084fc; }
.sc-mx-topbar .sc-mx-close { position: static; }
.sc-mx-stage { flex: 1; min-height: 0; position: relative; display: flex; }
.sc-mx-frame { border: 0; width: 100%; height: 100%; flex: 1; background: #0b0618; display: block; }
.sc-mx-head {
  flex: 0 0 340px; width: 340px; padding: 26px 24px; display: flex; flex-direction: column; gap: 14px;
  position: relative; overflow-y: auto; overscroll-behavior: contain;
  border-right: 1px solid rgba(216,180,254,0.14);
  background: linear-gradient(180deg, rgba(76,29,149,0.28), rgba(12,6,32,0.15));
}
.sc-mx-close {
  position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid rgba(216,180,254,0.35); background: rgba(12,6,28,0.6); color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; padding: 0; z-index: 4;
}
.sc-mx-close svg { width: 16px; height: 16px; }
.sc-mx-close:hover { background: rgba(124,58,237,0.6); }
.sc-mx-art {
  width: 100%; aspect-ratio: 1; border-radius: 18px; margin-top: 8px;
  background: linear-gradient(145deg, #7c3aed, #0ea5e9) center/cover no-repeat;
  box-shadow: 0 0 42px rgba(168,85,247,0.42); display: grid; place-items: center; color: rgba(255,255,255,0.75);
}
.sc-mx-art svg { width: 40%; height: 40%; }
.sc-mx-art.live { animation: mxpulse 3.2s ease-in-out infinite; }
@keyframes mxpulse { 0%,100% { box-shadow: 0 0 40px rgba(168,85,247,0.4); } 50% { box-shadow: 0 0 66px rgba(56,189,248,0.55); } }
.sc-mx-info { display: flex; flex-direction: column; gap: 10px; }
.sc-mx-kicker { font-size: 11px; letter-spacing: 0.12em; color: #a5b4fc; }
.sc-mx-kicker em { color: #67e8f9; font-style: normal; }
.sc-mx-title { font-size: 22px; font-weight: 700; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.sc-mx-sub { color: #c4b5fd; font-size: 13px; }
.sc-mx-transport { justify-content: flex-start; margin-top: 4px; }
.sc-mx-target { margin-top: 4px; font-size: 11px; letter-spacing: 0.1em; color: #8b93c0; }
.sc-mx-target strong { color: #67e8f9; }

.sc-mx-browsewrap { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.sc-mx-bar { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid rgba(216,180,254,0.14); }
.sc-mx-icbtn {
  width: 38px; height: 38px; flex: 0 0 auto; border-radius: 10px; border: 1px solid rgba(216,180,254,0.3);
  background: rgba(24,10,48,0.6); color: #e9d5ff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0;
}
.sc-mx-icbtn svg { width: 18px; height: 18px; }
.sc-mx-icbtn:hover:not([disabled]) { background: rgba(124,58,237,0.55); }
.sc-mx-icbtn[disabled] { opacity: 0.35; cursor: default; }
.sc-mx-crumb { flex: 1; min-width: 0; font-size: 12px; letter-spacing: 0.06em; color: #ddd6fe; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-mx-searchwrap { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; background: rgba(12,6,28,0.7); border: 1px solid rgba(216,180,254,0.25); color: #a5b4fc; flex: 0 0 auto; }
.sc-mx-searchwrap svg { width: 15px; height: 15px; }
.sc-mx-search { background: transparent; border: none; outline: none; color: #f3e8ff; font: inherit; width: 150px; }
.sc-mx-grid { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 16px 18px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); align-content: start; }
.sc-mx-item {
  display: flex; flex-direction: column; gap: 8px; background: rgba(24,10,48,0.5);
  border: 1px solid rgba(216,180,254,0.15); border-radius: 14px; padding: 10px; cursor: pointer;
  color: #e9d5ff; font: inherit; text-align: left; overflow: hidden;
  animation: mxpop 0.34s ease both; animation-delay: calc(var(--i) * 0.012s); transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.sc-mx-item:hover { transform: translateY(-3px); border-color: rgba(103,232,249,0.5); box-shadow: 0 8px 22px rgba(56,189,248,0.22); }
@keyframes mxpop { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.sc-mx-thumb { position: relative; width: 100%; aspect-ratio: 1; border-radius: 10px; background: #241033 center/cover no-repeat; display: grid; place-items: center; color: rgba(216,180,254,0.6); }
.sc-mx-thumb svg { width: 34%; height: 34%; }
.sc-mx-item.dir .sc-mx-thumb { background: linear-gradient(145deg, rgba(88,28,135,0.6), rgba(15,23,42,0.5)); }
.sc-mx-play {
  position: absolute; right: 6px; bottom: 6px; width: 36px; height: 36px; border-radius: 50%;
  background: rgba(10,5,22,0.85); border: 1px solid rgba(232,121,249,0.55); color: #fff;
  display: grid; place-items: center; box-shadow: 0 4px 14px rgba(0,0,0,0.5); transition: 0.14s ease;
}
.sc-mx-play svg { width: 55%; height: 55%; }
.sc-mx-play:hover { background: linear-gradient(135deg, #e879f9, #38bdf8); transform: scale(1.08); }
.sc-mx-name { font-size: 12.5px; line-height: 1.25; max-height: 2.6em; overflow: hidden; }
.sc-mx-loading, .sc-mx-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 48px 0; color: #a5b4fc; text-align: center; }
.sc-mx-loading svg { width: 44px; height: 44px; color: #a855f7; }
.sc-mx-spin { display: inline-flex; animation: mxspin 1.1s linear infinite; }
@keyframes mxspin { to { transform: rotate(360deg); } }
.sc-mx-empty small { color: #7c83b0; }
.sc-mx-toast {
  position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%) translateY(18px);
  background: rgba(16,8,34,0.96); border: 1px solid rgba(103,232,249,0.5); color: #e0f2fe;
  padding: 11px 20px; border-radius: 999px; opacity: 0; transition: 0.26s ease; z-index: 6;
  box-shadow: 0 10px 34px rgba(0,0,0,0.55); letter-spacing: 0.04em; font-size: 13px; max-width: 80%; text-align: center;
}
.sc-mx-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (max-width: 820px) {
  .sc-modal-root.sc-media-modal { padding: 0; }
  .sc-mx-panel { width: 100vw; height: 100vh; height: 100dvh; border-radius: 0; }
  .sc-mx-inner { flex-direction: column; }
  .sc-mx-head { flex: 0 0 auto; width: auto; flex-direction: row; align-items: flex-start; gap: 14px; padding: 18px 16px; border-right: none; border-bottom: 1px solid rgba(216,180,254,0.14); }
  .sc-mx-art { width: 96px; height: 96px; flex: 0 0 96px; margin-top: 0; }
  .sc-mx-info { flex: 1; min-width: 0; gap: 8px; }
  .sc-mx-title { font-size: 18px; }
  .sc-mx-close { top: 10px; right: 10px; }
  .sc-mx-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
  .sc-mx-search { width: 90px; }
}

@media (max-width: 900px) {
  .sc-main { padding: 10px 10px 20px; gap: 10px; }
  .sc-studiobar { padding: 8px 10px; }
  .sc-studiobar .sc-chip { min-width: 0; flex: 1; }
  .sc-col.hero { min-height: 190px; max-height: 240px; }
  .sc-hero-title { font-size: clamp(16px, 5vw, 22px) !important; }
  .sc-hero-overlay { padding: 14px !important; }
  .sc-transport.big-row button { width: 38px; height: 38px; font-size: 14px; }
  .sc-transport.big-row .big { width: 46px; height: 46px; font-size: 16px; }
  .sc-meta-label { font-size: 8px; letter-spacing: 0.1em; }
  .sc-meta-value { font-size: 11px; margin-top: 2px; }
  .sc-meta-block { padding: 6px 8px; border-radius: 12px; }
  .sc-quick-grid, .sc-quick-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .sc-quick { padding: 10px 4px; border-radius: 14px; }
  .sc-quick-ico { width: 24px; height: 24px; margin-bottom: 5px; }
  .sc-quick-name { font-size: 14px; letter-spacing: 0.01em; line-height: 1.15; }
  .sc-quick-pct { font-size: 11px; margin-top: 2px; }
  .sc-zone-grid { grid-template-columns: 1fr; }
  .sc-nebula-grid { grid-template-columns: 1fr; }
  .sc-pick-grid, .sc-pick-grid.palette { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .sc-media-grid, .sc-media-grid.three { grid-template-columns: 1fr; }
  .sc-wx-stats { grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .sc-radar-wrap { height: 200px; min-height: 160px; }
  .sc-env-grid { grid-template-columns: 1fr; }
  .sc-player { flex-direction: column; align-items: center; text-align: center; }
  .sc-player-body { text-align: center; width: 100%; }
  .sc-player-name, .sc-player-track, .sc-player-artist { text-align: center; }
  .sc-transport, .sc-transport.big-row { justify-content: center; }
  .sc-vol { justify-content: center; }
  .sc-progress { width: 100%; }
  .sc-player-pick { justify-content: center; }
  .sc-media-head { justify-content: center; text-align: center; }
  .sc-media-sub { text-align: center; }
  .sc-workshop-master { justify-content: center; text-align: center; }
  .sc-wm-btns { justify-content: center; width: 100%; }
  .sc-motion { justify-content: center; text-align: center; }
  .sc-nebula-head { justify-content: center; text-align: center; }
  .sc-nebula-brand { justify-content: center; }
  .sc-studiobar-btns { justify-content: center; }
  .sc-zone-head { justify-content: center; text-align: center; }
  .sc-menu-spacer { width: 52px; }
}
@media (min-width: 901px) {
  .sc-zone-grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .sc-col.hero { max-height: 320px; }
}

/* Overview 2-up (music beside nebula) only on real tablet/desktop widths.
   Below this, the base single-column 1fr grid stacks every block full width. */
@media (min-width: 1024px) {
  .sc-grid.ov { grid-template-columns: repeat(12, 1fr); align-items: stretch; }
  .sc-grid.ov .sc-row.quick { grid-column: 1 / -1; }
  .sc-grid.ov .sc-row.reminders { grid-column: 1 / -1; }
  .sc-grid.ov .sc-col.hero { grid-column: span 6; aspect-ratio: auto; max-height: none; min-height: 340px; }
  .sc-grid.ov .sc-ov-nebula { grid-column: span 6; min-width: 0; display: flex; }
  .sc-grid.ov .sc-ov-nebula > .sc-full { flex: 1; }
  .sc-grid.ov .sc-row.weather { grid-column: 1 / -1; }
  .sc-grid.ov .sc-row.env { grid-column: span 6; }
  .sc-grid.ov .sc-row.mantra { grid-column: span 6; }
}
.sc-ov-nebula { min-width: 0; }
`;

customElements.define("spacecadets-panel", SpaceCadetsPanel);

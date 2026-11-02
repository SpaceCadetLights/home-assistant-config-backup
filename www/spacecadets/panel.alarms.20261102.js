/**
 * Space Cadets — Alarms addon (after panel base)
 */
(function () {
  const Ctor = customElements.get("spacecadets-panel");
  if (!Ctor) throw new Error("spacecadets-panel not registered");
  const Proto = Ctor.prototype;
  if (!document.getElementById("sc-alarm-css")) {
    const style = document.createElement("style");
    style.id = "sc-alarm-css";
    style.textContent = '/* Alarms */\n.sc-alarms-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }\n.sc-alarms-sub, .sc-alarms-hint { font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.16em; color:#c4b5fd; opacity:0.8; margin-top:6px; }\n.sc-alarms-hint { font-family: Rajdhani, sans-serif; font-size:15px; letter-spacing:0.02em; line-height:1.45; opacity:0.9; text-transform:none; }\n.sc-alarms-empty { padding:18px; border:1px dashed rgba(216,180,254,0.28); border-radius:16px; color:#e9d5ff; opacity:0.85; }\n.sc-alarm-list, .sc-alarm-home-list { display:grid; gap:12px; grid-template-columns:1fr; }\n.sc-alarm-home-list { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }\n.sc-alarm-home {\n  text-align:left; border:1px solid rgba(94,234,212,0.28); background:rgba(8,28,36,0.45);\n  border-radius:16px; padding:14px; color:#e9d5ff; cursor:pointer; font:inherit;\n  box-shadow: inset 0 0 22px rgba(45,212,191,0.08);\n}\n.sc-alarm-home:hover { border-color:rgba(94,234,212,0.55); transform:translateY(-1px); }\n.sc-alarm-home-time { font-family: Orbitron, sans-serif; font-size:22px; letter-spacing:0.06em; color:#5eead4; }\n.sc-alarm-home-meta { font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.14em; color:#a5b4fc; margin-top:6px; text-transform:uppercase; }\n.sc-alarm-home-music { font-family: Rajdhani, sans-serif; font-size:14px; margin-top:8px; color:#f5ecff; opacity:0.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.sc-alarm {\n  border:1px solid rgba(216,180,254,0.22); background:rgba(24,8,48,0.42); border-radius:18px;\n  padding:14px; display:flex; flex-direction:column; gap:10px;\n}\n.sc-alarm.off { opacity:0.55; }\n.sc-alarm-top { display:flex; justify-content:space-between; align-items:center; gap:10px; }\n.sc-alarm-time {\n  font-family: Orbitron, sans-serif; font-size:28px; letter-spacing:0.04em; color:#f0abfc;\n  background:rgba(40,14,66,0.55); border:1px solid rgba(232,121,249,0.35); border-radius:14px;\n  padding:8px 12px; color-scheme: dark;\n}\n.sc-alarm-toggle {\n  min-width:64px; height:40px; border-radius:12px; border:1px solid rgba(216,180,254,0.3);\n  background:rgba(40,14,66,0.5); color:#c4b5fd; font-family: Orbitron, sans-serif; font-size:11px; letter-spacing:0.14em; cursor:pointer;\n}\n.sc-alarm-toggle.on { color:#5eead4; border-color:rgba(94,234,212,0.55); box-shadow:0 0 16px rgba(45,212,191,0.25); }\n.sc-alarm-label { font-family: Rajdhani, sans-serif; font-weight:600; font-size:16px; color:#f5ecff; }\n.sc-alarm-when { font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.14em; color:#a5b4fc; text-transform:uppercase; }\n.sc-alarm-music-row { display:flex; align-items:center; gap:8px; }\n.sc-alarm-music-ico { color:#67e8f9; opacity:0.85; }\n.sc-alarm-music {\n  flex:1; min-width:0; background:rgba(40,14,66,0.45); border:1px solid rgba(216,180,254,0.25);\n  border-radius:12px; padding:10px 12px; color:#e9d5ff; font:inherit;\n}\n.sc-alarm-foot { display:flex; justify-content:space-between; align-items:center; gap:10px; }\n.sc-alarm-rec {\n  flex:1; background:rgba(40,14,66,0.45); border:1px solid rgba(216,180,254,0.25);\n  border-radius:12px; padding:10px 12px; color:#e9d5ff; font:inherit;\n}\n.sc-alarm-builder .sc-alarm-form { display:grid; gap:12px; margin:16px 0; }\n.sc-alarm-builder label { display:flex; flex-direction:column; gap:6px; font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.16em; color:#c4b5fd; }\n.sc-alarm-builder input, .sc-alarm-builder select {\n  background:rgba(40,14,66,0.55); border:1px solid rgba(216,180,254,0.28); border-radius:12px;\n  padding:12px; color:#f5ecff; font-family: Rajdhani, sans-serif; font-size:16px; color-scheme: dark;\n}\n.sc-alarm-form-actions { display:flex; justify-content:flex-end; gap:10px; }';
    document.head.appendChild(style);
  }
  Proto._alarms = function () {
    const st = this._s("sensor.sc_alarms");
    const items = st && st.attributes && st.attributes.items;
    return Array.isArray(items) ? items : [];
  };
  Proto._alarmNextMs = function (a) {
    const ms = Date.parse(a?.next_fire);
    return isNaN(ms) ? NaN : ms;
  };
  Proto._fmtAlarmTime = function (hhmm) {
    const raw = String(hhmm || "07:00");
    const [hs, ms] = raw.split(":");
    let h = Number(hs) || 0;
    const m = Number(ms) || 0;
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${ap}`;
  };
  Proto._alarmWhenLabel = function (a) {
    const ms = this._alarmNextMs(a);
    const rec = String(a?.recurring || "once");
    const recLabel = rec === "once" ? "ONCE" : rec.toUpperCase();
    if (isNaN(ms)) return recLabel;
    const d = new Date(ms);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    let day = d.toLocaleDateString(undefined, { weekday: "short" });
    if (d.toDateString() === now.toDateString()) day = "Today";
    else if (d.toDateString() === tomorrow.toDateString()) day = "Tomorrow";
    return `${day} · ${this._relTime(ms)} · ${recLabel}`;
  };
  Proto._homeAlarmWindow = function () {
    const h = new Date().getHours();
    return h >= 18 || h < 11;
  };
  Proto._upcomingHomeAlarms = function () {
    if (!this._homeAlarmWindow()) return [];
    const now = Date.now();
    const horizon = now + 16 * 3600 * 1000;
    return this._alarms()
      .filter((a) => a.enabled !== false)
      .map((a) => ({ ...a, nextMs: this._alarmNextMs(a) }))
      .filter((a) => !isNaN(a.nextMs) && a.nextMs >= now - 60000 && a.nextMs <= horizon)
      .sort((a, b) => a.nextMs - b.nextMs);
  };
  Proto._htmlHomeAlarms = function () {
    const list = this._upcomingHomeAlarms();
    if (!list.length) return "";
    return `
      <div class="sc-row alarms-home glass">
        <div class="sc-card-title">${this._ic("bell")}ALARM${list.length > 1 ? "S" : ""}</div>
        <div class="sc-alarm-home-list">
          ${list.map((a) => `
            <button type="button" class="sc-alarm-home" data-act="goto-alarms" title="Open Alarms">
              <div class="sc-alarm-home-time">${this._esc(this._fmtAlarmTime(a.time))}</div>
              <div class="sc-alarm-home-meta">${this._esc(this._alarmWhenLabel(a))}</div>
              <div class="sc-alarm-home-music">${this._esc(a.music_label || a.music_query || "Default playlist")}</div>
            </button>`).join("")}
        </div>
      </div>`;
  };
  Proto._htmlAlarms = function () {
    const items = this._alarms()
      .map((a) => ({ ...a, nextMs: this._alarmNextMs(a) }))
      .sort((a, b) => {
        const ae = a.enabled === false ? 1 : 0;
        const be = b.enabled === false ? 1 : 0;
        if (ae !== be) return ae - be;
        return (a.nextMs || 0) - (b.nextMs || 0);
      });
    return `
      <div class="sc-row alarms glass">
        <div class="sc-alarms-head">
          <div>
            <div class="sc-card-title" style="margin:0">${this._ic("bell")}ALARMS</div>
            <div class="sc-alarms-sub">WAKE · MUSIC ASSISTANT · VOICE OR MANUAL</div>
          </div>
          <button type="button" class="sc-chip on" data-act="alarm-new">+ NEW ALARM</button>
        </div>
        ${items.length ? `<div class="sc-alarm-list">${items.map((a) => this._alarmCard(a)).join("")}</div>`
          : `<div class="sc-alarms-empty">No alarms yet. Say "set an alarm for tomorrow morning" to Jarvis, or build one here.</div>`}
      </div>
      <div class="sc-row alarms-help glass">
        <div class="sc-card-title">VOICE</div>
        <p class="sc-alarms-hint">"Set an alarm for tomorrow at 7 am playing chill morning music." Jarvis picks a playlist and it shows up here.</p>
      </div>`;
  };
  Proto._alarmCard = function (a) {
    const id = this._esc(String(a.id));
    const enabled = a.enabled !== false;
    const time = this._esc(a.time || "07:00");
    const rec = this._esc(a.recurring || "once");
    const music = this._esc(a.music_label || a.music_query || "Default playlist");
    const label = this._esc(a.label || "Alarm");
    return `
      <div class="sc-alarm ${enabled ? "" : "off"}" data-alarm-id="${id}">
        <div class="sc-alarm-top">
          <input type="time" class="sc-alarm-time" value="${time}" data-act="alarm-time" data-id="${id}" aria-label="Alarm time">
          <button type="button" class="sc-alarm-toggle ${enabled ? "on" : ""}" data-act="alarm-toggle" data-id="${id}" title="${enabled ? "Disable" : "Enable"}">${enabled ? "ON" : "OFF"}</button>
        </div>
        <div class="sc-alarm-label">${label}</div>
        <div class="sc-alarm-when">${this._esc(this._alarmWhenLabel(a))}</div>
        <div class="sc-alarm-music-row">
          <span class="sc-alarm-music-ico">♫</span>
          <input class="sc-alarm-music" value="${music}" data-act="alarm-music" data-id="${id}" placeholder="Playlist or vibe" aria-label="Alarm music">
          <button type="button" class="sc-rem-btn" data-act="alarm-music-apply" data-id="${id}" title="Resolve music">${this._ic("check")}</button>
        </div>
        <div class="sc-alarm-foot">
          <select class="sc-alarm-rec" data-act="alarm-recurring" data-id="${id}" aria-label="Repeat">
            ${[["once","Once"],["daily","Daily"],["weekdays","Weekdays"],["weekends","Weekends"]]
              .map(([v,l]) => `<option value="${v}" ${rec===v?"selected":""}>${l}</option>`).join("")}
          </select>
          <button type="button" class="sc-rem-btn done" data-act="alarm-delete" data-id="${id}" title="Delete alarm" aria-label="Delete">${this._ic("close")}</button>
        </div>
      </div>`;
  };
  Proto._openAlarmBuilder = function () {
    const m = this.querySelector("#sc-modal") || this._ensureAlarmModal();
    if (!m) return;
    const def = "07:00";
    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-alarm-bd"></div>
      <div class="sc-modal glass sc-alarm-builder">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">NEW ALARM</div>
            <div class="sc-modal-sub">TIME · MUSIC · REPEAT</div>
          </div>
          <button class="sc-modal-x" id="sc-alarm-x">✕</button>
        </div>
        <div class="sc-alarm-form">
          <label>Time<input type="time" id="sc-ab-time" value="${def}"></label>
          <label>Music / vibe<input type="text" id="sc-ab-music" placeholder="chill morning acoustic" autocomplete="off"></label>
          <label>Repeat
            <select id="sc-ab-rec">
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekends">Weekends</option>
            </select>
          </label>
          <label>Label<input type="text" id="sc-ab-label" placeholder="Morning" autocomplete="off"></label>
        </div>
        <div class="sc-alarm-form-actions">
          <button type="button" class="sc-chip" id="sc-ab-cancel">CANCEL</button>
          <button type="button" class="sc-chip on" id="sc-ab-save">SAVE ALARM</button>
        </div>
      </div>`;
    const close = () => { m.classList.remove("open"); m.innerHTML = ""; this._modalOpen = false; };
    m.querySelector("#sc-alarm-bd")?.addEventListener("click", close);
    m.querySelector("#sc-alarm-x")?.addEventListener("click", close);
    m.querySelector("#sc-ab-cancel")?.addEventListener("click", close);
    m.querySelector("#sc-ab-save")?.addEventListener("click", () => {
      const time = m.querySelector("#sc-ab-time")?.value || "07:00";
      const music = (m.querySelector("#sc-ab-music")?.value || "").trim();
      const recurring = m.querySelector("#sc-ab-rec")?.value || "once";
      const label = (m.querySelector("#sc-ab-label")?.value || "").trim() || "Alarm";
      this._call("script", "alarm_add", {
        time_hhmm: time,
        label,
        recurring,
        day_offset: 0,
        music_query: music,
        music_label: music,
      });
      // Resolve music shortly after add lands on the sensor
      if (music) {
        setTimeout(() => {
          const items = this._alarms();
          const newest = items[items.length - 1];
          if (newest?.id) this._call("script", "alarm_resolve_music", { id: String(newest.id), music_query: music });
        }, 1200);
      } else {
        setTimeout(() => {
          const items = this._alarms();
          const newest = items[items.length - 1];
          if (newest?.id) this._call("script", "alarm_update", {
            id: String(newest.id),
            music_uri: "library://playlist/1",
            music_label: "Default playlist",
            music_type: "playlist",
          });
        }, 900);
      }
      close();
    });
    this._modalOpen = true;
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
  };
  Proto._ensureAlarmModal = function () {
    let m = this.querySelector("#sc-alarm-modal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "sc-alarm-modal";
    m.className = "sc-modal-root";
    (this._root || this).appendChild(m);
    return m;
  };
})();

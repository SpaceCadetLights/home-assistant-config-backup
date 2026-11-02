/**
 * Space Cadets — Alarms addon
 * Clock meta expands like Crew; nebula-style picks; ringing snooze/stop sheet.
 */
(function () {
  const Ctor = customElements.get("spacecadets-panel");
  if (!Ctor) throw new Error("spacecadets-panel not registered");
  const Proto = Ctor.prototype;

  if (!document.getElementById("sc-alarm-css")) {
    const style = document.createElement("style");
    style.id = "sc-alarm-css";
    style.textContent = `
.sc-clock-btn {
  cursor: pointer; transition: 0.2s ease; position: relative;
  text-align: center;
}
.sc-clock-btn:hover { border-color: rgba(94,234,212,0.55); box-shadow: 0 0 24px rgba(45,212,191,0.28); }
.sc-clock-btn.has-alarm { border-color: rgba(251,191,36,0.42); }
.sc-clock-btn.ringing {
  border-color: rgba(251,191,36,0.7);
  box-shadow: 0 0 28px rgba(251,191,36,0.45);
  animation: sc-alarm-pulse 1.2s ease-in-out infinite;
}
@keyframes sc-alarm-pulse {
  0%,100% { box-shadow: 0 0 16px rgba(251,191,36,0.35); }
  50% { box-shadow: 0 0 28px rgba(251,191,36,0.65); }
}
.sc-clock-row {
  display:flex; align-items:center; justify-content:center;
  gap:0; margin-top:4px; min-height:0;
}
.sc-clock-ico {
  position: absolute; top: 7px; right: 8px;
  width: 12px; height: 12px; line-height: 0;
  color: #fbbf24; opacity: 0.95; pointer-events: none;
  filter: drop-shadow(0 0 6px rgba(251,191,36,0.55));
}
.sc-clock-ico svg {
  width: 12px !important; height: 12px !important;
  display: block; flex: none;
}
.sc-clock-btn.ringing .sc-clock-ico {
  color:#fbbf24; filter: drop-shadow(0 0 8px rgba(251,191,36,0.75));
}
.sc-clock-next {
  font-family: Orbitron, sans-serif; font-size:8px; letter-spacing:0.1em;
  color:#fbbf24; opacity:0.9; margin-top:3px; text-transform:uppercase;
  line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.sc-modal-alarms { text-align: center; position: relative; }
.sc-modal-alarms .sc-modal-head {
  display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center;
  position: relative; padding-right: 0;
}
.sc-modal-alarms .sc-modal-head > div { width: 100%; }
.sc-modal-alarms .sc-card-title {
  display:flex; align-items:center; justify-content:center; gap:8px;
  font-size: 15px; letter-spacing: 0.14em;
}
.sc-modal-alarms .sc-card-title svg { width: 14px; height: 14px; margin: 0; }
.sc-modal-alarms .sc-modal-sub {
  font-size: 11px; letter-spacing: 0.12em; color: #fdba74; opacity: 0.9;
}
.sc-modal-alarms .sc-modal-x { position: absolute; top: 14px; right: 14px; }
.sc-modal-alarms .sc-alarms-actions {
  display:flex; justify-content:center; margin: 4px 0 14px;
}
.sc-modal-alarms .sc-modal-foot {
  text-align: center; font-size: 10px; letter-spacing: 0.12em; opacity: 0.75;
}

.sc-alarms-head {
  display:flex; flex-direction:column; align-items:center; gap:10px;
  margin-bottom:14px; text-align:center;
}
.sc-alarms-sub, .sc-alarms-hint {
  font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.14em;
  color:#fdba74; opacity:0.85; margin-top:6px;
}
.sc-alarms-hint {
  font-family: Rajdhani, sans-serif; font-size:14px; letter-spacing:0.02em;
  line-height:1.45; opacity:0.9; text-transform:none; color:#e9d5ff;
}
.sc-alarms-empty {
  padding:18px; border:1px dashed rgba(251,191,36,0.35); border-radius:18px;
  color:#ffe8c2; opacity:0.9; text-align:center; font-size: 14px; line-height: 1.4;
}
.sc-alarm-list { display:grid; gap:14px; }

.sc-alarm {
  border:1px solid rgba(251,191,36,0.48);
  background: linear-gradient(165deg, rgba(48,24,8,0.55), rgba(28,12,40,0.58));
  border-radius:20px;
  padding:16px 14px 14px;
  display:flex; flex-direction:column; align-items:center; gap:10px;
  text-align:center;
  box-shadow: 0 0 22px rgba(251,191,36,0.12), inset 0 0 24px rgba(251,191,36,0.04);
}
.sc-alarm.off { opacity:0.5; border-color: rgba(251,191,36,0.22); }
.sc-alarm-top {
  display:flex; justify-content:center; align-items:center; gap:10px; flex-wrap:wrap;
  width: 100%;
}
.sc-alarm-time {
  font-family: Orbitron, sans-serif; font-size:22px; letter-spacing:0.06em; color:#fff7ed;
  background:rgba(40,18,8,0.55); border:1px solid rgba(251,191,36,0.4); border-radius:14px;
  padding:8px 14px; color-scheme: dark; text-align:center; min-width: 7.5em;
}
.sc-alarm-toggle {
  min-width:64px; height:38px; border-radius:12px; border:1px solid rgba(251,191,36,0.35);
  background:rgba(40,18,8,0.5); color:#fdba74; font-family: Orbitron, sans-serif;
  font-size:11px; letter-spacing:0.14em; cursor:pointer;
}
.sc-alarm-toggle.on {
  color:#5eead4; border-color:rgba(94,234,212,0.55);
  box-shadow:0 0 16px rgba(45,212,191,0.25);
}
.sc-alarm-label {
  font-family: Rajdhani, sans-serif; font-weight:700; font-size:18px;
  color:#fff7ed; letter-spacing: 0.02em;
}
.sc-alarm-when {
  font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.12em;
  color:#fbbf24; text-transform:uppercase; opacity: 0.9; line-height: 1.35;
}

.sc-alarm-field {
  display:flex; flex-direction:column; align-items:center; gap:6px; width:100%;
}
.sc-alarm-lbl {
  font-family: Orbitron, sans-serif; font-size:9px; letter-spacing:0.16em; color:#fdba74;
}
.sc-alarm-lbl em {
  font-style:normal; color:#67e8f9; letter-spacing:0.08em; font-size:9px; margin-left:6px;
}
.sc-alarm-pick {
  display:flex; align-items:center; justify-content:center; gap:10px; width:100%;
  text-align:center;
  background: linear-gradient(135deg, rgba(55,28,8,0.75), rgba(30,12,40,0.65));
  border:1px solid rgba(251,191,36,0.32); border-radius:14px; padding:11px 14px;
  color:#fff7ed; font:inherit; cursor:pointer;
}
.sc-alarm-pick:hover {
  border-color:rgba(251,191,36,0.7); box-shadow:0 0 18px rgba(251,191,36,0.28);
}
.sc-alarm-pick .txt {
  flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-weight:600; font-size: 15px;
}
.sc-alarm-pick .chev { color:#fbbf24; font-size:10px; letter-spacing:0.12em; flex:0 0 auto; }

.sc-alarm-music-row { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; }
.sc-alarm-music {
  flex:1; min-width:0; max-width: 100%;
  background:rgba(40,18,8,0.45); border:1px solid rgba(251,191,36,0.28);
  border-radius:12px; padding:10px 12px; color:#ffe8c2; font:inherit; text-align:center;
  font-size: 14px;
}
.sc-alarm-foot { display:flex; justify-content:center; gap:10px; width:100%; margin-top: 2px; }
.sc-alarm-foot .sc-rem-btn svg { width: 16px; height: 16px; }

.sc-modal-alarms .sc-alarm-list { max-height: min(58vh, 520px); overflow:auto; padding-right:2px; }
.sc-alarm-builder { text-align: center; }
.sc-alarm-builder .sc-alarm-form {
  display:grid; gap:12px; margin:16px 0; justify-items: center;
}
.sc-alarm-builder label {
  display:flex; flex-direction:column; align-items:center; gap:6px; width: 100%;
  font-family: Orbitron, sans-serif; font-size:10px; letter-spacing:0.16em; color:#fdba74;
  text-align: center;
}
.sc-alarm-builder input, .sc-alarm-builder select {
  width: 100%;
  background:rgba(40,18,8,0.55); border:1px solid rgba(251,191,36,0.3); border-radius:12px;
  padding:12px; color:#fff7ed; font-family: Rajdhani, sans-serif; font-size:16px;
  color-scheme: dark; text-align:center;
}
.sc-alarm-form-actions { display:flex; justify-content:center; gap:10px; }

.sc-alarm-ring-modal {
  width: min(420px, calc(100vw - 28px));
  border-radius: 22px;
  padding: 18px 18px 16px;
  border: 1px solid rgba(251,191,36,0.45);
  background: linear-gradient(160deg, rgba(48,22,8,0.94), rgba(24,8,48,0.92));
  box-shadow: 0 0 40px rgba(251,191,36,0.28), inset 0 0 30px rgba(251,113,133,0.08);
  text-align: center;
}
.sc-alarm-ring-kicker {
  font-family: Orbitron, sans-serif; font-size:11px; letter-spacing:0.2em; color:#fbbf24;
}
.sc-alarm-ring-title {
  font-family: Orbitron, sans-serif; font-size:28px; letter-spacing:0.06em; color:#fff7ed; margin-top:8px;
}
.sc-alarm-ring-sub { color:#fdba74; margin-top:8px; font-size:15px; }
.sc-alarm-ring-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:18px; }
.sc-alarm-ring-actions .sc-chip { min-height:48px; font-size:13px; letter-spacing:0.12em; }
.sc-alarm-ring-actions .sc-chip.snooze {
  background: linear-gradient(135deg, rgba(251,191,36,0.35), rgba(249,115,22,0.28));
  border-color: rgba(251,191,36,0.55); color:#fff7ed;
}
.sc-alarm-ring-actions .sc-chip.stop {
  background: linear-gradient(135deg, rgba(244,63,94,0.4), rgba(124,58,237,0.3));
  border-color: rgba(251,113,133,0.55); color:#ffe4e6;
}
`;
    document.head.appendChild(style);
  }

  const REC_OPTS = [
    ["once", "Once"],
    ["daily", "Daily"],
    ["weekdays", "Weekdays"],
    ["weekends", "Weekends"],
  ];

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

  Proto._recLabel = function (v) {
    const hit = REC_OPTS.find(([x]) => x === v);
    return hit ? hit[1] : "Once";
  };

  Proto._enabledAlarms = function () {
    return this._alarms().filter((a) => a.enabled !== false);
  };

  Proto._nextAlarm = function () {
    const now = Date.now();
    return this._enabledAlarms()
      .map((a) => ({ ...a, nextMs: this._alarmNextMs(a) }))
      .filter((a) => !isNaN(a.nextMs) && a.nextMs >= now - 60000)
      .sort((a, b) => a.nextMs - b.nextMs)[0] || null;
  };

  Proto._ringingAlarmId = function () {
    const v = String(this._state("input_text.sc_alarm_ringing") || "").trim();
    return v && v !== "unknown" && v !== "unavailable" ? v : "";
  };

  Proto._ringingAlarm = function () {
    const id = this._ringingAlarmId();
    if (!id) return null;
    return this._alarms().find((a) => String(a.id) === id) || { id, label: "Alarm", time: "", music_label: "" };
  };

  // No separate overview card — clock is the access point
  Proto._htmlHomeAlarms = function () {
    return "";
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
          : `<div class="sc-alarms-empty">No alarms yet. Tap LOCAL TIME on the home screen, or tell Jarvis to set one.</div>`}
      </div>
      <div class="sc-row alarms-help glass">
        <div class="sc-card-title">VOICE</div>
        <p class="sc-alarms-hint">"Set an alarm for tomorrow at 7 am playing chill morning music." Say "stop the alarm" or "snooze" when it rings.</p>
      </div>`;
  };

  Proto._alarmCard = function (a) {
    const id = this._esc(String(a.id));
    const enabled = a.enabled !== false;
    const time = this._esc(a.time || "07:00");
    const rec = a.recurring || "once";
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
        <div class="sc-alarm-field">
          <span class="sc-alarm-lbl">MUSIC <em>MA</em></span>
          <div class="sc-alarm-music-row">
            <input class="sc-alarm-music" value="${music}" data-act="alarm-music" data-id="${id}" placeholder="Playlist or vibe" aria-label="Alarm music">
            <button type="button" class="sc-rem-btn" data-act="alarm-music-apply" data-id="${id}" title="Resolve music">${this._ic("check")}</button>
          </div>
        </div>
        <div class="sc-alarm-field">
          <span class="sc-alarm-lbl">REPEAT</span>
          <button type="button" class="sc-alarm-pick" data-act="alarm-pick-recurring" data-id="${id}" data-current="${this._esc(rec)}">
            <span class="txt">${this._esc(this._recLabel(rec))}</span>
            <span class="chev">▼</span>
          </button>
        </div>
        <div class="sc-alarm-foot">
          <button type="button" class="sc-rem-btn done" data-act="alarm-delete" data-id="${id}" title="Delete alarm" aria-label="Delete">${this._ic("close")}</button>
        </div>
      </div>`;
  };

  Proto._wireAlarmClock = function () {
    const block = this.querySelector(".sc-top-meta .sc-meta-block");
    if (!block || block.id === "sc-clock-btn" || block.classList.contains("sc-clock-btn")) return;
    const label = block.querySelector(".sc-meta-label");
    const clock = block.querySelector("#sc-clock");
    if (!clock) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sc-meta-block sc-clock-btn";
    btn.id = "sc-clock-btn";
    btn.title = "Alarms";
    btn.setAttribute("aria-label", "Open alarms");
    btn.innerHTML = `
      <span class="sc-clock-ico" id="sc-clock-ico" hidden>${this._ic("bell")}</span>
      <div class="sc-meta-label">${label ? label.textContent : "LOCAL TIME"}</div>
      <div class="sc-clock-row">
        <div class="sc-meta-value" id="sc-clock">--</div>
      </div>
      <div class="sc-clock-next" id="sc-clock-next" hidden></div>`;
    block.replaceWith(btn);
    btn.addEventListener("click", () => {
      if (this._ringingAlarmId()) this._openAlarmRingSheet(true);
      else this._openAlarmsSheet();
    });

    if (!this.querySelector("#sc-alarm-ring-root")) {
      const ring = document.createElement("div");
      ring.id = "sc-alarm-ring-root";
      ring.className = "sc-modal-root";
      (this._root || this).appendChild(ring);
    }
  };

  const _mountOrig = Proto._mount;
  Proto._mount = function () {
    _mountOrig.call(this);
    this._wireAlarmClock();
  };

  const _paintClockOrig = Proto._paintClock;
  Proto._paintClock = function () {
    this._wireAlarmClock();
    _paintClockOrig.call(this);
    const btn = this.querySelector("#sc-clock-btn");
    const ico = this.querySelector("#sc-clock-ico");
    const nextEl = this.querySelector("#sc-clock-next");
    const has = this._enabledAlarms().length > 0;
    const ringing = !!this._ringingAlarmId();
    if (btn) {
      btn.classList.toggle("has-alarm", has);
      btn.classList.toggle("ringing", ringing);
    }
    if (ico) ico.hidden = !has && !ringing;
    if (nextEl) {
      const n = this._nextAlarm();
      if (ringing) {
        nextEl.hidden = false;
        nextEl.textContent = "ALARM RINGING";
      } else if (n) {
        nextEl.hidden = false;
        nextEl.textContent = `NEXT ${this._fmtAlarmTime(n.time)}`;
      } else {
        nextEl.hidden = true;
        nextEl.textContent = "";
      }
    }
  };

  const _paintOrig = Proto._paint;
  Proto._paint = function () {
    _paintOrig.call(this);
    this._syncAlarmRingSheet();
    if (this._alarmsSheetOpen) this._renderAlarmsSheet(false);
  };

  Proto._openAlarmsSheet = function () {
    this._alarmsSheetOpen = true;
    this._modalOpen = true;
    this._crewTrailPerson = null;
    this._destroyTrailMap?.();
    this._lockAppScroll?.(true);
    this._renderAlarmsSheet(true);
  };

  Proto._closeAlarmsSheet = function () {
    const m = this.querySelector("#sc-modal");
    this._alarmsSheetOpen = false;
    this._lockAppScroll?.(false);
    if (!m) {
      this._modalOpen = false;
      return;
    }
    m.classList.remove("open");
    setTimeout(() => {
      if (!this._alarmsSheetOpen && !this._crewTrailPerson) {
        this._modalOpen = false;
        m.innerHTML = "";
      }
    }, 380);
  };

  Proto._renderAlarmsSheet = function (animateIn = false) {
    const m = this.querySelector("#sc-modal");
    if (!m) return;
    const items = this._alarms()
      .map((a) => ({ ...a, nextMs: this._alarmNextMs(a) }))
      .sort((a, b) => {
        const ae = a.enabled === false ? 1 : 0;
        const be = b.enabled === false ? 1 : 0;
        if (ae !== be) return ae - be;
        return (a.nextMs || 0) - (b.nextMs || 0);
      });
    const next = this._nextAlarm();
    const summary = next
      ? `NEXT ${this._fmtAlarmTime(next.time).toUpperCase()} · ${this._alarmWhenLabel(next)}`
      : items.length
      ? `${items.length} ALARM${items.length > 1 ? "S" : ""}`
      : "NO ALARMS SET";

    const active = document.activeElement;
    const keepFocus =
      active &&
      m.contains(active) &&
      ["INPUT", "TEXTAREA"].includes(active.tagName) &&
      !animateIn;
    if (keepFocus) return;

    const wasOpen = m.classList.contains("open");
    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-modal-bd"></div>
      <div class="sc-modal glass sc-modal-alarms">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">${this._ic("bell")}ALARMS</div>
            <div class="sc-modal-sub">${this._esc(summary)}</div>
          </div>
          <button class="sc-modal-x" id="sc-modal-x">✕</button>
        </div>
        <div class="sc-alarms-actions">
          <button type="button" class="sc-chip on" data-act="alarm-new">+ NEW ALARM</button>
        </div>
        ${items.length
          ? `<div class="sc-alarm-list">${items.map((a) => this._alarmCard(a)).join("")}</div>`
          : `<div class="sc-alarms-empty">No alarms yet. Build one here, or tell Jarvis: "set an alarm for tomorrow morning with chill acoustic."</div>`}
        <div class="sc-modal-foot">TAP LOCAL TIME ANYTIME · MUSIC ASSISTANT WAKE</div>
      </div>`;
    m.querySelector("#sc-modal-bd")?.addEventListener("click", () => this._closeAlarmsSheet());
    m.querySelector("#sc-modal-x")?.addEventListener("click", () => this._closeAlarmsSheet());
    this._bind?.(m);
    if (animateIn || !wasOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add("open")));
    } else {
      m.classList.add("open");
    }
  };

  Proto._openAlarmRecurringPicker = function (alarmId, current) {
    this._alarmPickId = String(alarmId || "");
    this._renderPicker({
      title: "ALARM · REPEAT",
      kind: "alarm-recurring",
      options: REC_OPTS.map(([v]) => v),
      current: current || "once",
    });
    // Relabel picker buttons with friendly names
    const m = this.querySelector("#sc-picker-modal");
    if (!m) return;
    m.querySelectorAll(".sc-pick-item").forEach((el) => {
      const name = el.querySelector(".sc-pick-name");
      if (name) name.textContent = this._recLabel(el.dataset.pick);
    });
  };

  const _applyPickOrig = Proto._applyPick;
  Proto._applyPick = function (kind, val) {
    if (kind === "alarm-recurring") {
      const id = this._alarmPickId;
      if (id) this._call("script", "alarm_update", { id, recurring: val });
      this._scToast?.(`REPEAT · ${this._recLabel(val).toUpperCase()}`);
      return;
    }
    if (kind === "alarm-recurring-builder") {
      const recPick = this._alarmBuilderRecPick;
      if (recPick) {
        recPick.dataset.value = val;
        const txt = recPick.querySelector(".txt");
        if (txt) txt.textContent = this._recLabel(val);
      }
      return;
    }
    _applyPickOrig.call(this, kind, val);
  };

  const _closeCrewOrig = Proto._closeCrew;
  Proto._closeCrew = function () {
    if (this._alarmsSheetOpen) {
      this._closeAlarmsSheet();
      return;
    }
    _closeCrewOrig.call(this);
  };

  Proto._openAlarmBuilder = function () {
    const m = this.querySelector("#sc-modal") || this._ensureAlarmModal();
    if (!m) return;
    const def = "07:00";
    this._alarmsSheetOpen = false;
    this._modalOpen = true;
    this._lockAppScroll?.(true);
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
          <div class="sc-alarm-field">
            <span class="sc-alarm-lbl">REPEAT</span>
            <button type="button" class="sc-alarm-pick" id="sc-ab-rec-pick" data-value="once">
              <span class="txt">Once</span><span class="chev">▼</span>
            </button>
          </div>
          <label>Label<input type="text" id="sc-ab-label" placeholder="Morning" autocomplete="off"></label>
        </div>
        <div class="sc-alarm-form-actions">
          <button type="button" class="sc-chip" id="sc-ab-cancel">CANCEL</button>
          <button type="button" class="sc-chip on" id="sc-ab-save">SAVE ALARM</button>
        </div>
      </div>`;
    const close = () => {
      m.classList.remove("open");
      m.innerHTML = "";
      this._modalOpen = false;
      this._lockAppScroll?.(false);
    };
    m.querySelector("#sc-alarm-bd")?.addEventListener("click", close);
    m.querySelector("#sc-alarm-x")?.addEventListener("click", close);
    m.querySelector("#sc-ab-cancel")?.addEventListener("click", close);
    const recPick = m.querySelector("#sc-ab-rec-pick");
    recPick?.addEventListener("click", () => {
      this._alarmBuilderRecPick = recPick;
      this._renderPicker({
        title: "ALARM · REPEAT",
        kind: "alarm-recurring-builder",
        options: REC_OPTS.map(([v]) => v),
        current: recPick.dataset.value || "once",
      });
      const pm = this.querySelector("#sc-picker-modal");
      pm?.querySelectorAll(".sc-pick-item").forEach((el) => {
        const name = el.querySelector(".sc-pick-name");
        if (name) name.textContent = this._recLabel(el.dataset.pick);
      });
    });
    m.querySelector("#sc-ab-save")?.addEventListener("click", () => {
      const time = m.querySelector("#sc-ab-time")?.value || "07:00";
      const music = (m.querySelector("#sc-ab-music")?.value || "").trim();
      const recurring = recPick?.dataset.value || "once";
      const label = (m.querySelector("#sc-ab-label")?.value || "").trim() || "Alarm";
      this._call("script", "alarm_add", {
        time_hhmm: time,
        label,
        recurring,
        day_offset: 0,
        music_query: music,
        music_label: music,
      });
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
      setTimeout(() => this._openAlarmsSheet(), 400);
    });
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

  Proto._syncAlarmRingSheet = function () {
    const id = this._ringingAlarmId();
    if (id) this._openAlarmRingSheet(false);
    else this._closeAlarmRingSheet();
  };

  Proto._openAlarmRingSheet = function (forceAnimate) {
    let root = this.querySelector("#sc-alarm-ring-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "sc-alarm-ring-root";
      root.className = "sc-modal-root";
      (this._root || this).appendChild(root);
    }
    const alarm = this._ringingAlarm();
    if (!alarm) {
      this._closeAlarmRingSheet();
      return;
    }
    const already = root.classList.contains("open") && root.dataset.rid === String(alarm.id);
    if (already && !forceAnimate) return;
    root.dataset.rid = String(alarm.id);
    const time = this._fmtAlarmTime(alarm.time);
    const music = alarm.music_label || alarm.music_query || "Wake playlist";
    root.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-alarm-ring-bd"></div>
      <div class="sc-modal sc-alarm-ring-modal">
        <div class="sc-alarm-ring-kicker">⚠ ALARM</div>
        <div class="sc-alarm-ring-title">${this._esc(time)}</div>
        <div class="sc-alarm-ring-sub">${this._esc(alarm.label || "Alarm")} · ${this._esc(music)}</div>
        <div class="sc-alarm-ring-actions">
          <button type="button" class="sc-chip snooze" data-act="alarm-snooze">SNOOZE 9 MIN</button>
          <button type="button" class="sc-chip stop" data-act="alarm-stop">STOP</button>
        </div>
      </div>`;
    root.querySelector("#sc-alarm-ring-bd")?.addEventListener("click", () => {});
    root.querySelector('[data-act="alarm-snooze"]')?.addEventListener("click", () => {
      this._call("script", "alarm_snooze", { id: String(alarm.id) });
      this._scToast?.("SNOOZED · 9 MIN");
    });
    root.querySelector('[data-act="alarm-stop"]')?.addEventListener("click", () => {
      this._call("script", "alarm_stop", {});
      this._scToast?.("ALARM STOPPED");
    });
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("open")));
  };

  Proto._closeAlarmRingSheet = function () {
    const root = this.querySelector("#sc-alarm-ring-root");
    if (!root) return;
    root.classList.remove("open");
    root.dataset.rid = "";
    setTimeout(() => {
      if (!this._ringingAlarmId() && root) root.innerHTML = "";
    }, 360);
  };

  const _bindOrig = Proto._bind;
  Proto._bind = function (root) {
    _bindOrig.call(this, root);
    root.querySelectorAll("[data-act='alarm-pick-recurring']").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._openAlarmRecurringPicker(el.dataset.id, el.dataset.current);
      });
    });
    root.querySelectorAll("[data-act='goto-alarms']").forEach((el) => {
      const clone = el.cloneNode(true);
      el.parentNode?.replaceChild(clone, el);
      clone.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._openAlarmsSheet();
      });
    });
  };
})();
/**
 * Space Cadets — Alarms addon
 * Clock meta expands like Crew; card blocks; modern builder dialog; ring sheet.
 */
(function () {
  const Ctor = customElements.get("spacecadets-panel");
  if (!Ctor) throw new Error("spacecadets-panel not registered");
  const Proto = Ctor.prototype;

  {
    let style = document.getElementById("sc-alarm-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "sc-alarm-css";
      document.head.appendChild(style);
    }
    style.setAttribute("data-v", "20261120d");
    style.textContent = `
/* ── Clock corner badge ── */
.sc-clock-btn {
  cursor: pointer; transition: border-color 0.25s ease, box-shadow 0.25s ease; position: relative;
  text-align: center; overflow: visible;
}
.sc-clock-btn:hover { border-color: rgba(94,234,212,0.55); box-shadow: 0 0 24px rgba(45,212,191,0.28); }
.sc-clock-btn.has-alarm { border-color: rgba(74,222,128,0.35); }
.sc-clock-btn.alarm-off { border-color: rgba(248,113,113,0.3); }
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
  position: absolute; top: 5px; right: 5px; z-index: 2;
  box-sizing: border-box;
  width: 18px !important; height: 18px !important;
  max-width: 18px !important; max-height: 18px !important;
  padding: 0; margin: 0;
  display: inline-flex !important; align-items: center; justify-content: center;
  line-height: 0; overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(74,222,128,0.55);
  background: rgba(22, 101, 52, 0.55);
  color: #4ade80;
  cursor: pointer;
  appearance: none; -webkit-appearance: none;
  box-shadow: 0 0 8px rgba(74,222,128,0.35);
  transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.15s ease;
}
.sc-clock-ico:active { transform: scale(0.92); }
.sc-clock-ico svg,
.sc-clock-btn .sc-clock-ico svg,
#sc-clock-ico svg {
  width: 10px !important; height: 10px !important;
  max-width: 10px !important; max-height: 10px !important;
  min-width: 0 !important; min-height: 0 !important;
  display: block !important; flex: none !important;
  pointer-events: none;
}
.sc-clock-btn.alarm-off .sc-clock-ico {
  color: #f87171;
  border-color: rgba(248,113,113,0.55);
  background: rgba(127, 29, 29, 0.55);
  box-shadow: 0 0 8px rgba(248,113,113,0.35);
}
.sc-clock-btn.ringing .sc-clock-ico {
  color: #fbbf24;
  border-color: rgba(251,191,36,0.7);
  background: rgba(120, 53, 15, 0.6);
  box-shadow: 0 0 10px rgba(251,191,36,0.55);
}
.sc-clock-next { display: none !important; }

/* ── Sheet shell ── */
.sc-modal-alarms {
  text-align: center; position: relative;
  max-width: min(440px, calc(100vw - 20px));
  animation: sc-alarm-sheet-in 0.42s cubic-bezier(.16,1,.3,1) both;
}
@keyframes sc-alarm-sheet-in {
  from { opacity: 0; transform: translateY(28px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
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
  font-size: 11px; letter-spacing: 0.1em; color: #fdba74; opacity: 0.9;
}
.sc-modal-alarms .sc-modal-x { position: absolute; top: 14px; right: 14px; }
.sc-modal-alarms .sc-alarms-actions {
  display:flex; justify-content:center; margin: 6px 0 16px;
}
.sc-modal-alarms .sc-alarms-actions .sc-chip {
  min-height: 44px; padding: 0 22px; letter-spacing: 0.14em;
  transition: transform 0.18s ease, box-shadow 0.25s ease, filter 0.2s ease;
}
.sc-modal-alarms .sc-alarms-actions .sc-chip:hover {
  transform: translateY(-1px); filter: brightness(1.08);
}
.sc-modal-alarms .sc-alarms-actions .sc-chip:active { transform: scale(0.97); }
.sc-modal-alarms .sc-modal-foot {
  text-align: center; font-size: 10px; letter-spacing: 0.12em; opacity: 0.65; margin-top: 14px;
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
  padding:22px 18px; border:1px dashed rgba(167,139,250,0.4); border-radius:20px;
  color:#e9d5ff; opacity:0.95; text-align:center; font-size: 14px; line-height: 1.45;
  background: rgba(30,16,48,0.35);
  animation: sc-alarm-card-in 0.4s ease both;
}

/* ── Alarm cards ── */
.sc-alarm-list {
  display:grid; gap:12px;
  max-height: min(58vh, 560px); overflow:auto; padding: 2px 4px 6px;
  -webkit-overflow-scrolling: touch;
}
.sc-alarm {
  position: relative;
  border: 1px solid rgba(167,139,250,0.38);
  background:
    linear-gradient(155deg, rgba(56,28,88,0.55), rgba(18,10,36,0.72)),
    rgba(12,6,24,0.65);
  border-radius: 20px;
  padding: 14px 14px 12px;
  display: flex; flex-direction: column; gap: 10px;
  text-align: left;
  box-shadow:
    0 8px 28px rgba(0,0,0,0.35),
    0 0 0 1px rgba(255,255,255,0.03) inset,
    0 0 24px rgba(139,92,246,0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: border-color 0.25s ease, opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
  animation: sc-alarm-card-in 0.4s cubic-bezier(.16,1,.3,1) both;
}
@keyframes sc-alarm-card-in {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
  to { opacity: 1; transform: none; }
}
.sc-alarm:nth-child(1) { animation-delay: 0.03s; }
.sc-alarm:nth-child(2) { animation-delay: 0.08s; }
.sc-alarm:nth-child(3) { animation-delay: 0.13s; }
.sc-alarm:nth-child(4) { animation-delay: 0.18s; }
.sc-alarm:nth-child(5) { animation-delay: 0.23s; }
.sc-alarm:hover {
  border-color: rgba(196,181,253,0.55);
  box-shadow: 0 10px 32px rgba(0,0,0,0.4), 0 0 28px rgba(139,92,246,0.18);
}
.sc-alarm.off {
  opacity: 0.62;
  border-color: rgba(248,113,113,0.28);
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
}
.sc-alarm.on-glow { border-color: rgba(74,222,128,0.4); }

.sc-alarm-top {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  width: 100%;
}
.sc-alarm-time {
  -webkit-appearance: none !important; appearance: none !important;
  font-family: Orbitron, sans-serif !important;
  font-size: 22px !important; letter-spacing: 0.04em;
  color: #faf5ff !important;
  background: rgba(8,4,20,0.55) !important;
  border: 1px solid rgba(167,139,250,0.4) !important;
  border-radius: 14px !important;
  padding: 10px 12px !important;
  color-scheme: dark !important;
  text-align: center;
  min-width: 0; flex: 1;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.sc-alarm-time:focus {
  outline: none;
  border-color: rgba(94,234,212,0.65) !important;
  box-shadow: 0 0 0 3px rgba(45,212,191,0.18);
}
.sc-alarm-time::-webkit-calendar-picker-indicator {
  filter: invert(0.85) sepia(1) saturate(3) hue-rotate(220deg);
  opacity: 0.7; cursor: pointer;
}

/* Green / red switch */
.sc-alarm-toggle {
  -webkit-appearance: none !important; appearance: none !important;
  position: relative;
  flex: 0 0 auto;
  width: 64px; height: 34px;
  min-width: 64px; padding: 0 !important; margin: 0;
  border-radius: 999px !important;
  border: 1px solid rgba(248,113,113,0.55) !important;
  background: linear-gradient(135deg, #7f1d1d, #450a0a) !important;
  color: transparent !important;
  font-size: 0 !important;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(248,113,113,0.28), inset 0 1px 0 rgba(255,255,255,0.08);
  transition: background 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease;
}
.sc-alarm-toggle::before {
  content: "OFF";
  position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
  font-family: Orbitron, sans-serif; font-size: 8px; letter-spacing: 0.08em;
  color: #fecaca; opacity: 0.95; pointer-events: none;
}
.sc-alarm-toggle::after {
  content: "";
  position: absolute; top: 3px; left: 3px;
  width: 26px; height: 26px; border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  transition: transform 0.28s cubic-bezier(.16,1,.3,1);
}
.sc-alarm-toggle.on {
  border-color: rgba(74,222,128,0.7) !important;
  background: linear-gradient(135deg, #15803d, #064e3b) !important;
  box-shadow: 0 0 16px rgba(74,222,128,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
}
.sc-alarm-toggle.on::before {
  content: "ON"; left: auto; right: 9px; color: #bbf7d0;
}
.sc-alarm-toggle.on::after { transform: translateX(30px); }
.sc-alarm-toggle:active::after { transform: translateX(2px) scale(0.96); }
.sc-alarm-toggle.on:active::after { transform: translateX(28px) scale(0.96); }

.sc-alarm-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sc-alarm-label {
  font-family: Rajdhani, sans-serif; font-weight: 700; font-size: 17px;
  color: #faf5ff; letter-spacing: 0.02em; line-height: 1.2;
}
.sc-alarm-when {
  font-family: Orbitron, sans-serif; font-size: 9px; letter-spacing: 0.1em;
  color: #c4b5fd; text-transform: uppercase; opacity: 0.9; line-height: 1.35;
}

.sc-alarm-divider {
  height: 1px; width: 100%;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,0.35), transparent);
  margin: 0;
}

.sc-alarm-field {
  display: flex; flex-direction: column; align-items: stretch; gap: 6px; width: 100%;
}
.sc-alarm-lbl {
  font-family: Orbitron, sans-serif; font-size: 9px; letter-spacing: 0.16em; color: #a78bfa;
  text-align: left;
}
.sc-alarm-lbl em {
  font-style: normal; color: #67e8f9; letter-spacing: 0.08em; font-size: 9px; margin-left: 6px;
}
.sc-alarm-pick {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
  text-align: left;
  -webkit-appearance: none !important; appearance: none !important;
  background: rgba(8,4,20,0.5) !important;
  border: 1px solid rgba(167,139,250,0.32) !important;
  border-radius: 12px !important;
  padding: 10px 12px !important;
  color: #f5f3ff !important;
  font: inherit; cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
}
.sc-alarm-pick:hover {
  border-color: rgba(196,181,253,0.65) !important;
  box-shadow: 0 0 16px rgba(139,92,246,0.22);
}
.sc-alarm-pick:active { transform: scale(0.99); }
.sc-alarm-pick .txt {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 600; font-size: 14px; font-family: Rajdhani, sans-serif;
}
.sc-alarm-pick .chev { color: #c4b5fd; font-size: 9px; letter-spacing: 0.12em; flex: 0 0 auto; }

.sc-alarm-music-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.sc-alarm-music {
  -webkit-appearance: none !important; appearance: none !important;
  flex: 1; min-width: 0;
  background: rgba(8,4,20,0.55) !important;
  border: 1px solid rgba(167,139,250,0.3) !important;
  border-radius: 12px !important;
  padding: 10px 12px !important;
  color: #ede9fe !important;
  font-family: Rajdhani, sans-serif !important;
  font-size: 14px !important;
  text-align: left;
  color-scheme: dark !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.sc-alarm-music::placeholder { color: rgba(196,181,253,0.45); }
.sc-alarm-music:focus {
  outline: none;
  border-color: rgba(94,234,212,0.55) !important;
  box-shadow: 0 0 0 3px rgba(45,212,191,0.15);
}

.sc-alarm-tools {
  display: flex; align-items: center; gap: 8px; width: 100%;
}
.sc-alarm-tools .sc-alarm-pick { flex: 1; }
.sc-alarm-tools .sc-rem-btn,
.sc-alarm-music-row .sc-rem-btn {
  -webkit-appearance: none !important; appearance: none !important;
  flex: 0 0 auto;
  width: 40px; height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 12px !important;
  border: 1px solid rgba(167,139,250,0.35) !important;
  background: rgba(30,16,48,0.7) !important;
  color: #e9d5ff !important;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.2s ease, background 0.2s ease;
}
.sc-alarm-tools .sc-rem-btn:hover,
.sc-alarm-music-row .sc-rem-btn:hover {
  border-color: rgba(94,234,212,0.5) !important;
  background: rgba(45,212,191,0.15) !important;
}
.sc-alarm-tools .sc-rem-btn.done:hover {
  border-color: rgba(248,113,113,0.55) !important;
  background: rgba(248,113,113,0.15) !important;
}
.sc-alarm-tools .sc-rem-btn:active,
.sc-alarm-music-row .sc-rem-btn:active { transform: scale(0.94); }
.sc-alarm-tools .sc-rem-btn svg,
.sc-alarm-music-row .sc-rem-btn svg { width: 15px; height: 15px; }

/* ── New alarm builder dialog ── */
.sc-alarm-builder {
  text-align: center;
  max-width: min(420px, calc(100vw - 20px));
  animation: sc-alarm-sheet-in 0.42s cubic-bezier(.16,1,.3,1) both;
}
.sc-alarm-builder .sc-modal-head { text-align: center; }
.sc-alarm-builder .sc-modal-sub { color: #c4b5fd; }
.sc-alarm-builder .sc-alarm-form {
  display: grid; gap: 14px; margin: 8px 0 18px; justify-items: stretch;
  text-align: left;
}
.sc-alarm-builder .sc-ab-block {
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(167,139,250,0.28);
  background: rgba(12,6,28,0.45);
  animation: sc-alarm-card-in 0.4s cubic-bezier(.16,1,.3,1) both;
}
.sc-alarm-builder .sc-ab-block:nth-child(1) { animation-delay: 0.05s; }
.sc-alarm-builder .sc-ab-block:nth-child(2) { animation-delay: 0.1s; }
.sc-alarm-builder .sc-ab-block:nth-child(3) { animation-delay: 0.15s; }
.sc-alarm-builder .sc-ab-block:nth-child(4) { animation-delay: 0.2s; }
.sc-alarm-builder .sc-ab-kicker {
  font-family: Orbitron, sans-serif; font-size: 9px; letter-spacing: 0.18em;
  color: #a78bfa; text-transform: uppercase;
}
.sc-alarm-builder .sc-ab-hint {
  font-family: Rajdhani, sans-serif; font-size: 13px; color: rgba(233,213,255,0.7);
  line-height: 1.35; margin: 0;
}
.sc-alarm-builder input[type="time"],
.sc-alarm-builder input[type="text"],
.sc-alarm-builder textarea {
  -webkit-appearance: none !important; appearance: none !important;
  width: 100%; box-sizing: border-box;
  background: rgba(8,4,20,0.65) !important;
  border: 1px solid rgba(167,139,250,0.35) !important;
  border-radius: 14px !important;
  padding: 14px 14px !important;
  color: #faf5ff !important;
  font-family: Rajdhani, sans-serif !important;
  font-size: 16px !important;
  color-scheme: dark !important;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.sc-alarm-builder input[type="time"] {
  font-family: Orbitron, sans-serif !important;
  font-size: 28px !important; letter-spacing: 0.06em;
  text-align: center; padding: 16px !important;
}
.sc-alarm-builder input[type="time"]::-webkit-calendar-picker-indicator {
  filter: invert(0.85) sepia(1) saturate(3) hue-rotate(220deg);
  opacity: 0.75; cursor: pointer;
}
.sc-alarm-builder textarea {
  min-height: 88px; resize: vertical; line-height: 1.4;
}
.sc-alarm-builder input:focus,
.sc-alarm-builder textarea:focus {
  outline: none;
  border-color: rgba(94,234,212,0.6) !important;
  box-shadow: 0 0 0 3px rgba(45,212,191,0.16);
}
.sc-alarm-builder input::placeholder,
.sc-alarm-builder textarea::placeholder { color: rgba(196,181,253,0.4); }
.sc-ab-chips {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px;
}
.sc-ab-chip {
  -webkit-appearance: none !important; appearance: none !important;
  border: 1px solid rgba(167,139,250,0.35) !important;
  background: rgba(76,29,149,0.35) !important;
  color: #e9d5ff !important;
  border-radius: 999px !important;
  padding: 6px 12px !important;
  font-family: Rajdhani, sans-serif; font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.2s ease, border-color 0.2s ease;
}
.sc-ab-chip:hover {
  border-color: rgba(94,234,212,0.5) !important;
  background: rgba(45,212,191,0.18) !important;
}
.sc-ab-chip:active { transform: scale(0.96); }
.sc-alarm-form-actions {
  display: flex; justify-content: center; gap: 10px;
}
.sc-alarm-form-actions .sc-chip {
  min-height: 46px; min-width: 110px;
  transition: transform 0.18s ease, filter 0.2s ease;
}
.sc-alarm-form-actions .sc-chip:active { transform: scale(0.97); }

/* ── Ring modal ── */
.sc-alarm-ring-modal {
  width: min(420px, calc(100vw - 28px));
  border-radius: 22px;
  padding: 18px 18px 16px;
  border: 1px solid rgba(251,191,36,0.45);
  background: linear-gradient(160deg, rgba(48,22,8,0.94), rgba(24,8,48,0.92));
  box-shadow: 0 0 40px rgba(251,191,36,0.28), inset 0 0 30px rgba(251,113,133,0.08);
  text-align: center;
  animation: sc-alarm-sheet-in 0.38s cubic-bezier(.16,1,.3,1) both;
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
  }

  const REC_OPTS = [
    ["once", "Once"],
    ["daily", "Daily"],
    ["weekdays", "Weekdays"],
    ["weekends", "Weekends"],
  ];

  const VIBE_CHIPS = [
    "chill morning acoustic",
    "lofi beats",
    "upbeat wake up",
    "jazz coffee",
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

  Proto._toggleAlarmsMaster = function () {
    const items = this._alarms();
    if (!items.length) {
      this._openAlarmsSheet();
      return;
    }
    const turnOn = this._enabledAlarms().length === 0;
    items.forEach((a) => {
      const on = a.enabled !== false;
      if (turnOn === on) return;
      this._call("script", "alarm_toggle", { id: String(a.id) });
    });
    this._scToast?.(turnOn ? "ALARMS ON" : "ALARMS OFF");
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
            <div class="sc-card-title" style="margin:0">${this._ic("bell")}ALARMS <span style="font-size:9px;letter-spacing:0.12em;color:#67e8f9;margin-left:6px">v20d</span></div>
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
    const cardBg = enabled
      ? "linear-gradient(155deg, rgba(56,28,88,0.75), rgba(18,10,36,0.88))"
      : "linear-gradient(155deg, rgba(60,20,20,0.55), rgba(18,10,20,0.75))";
    const cardBorder = enabled ? "rgba(74,222,128,0.45)" : "rgba(248,113,113,0.35)";
    const swBg = enabled ? "linear-gradient(135deg,#15803d,#064e3b)" : "linear-gradient(135deg,#7f1d1d,#450a0a)";
    const swBorder = enabled ? "rgba(74,222,128,0.75)" : "rgba(248,113,113,0.65)";
    return `
      <article class="sc-alarm ${enabled ? "on-glow" : "off"}" data-alarm-id="${id}"
        style="display:flex;flex-direction:column;gap:10px;text-align:left;padding:14px;border-radius:20px;border:1px solid ${cardBorder};background:${cardBg};box-shadow:0 8px 28px rgba(0,0,0,0.4),0 0 22px rgba(139,92,246,0.15);">
        <div class="sc-alarm-top" style="display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;">
          <input type="time" class="sc-alarm-time" value="${time}" data-act="alarm-time" data-id="${id}" aria-label="Alarm time"
            style="flex:1;-webkit-appearance:none;appearance:none;font-family:Orbitron,sans-serif;font-size:22px;letter-spacing:0.04em;color:#faf5ff;background:rgba(8,4,20,0.7);border:1px solid rgba(167,139,250,0.45);border-radius:14px;padding:10px 12px;color-scheme:dark;text-align:center;min-width:0;">
          <button type="button" class="sc-alarm-toggle ${enabled ? "on" : ""}" data-act="alarm-toggle" data-id="${id}" title="${enabled ? "Disable" : "Enable"}" aria-pressed="${enabled ? "true" : "false"}"
            style="-webkit-appearance:none;appearance:none;flex:0 0 auto;min-width:72px;height:36px;border-radius:999px;border:1px solid ${swBorder};background:${swBg};color:${enabled ? "#bbf7d0" : "#fecaca"};font-family:Orbitron,sans-serif;font-size:11px;letter-spacing:0.14em;cursor:pointer;box-shadow:0 0 14px ${enabled ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.3)"};">${enabled ? "ON" : "OFF"}</button>
        </div>
        <div class="sc-alarm-meta" style="display:flex;flex-direction:column;gap:2px;min-width:0;">
          <div class="sc-alarm-label" style="font-family:Rajdhani,sans-serif;font-weight:700;font-size:17px;color:#faf5ff;">${label}</div>
          <div class="sc-alarm-when" style="font-family:Orbitron,sans-serif;font-size:9px;letter-spacing:0.1em;color:#c4b5fd;text-transform:uppercase;">${this._esc(this._alarmWhenLabel(a))}</div>
        </div>
        <div class="sc-alarm-divider" style="height:1px;width:100%;background:linear-gradient(90deg,transparent,rgba(167,139,250,0.4),transparent);"></div>
        <div class="sc-alarm-field" style="display:flex;flex-direction:column;gap:6px;width:100%;">
          <span class="sc-alarm-lbl" style="font-family:Orbitron,sans-serif;font-size:9px;letter-spacing:0.16em;color:#a78bfa;text-align:left;">MUSIC <em style="font-style:normal;color:#67e8f9;">MA</em></span>
          <div class="sc-alarm-music-row" style="display:flex;align-items:center;gap:8px;width:100%;">
            <input class="sc-alarm-music" value="${music}" data-act="alarm-music" data-id="${id}" placeholder="Playlist or vibe prompt" aria-label="Alarm music"
              style="flex:1;min-width:0;-webkit-appearance:none;appearance:none;background:rgba(8,4,20,0.7);border:1px solid rgba(167,139,250,0.35);border-radius:12px;padding:10px 12px;color:#ede9fe;font-family:Rajdhani,sans-serif;font-size:14px;color-scheme:dark;text-align:left;">
            <button type="button" class="sc-rem-btn" data-act="alarm-music-apply" data-id="${id}" title="Resolve music"
              style="-webkit-appearance:none;appearance:none;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(167,139,250,0.4);background:rgba(30,16,48,0.8);color:#e9d5ff;">${this._ic("check")}</button>
          </div>
        </div>
        <div class="sc-alarm-tools" style="display:flex;align-items:center;gap:8px;width:100%;">
          <button type="button" class="sc-alarm-pick" data-act="alarm-pick-recurring" data-id="${id}" data-current="${this._esc(rec)}"
            style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px;-webkit-appearance:none;appearance:none;background:rgba(8,4,20,0.55);border:1px solid rgba(167,139,250,0.35);border-radius:12px;padding:10px 12px;color:#f5f3ff;cursor:pointer;">
            <span class="txt" style="font-weight:600;font-size:14px;font-family:Rajdhani,sans-serif;">Repeat · ${this._esc(this._recLabel(rec))}</span>
            <span class="chev" style="color:#c4b5fd;font-size:9px;">▼</span>
          </button>
          <button type="button" class="sc-rem-btn done" data-act="alarm-delete" data-id="${id}" title="Delete alarm" aria-label="Delete"
            style="-webkit-appearance:none;appearance:none;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid rgba(248,113,113,0.4);background:rgba(60,16,24,0.75);color:#fecaca;">${this._ic("close")}</button>
        </div>
      </article>`;
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
    const bellSvg = String(this._ic("bell") || "")
      .replace("<svg ", '<svg width="10" height="10" style="width:10px;height:10px;display:block" ');
    btn.innerHTML = `
      <button type="button" class="sc-clock-ico" id="sc-clock-ico" hidden title="Toggle alarms" aria-label="Toggle alarms">${bellSvg}</button>
      <div class="sc-meta-label">${label ? label.textContent : "LOCAL TIME"}</div>
      <div class="sc-clock-row">
        <div class="sc-meta-value" id="sc-clock">--</div>
      </div>`;
    block.replaceWith(btn);
    btn.addEventListener("click", (ev) => {
      if (ev.target.closest("#sc-clock-ico")) return;
      if (this._ringingAlarmId()) this._openAlarmRingSheet(true);
      else this._openAlarmsSheet();
    });
    btn.querySelector("#sc-clock-ico")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._ringingAlarmId()) {
        this._openAlarmRingSheet(true);
        return;
      }
      this._toggleAlarmsMaster();
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
    const enabled = this._enabledAlarms();
    const any = this._alarms().length > 0;
    const hasOn = enabled.length > 0;
    const ringing = !!this._ringingAlarmId();
    if (btn) {
      btn.classList.toggle("has-alarm", hasOn);
      btn.classList.toggle("alarm-off", any && !hasOn && !ringing);
      btn.classList.toggle("ringing", ringing);
      const n = this._nextAlarm();
      btn.title = ringing
        ? "Alarm ringing — tap for snooze/stop"
        : hasOn && n
        ? `Alarms on · next ${this._fmtAlarmTime(n.time)}`
        : any
        ? "Alarms off — tap to manage"
        : "Alarms — tap to set";
    }
    if (ico) {
      ico.hidden = !any && !ringing;
      ico.title = ringing
        ? "Alarm ringing"
        : hasOn
        ? "Alarms on — tap to turn off"
        : any
        ? "Alarms off — tap to turn on"
        : "Alarms";
      ico.setAttribute("aria-pressed", hasOn || ringing ? "true" : "false");
      ico.querySelectorAll("svg").forEach((svg) => {
        svg.setAttribute("width", "10");
        svg.setAttribute("height", "10");
        svg.style.width = "10px";
        svg.style.height = "10px";
        svg.style.display = "block";
      });
    }
  };

  const _paintOrig = Proto._paint;
  Proto._paint = function () {
    _paintOrig.call(this);
    this._syncAlarmRingSheet();
    if (this._alarmsSheetOpen) {
      // Don't nuke the sheet mid-tap / mid-edit — that made delete feel flaky.
      if (this._alarmPointerDown) return;
      this._renderAlarmsSheet(false);
    }
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
            <div class="sc-card-title" style="margin:0">${this._ic("bell")}ALARMS <span style="font-size:9px;letter-spacing:0.12em;color:#67e8f9;margin-left:6px">v20d</span></div>
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
        if (txt) txt.textContent = `Repeat · ${this._recLabel(val)}`;
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
    const chips = VIBE_CHIPS.map(
      (v) => `<button type="button" class="sc-ab-chip" data-vibe="${this._esc(v)}">${this._esc(v)}</button>`
    ).join("");
    m.innerHTML = `
      <div class="sc-modal-backdrop" id="sc-alarm-bd"></div>
      <div class="sc-modal glass sc-alarm-builder">
        <div class="sc-modal-head">
          <div>
            <div class="sc-card-title" style="margin:0">NEW ALARM</div>
            <div class="sc-modal-sub">TIME · VIBE PROMPT · REPEAT</div>
          </div>
          <button class="sc-modal-x" id="sc-alarm-x">✕</button>
        </div>
        <div class="sc-alarm-form">
          <div class="sc-ab-block">
            <span class="sc-ab-kicker">Wake time</span>
            <input type="time" id="sc-ab-time" value="${def}" aria-label="Alarm time">
          </div>
          <div class="sc-ab-block">
            <span class="sc-ab-kicker">Music vibe prompt</span>
            <p class="sc-ab-hint">Describe what you want Music Assistant to play when it rings.</p>
            <textarea id="sc-ab-music" placeholder="e.g. soft acoustic morning playlist, no vocals" autocomplete="off" rows="3"></textarea>
            <div class="sc-ab-chips">${chips}</div>
          </div>
          <div class="sc-ab-block">
            <span class="sc-ab-kicker">Repeat</span>
            <button type="button" class="sc-alarm-pick" id="sc-ab-rec-pick" data-value="once">
              <span class="txt">Repeat · Once</span><span class="chev">▼</span>
            </button>
          </div>
          <div class="sc-ab-block">
            <span class="sc-ab-kicker">Label</span>
            <input type="text" id="sc-ab-label" placeholder="Morning" autocomplete="off">
          </div>
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
    const musicEl = m.querySelector("#sc-ab-music");
    m.querySelectorAll(".sc-ab-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (!musicEl) return;
        musicEl.value = chip.dataset.vibe || chip.textContent || "";
        musicEl.focus();
        musicEl.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
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
      const music = (musicEl?.value || "").trim();
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
    const markPtr = (on) => {
      this._alarmPointerDown = !!on;
      clearTimeout(this._alarmPointerT);
      if (on) {
        this._alarmPointerT = setTimeout(() => { this._alarmPointerDown = false; }, 1200);
      }
    };
    root.addEventListener("pointerdown", () => markPtr(true), true);
    root.addEventListener("pointerup", () => markPtr(false), true);
    root.addEventListener("pointercancel", () => markPtr(false), true);

    root.querySelectorAll("[data-act='alarm-pick-recurring']").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._openAlarmRecurringPicker(el.dataset.id, el.dataset.current);
      });
    });
    root.querySelectorAll("[data-act='alarm-delete']").forEach((el) => {
      // Capture-phase handler so SVG child taps always hit delete, even if base bind is flaky.
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(el.dataset.id || "");
        if (!id) return;
        markPtr(true);
        const card = el.closest(".sc-alarm");
        if (card) {
          card.style.transition = "opacity 0.2s ease, transform 0.2s ease";
          card.style.opacity = "0";
          card.style.transform = "scale(0.96)";
          setTimeout(() => card.remove(), 220);
        }
        this._call("script", "alarm_delete", { id });
        this._scToast?.("ALARM DELETED");
      }, true);
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

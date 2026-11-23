(function () {
  var ctor = customElements.get("spacecadets-panel");
  if (!ctor) return;
  var proto = ctor.prototype;
  var origTabs = proto._tabs;
  var origPaint = proto._paint;
  proto._tabs = function () {
    var tabs = origTabs.call(this);
    if (!tabs.some(function (row) { return row[0] === "mission"; })) {
      var overview = tabs.findIndex(function (row) { return row[0] === "overview"; });
      tabs.splice(overview + 1, 0, ["mission", "Mission Control", "\u25CE"]);
    }
    return tabs;
  };
  proto._ensureMission = async function () {
    if (this._mcSrc || !this._hass || !this._hass.callWS) return;
    try {
      var info = await this._hass.callWS({
        type: "supervisor/api",
        endpoint: "/addons/local_mission_control/info",
        method: "get",
      });
      if (info && info.ingress_entry) this._mcSrc = String(info.ingress_entry).replace(/\/$/, "") + "/";
    } catch (err) {
      this._mcSrc = "";
    }
  };
  proto._htmlMission = function () {
    if (!this._mcSrc) {
      return '<div id="sc-mc-keep" class="sc-mc-keep"><p class="sc-mc-note">Mission Control is not available from this login yet.</p></div>';
    }
    return '<div id="sc-mc-keep" class="sc-mc-keep"><iframe class="sc-mc-frame" title="Mission Control" src="' + this._mcSrc + '"></iframe></div>';
  };
  proto._paint = async function () {
    if (this._tab === "mission") await this._ensureMission();
    var keep = this.querySelector("#sc-mc-keep");
    origPaint.call(this);
    if (this._tab !== "mission") return;
    var view = this.querySelector("#sc-view");
    if (!view) return;
    view.classList.remove("ov");
    if (keep) view.replaceChildren(keep);
    else view.innerHTML = this._htmlMission();
  };
  if (!document.getElementById("sc-mc-style")) {
    var style = document.createElement("style");
    style.id = "sc-mc-style";
    style.textContent = ".sc-mc-keep{min-height:calc(100vh - 150px)}.sc-mc-frame{width:100%;height:calc(100vh - 150px);border:0;border-radius:22px;background:#07010f}.sc-mc-note{margin:0;padding:24px;color:#d8b4fe}";
    document.head.appendChild(style);
  }
})();

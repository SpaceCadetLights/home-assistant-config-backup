(function () {
  function loadSync(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error("Space Cadets load failed: " + url + " " + xhr.status);
    }
    return xhr.responseText;
  }
  if (!customElements.get("spacecadets-panel")) {
    var code = loadSync("/local/spacecadets/panel.20260914b.js?v=20261120d")
      .replace(/trail-map\.html\?v=20260717g/g, "trail-map.html?v=20261008a")
      .replace(/trail-map\.html\?v=20260717h/g, "trail-map.html?v=20261008a");
    (0, eval)(code);
  }
  (0, eval)(loadSync("/local/spacecadets/panel.alarms.20261120d.js?v=20261120d"));
})();

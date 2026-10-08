(function () {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/local/spacecadets/panel.20260914b.js", false);
  xhr.send(null);
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error("Space Cadets panel base load failed: " + xhr.status);
  }
  var code = xhr.responseText
    .replace(/trail-map\.html\?v=20260717g/g, "trail-map.html?v=20261008a")
    .replace(/trail-map\.html\?v=20260717h/g, "trail-map.html?v=20261008a");
  (0, eval)(code);
})();

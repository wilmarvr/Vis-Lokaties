/* =======================================================
   Vis Lokaties — map.js
   Kaartbeheer, OSM-detectie, heatmap, GPS, contouren, kompas
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log, state, saveState } from "./core.js";

let map, heatLayer, clusterGroup;
let depthTooltip, compassControl;
let mouseLabel, zoomLabel;

/* ---------- INITIALISATIE ---------- */
export function initMap() {
  map = L.map("mapContainer", {
    center: state.center,
    zoom: state.zoom,
    zoomControl: true
  });

  // Basemaps
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  const dark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; CartoDB"
  });

  const baseMaps = { "OSM": osm, "Donker": dark };
  L.control.layers(baseMaps).addTo(map);

  // Clusterlaag
  clusterGroup = L.markerClusterGroup();
  map.addLayer(clusterGroup);

  // Heatmaplaag
  heatLayer = L.heatLayer([], {
    radius: state.settings.heatmapRadius,
    blur: state.settings.heatmapBlur,
    maxZoom: 12
  }).addTo(map);

  // Tooltip (muiscoördinaten)
  depthTooltip = L.tooltip({ permanent: false, direction: "top", className: "depth-tip" });
  map.on("mousemove", onMouseMove);
  map.on("click", (e) => log("Kaartklik", e.latlng));

  // Statuslabels
  mouseLabel = document.createElement("span");
  mouseLabel.id = "mouseLL";
  zoomLabel = document.createElement("span");
  zoomLabel.id = "zoomLbl";
  const statusLine = document.getElementById("statusLine");
  statusLine.after(mouseLabel);
  mouseLabel.after(zoomLabel);

  map.on("mousemove", e => {
    const { lat, lng } = e.latlng;
    mouseLabel.textContent = ` | Lat:${lat.toFixed(5)} Lon:${lng.toFixed(5)}`;
  });
  map.on("zoomend", () => {
    zoomLabel.textContent = ` | Zoom:${map.getZoom()}`;
  });

  // GPS koppelingen
  document.getElementById("btnTrackGPS").addEventListener("click", startGPS);
  document.getElementById("btnStopGPS").addEventListener("click", stopGPS);
  document.getElementById("btnCenter").addEventListener("click", () => map.panTo(state.center));

  // Detectieknoppen
  document.getElementById("btnDetectWater").addEventListener("click", detectOSMWater);
  const btnViewport = document.createElement("button");
  btnViewport.textContent = "Detectie (viewport)";
  btnViewport.id = "btnDetectViewport";
  document.querySelector("#uiControls details:nth-of-type(1) .group:last-of-type").appendChild(btnViewport);
  btnViewport.addEventListener("click", detectViewport);

  const btnSelect = document.createElement("button");
  btnSelect.textContent = "Detectie (selectie)";
  btnSelect.id = "btnDetectSelection";
  document.querySelector("#uiControls details:nth-of-type(1) .group:last-of-type").appendChild(btnSelect);
  btnSelect.addEventListener("click", detectSelection);

  // Heatmap & contouren
  document.getElementById("btnShowHeat").addEventListener("click", showHeatmap);
  document.getElementById("btnMakeContours").addEventListener("click", makeContours);
  document.getElementById("btnClearContours").addEventListener("click", clearContours);

  // Kompas-overlay
  addCompass();

  setStatus("Kaart geladen", "ok");
  log("Kaart init voltooid");
}

/* ---------- MUISCOÖRDINATEN ---------- */
function onMouseMove(e) {
  const { lat, lng } = e.latlng;
  depthTooltip.setLatLng(e.latlng).setContent(`Lat:${lat.toFixed(5)}, Lon:${lng.toFixed(5)}`).addTo(map);
}

/* ---------- OSM-WATERDETECTIE ---------- */
export async function detectOSMWater() {
  setStatus("Detectie van OSM-water gestart...");
  try {
    const bounds = map.getBounds();
    const query = `
      [out:json][timeout:25];
      (
        way["natural"="water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
        relation["natural"="water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      );
      out body; >; out skel qt;`;
    const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
    const data = await response.json();
    const geojson = osmtogeojson(data);
    L.geoJSON(geojson, { style: { color: "#00aaff", weight: 1, fillOpacity: 0.4 } }).addTo(map);
    setStatus(`Waterlagen geladen (${geojson.features.length})`, "ok");
  } catch (err) {
    setStatus("Fout bij waterdetectie", "error");
    console.error(err);
  }
}

/* ---------- DETECTIE (VIEWPORT / SELECTIE) ---------- */
export function detectViewport() {
  const bounds = map.getBounds();
  const inView = (state.imports || []).filter(p =>
    p.lat > bounds.getSouth() && p.lat < bounds.getNorth() &&
    p.lng > bounds.getWest() && p.lng < bounds.getEast()
  );
  setStatus(`${inView.length} punten in huidig beeld`, "ok");
  log("Detectie viewport", inView);
}

export function detectSelection() {
  setStatus("Selectie detectie gestart...");
  map.once("click", (e) => {
    const circle = L.circle(e.latlng, { radius: 200, color: "#ff8800", fillOpacity: 0.2 }).addTo(map);
    const found = (state.imports || []).filter(p => map.distance([p.lat, p.lng], e.latlng) < 200);
    setStatus(`${found.length} punten binnen 200m selectie`, "ok");
    setTimeout(() => map.removeLayer(circle), 5000);
    log("Detectie selectie", found);
  });
}

/* ---------- HEATMAP ---------- */
export function showHeatmap() {
  const points = (state.imports || []).map(p => [p.lat, p.lng, p.val || 0.5]);
  if (!points.length) {
    setStatus("Geen data voor heatmap", "error");
    return;
  }
  heatLayer.setLatLngs(points);
  createLegend();
  setStatus("Heatmap weergegeven", "ok");
}

/* ---------- CONTOUREN ---------- */
export function makeContours() {
  try {
    const pts = state.imports.map(p => turf.point([p.lng, p.lat], { depth: p.val }));
    const fc = turf.featureCollection(pts);
    const grid = turf.interpolate(fc, 0.05, { gridType: "points", property: "depth" });
    const contours = turf.isolines(grid, { zProperty: "depth" });
    L.geoJSON(contours, { style: { color: "#ff8800", weight: 1 } }).addTo(map);
    setStatus("Contouren gegenereerd", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Fout bij contouren", "error");
  }
}

export function clearContours() {
  map.eachLayer(layer => {
    if (layer instanceof L.GeoJSON && layer.options.style?.color === "#ff8800") map.removeLayer(layer);
  });
  setStatus("Contouren gewist", "ok");
}

/* ---------- GPS ---------- */
let gpsWatch = null;

export function startGPS() {
  if (!navigator.geolocation) return setStatus("Geen GPS-ondersteuning", "error");
  setStatus("GPS starten...");
  gpsWatch = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude, accuracy, speed } = pos.coords;
      document.getElementById("gpsLat").textContent = latitude.toFixed(5);
      document.getElementById("gpsLon").textContent = longitude.toFixed(5);
      document.getElementById("gpsAcc").textContent = accuracy.toFixed(1);
      document.getElementById("gpsSpeed").textContent = (speed || 0).toFixed(1);
      const latlng = [latitude, longitude];
      state.center = latlng;
      if (state.gpsActive) map.panTo(latlng);
    },
    err => setStatus(`GPS-fout: ${err.message}`, "error"),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
  state.gpsActive = true;
  saveState();
}

export function stopGPS() {
  if (gpsWatch) {
    navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
  }
  setStatus("GPS gestopt", "ok");
  state.gpsActive = false;
  saveState();
}

/* ---------- HEATMAP-LEGENDA ---------- */
function createLegend() {
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend inv");
    div.innerHTML = `
      <h4>Heatmap intensiteit</h4>
      <i style="background:#00f"></i> Laag<br>
      <i style="background:#0ff"></i> Gemiddeld<br>
      <i style="background:#f00"></i> Hoog
    `;
    return div;
  };
  legend.addTo(map);
}

/* ---------- KOMPAS OVERLAY ---------- */
function addCompass() {
  compassControl = L.control({ position: "topright" });
  compassControl.onAdd = () => {
    const div = L.DomUtil.create("div", "compass-control");
    div.innerHTML = `<img src="assets/img/icon-wind.png" id="compArrow" style="transform: rotate(0deg); width:24px; transition: transform 0.5s;">`;
    return div;
  };
  compassControl.addTo(map);
}

/* ---------- EXPORT ---------- */
window.VisLokMap = {
  initMap,
  detectOSMWater,
  detectViewport,
  detectSelection,
  showHeatmap,
  makeContours,
  clearContours,
  startGPS,
  stopGPS
};

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initMap);

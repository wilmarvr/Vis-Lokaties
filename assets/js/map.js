/* =======================================================
   Vis Lokaties — map.js
   Kaartbeheer, detectie, heatmap, GPS, database-sync markers
   Versie: 0.1.0
   ======================================================= */

import { setStatus, log, state, saveState, setFooterInfo } from "./core.js";
import { distanceM } from "./helpers.js";

let map;
let heatLayer;
let legendControl;
let clusterGroup;
let importLayer;
let waterLayer;
let stekLayer;
let rigLayer;
let selectionCircle = null;
let distanceMode = false;
let distancePoints = [];
let distanceLine = null;
let pickResolver = null;
let baseLayers = {};
let activeBaseLayer = null;

/* ---------- INITIALISATIE ---------- */
export function initMap() {
  map = L.map("mapContainer", {
    center: state.center,
    zoom: state.zoom,
    zoomControl: true
  });

  createBaseLayers();
  switchBaseLayer(state.baseLayer || "osm");

  const layerControl = L.control.layers(
    {
      "OpenStreetMap": baseLayers.osm,
      "Topo": baseLayers.topo,
      "Stamen Toner": baseLayers.toner,
      "Donker": baseLayers.dark
    },
    {}
  ).addTo(map);

  clusterGroup = L.markerClusterGroup({ disableClusteringAtZoom: 15 });
  importLayer = L.layerGroup().addTo(map);
  waterLayer = L.layerGroup().addTo(map);
  stekLayer = L.layerGroup();
  rigLayer = L.layerGroup();

  if (state.settings.cluster) {
    map.addLayer(clusterGroup);
  } else {
    map.addLayer(stekLayer);
    map.addLayer(rigLayer);
  }

  heatLayer = L.heatLayer([], {
    radius: state.settings.heatmapRadius,
    blur: state.settings.heatmapBlur,
    maxZoom: 12
  }).addTo(map);

  window.map = map;
  window.L = window.L || L;
  window.L.mapInstance = map;

  map.on("moveend", () => {
    const c = map.getCenter();
    state.center = [c.lat, c.lng];
    state.zoom = map.getZoom();
    setFooterInfo({ zoom: `| Zoom: ${map.getZoom()}` });
    saveState();
  });

  map.on("mousemove", handleMouseMove);
  map.on("click", handleMapPick);

  setFooterInfo({ zoom: `| Zoom: ${map.getZoom()}` });

  bindUI();
  refreshDataLayers();
  refreshImportLayer();

  setStatus("Kaart geladen", "ok");
  log("Kaart init voltooid");
  document.dispatchEvent(new Event("vislok:map-ready"));
}

function createBaseLayers() {
  baseLayers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }),
    topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "&copy; OpenTopoMap"
    }),
    toner: L.tileLayer("https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: "Map tiles by Stamen Design"
    }),
    dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution: "&copy; CartoDB"
    })
  };
}

function switchBaseLayer(key) {
  if (!baseLayers[key]) key = "osm";
  if (activeBaseLayer) {
    map.removeLayer(activeBaseLayer);
  }
  activeBaseLayer = baseLayers[key];
  activeBaseLayer.addTo(map);
  state.baseLayer = key;
  saveState();
}

function bindUI() {
  document.getElementById("btnTrackGPS")?.addEventListener("click", startGPS);
  document.getElementById("btnStopGPS")?.addEventListener("click", stopGPS);
  document.getElementById("btnCenter")?.addEventListener("click", () => map.panTo(state.center));
  document.getElementById("btnDetectWater")?.addEventListener("click", detectOSMWater);
  document.getElementById("btnDetectViewport")?.addEventListener("click", detectViewport);
  document.getElementById("btnDetectSelection")?.addEventListener("click", detectSelection);
  document.getElementById("btnClearSelection")?.addEventListener("click", clearSelection);
  document.getElementById("btnShowHeat")?.addEventListener("click", showHeatmap);
  document.getElementById("btnMakeContours")?.addEventListener("click", makeContours);
  document.getElementById("btnClearContours")?.addEventListener("click", clearContours);
  document.getElementById("btnDrawDistances")?.addEventListener("click", toggleDistanceMode);
  document.getElementById("btnCluster")?.addEventListener("click", toggleClusterMode);
  document.getElementById("btnFixDrag")?.addEventListener("click", fixDragIssues);

  document.addEventListener("vislok:basemap", e => switchBaseLayer(e.detail));
  document.addEventListener("vislok:detect-radius", e => {
    if (selectionCircle) selectionCircle.setRadius(e.detail);
  });
}

/* ---------- FOOTER & MOUSE ---------- */
function handleMouseMove(e) {
  const { lat, lng } = e.latlng;
  setFooterInfo({ mouse: `| Lat: ${lat.toFixed(5)} Lon: ${lng.toFixed(5)}` });

  if (state.imports?.length) {
    let nearest = null;
    let min = Infinity;
    for (const p of state.imports) {
      const d = map.distance([lat, lng], [p.lat, p.lng]);
      if (d < min) {
        min = d;
        nearest = p;
      }
    }
    if (nearest) {
      const value = nearest.val ?? nearest.depth ?? 0;
      setFooterInfo({ depth: `| Diepte: ${value.toFixed(1)}m @ ${Math.round(min)}m` });
    } else {
      setFooterInfo({ depth: "| Diepte: –" });
    }
  } else {
    setFooterInfo({ depth: "| Diepte: –" });
  }
}

/* ---------- PICK MODE ---------- */
function handleMapPick(e) {
  if (pickResolver) {
    pickResolver(e.latlng);
    map.getContainer().classList.remove("map-pick-active");
    setStatus("Kaartselectie voltooid", "ok");
    pickResolver = null;
    return;
  }

  if (distanceMode) {
    addDistancePoint(e.latlng);
  }
}

export function requestLocationPick(label = "punt") {
  return new Promise(resolve => {
    pickResolver = resolve;
    map.getContainer().classList.add("map-pick-active");
    setStatus(`Klik op de kaart om ${label} te kiezen`, "info");
  });
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
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query
    });
    const data = await response.json();
    const geojson = osmtogeojson(data);
    L.geoJSON(geojson, {
      style: { color: "#00aaff", weight: 1, fillOpacity: 0.3 }
    }).addTo(map);
    setStatus(`Waterlagen geladen (${geojson.features.length})`, "ok");
  } catch (err) {
    setStatus("Fout bij waterdetectie", "error");
    console.error(err);
  }
}

/* ---------- DETECTIE ---------- */
export function detectViewport() {
  const bounds = map.getBounds();
  const inView = (state.imports || []).filter(p =>
    p.lat > bounds.getSouth() &&
    p.lat < bounds.getNorth() &&
    p.lng > bounds.getWest() &&
    p.lng < bounds.getEast()
  );
  setStatus(`${inView.length} punten in huidig beeld`, "ok");
  setFooterInfo({ detect: `| Detectie: ${inView.length} punten in beeld` });
  log("Detectie viewport", inView);
}

export function detectSelection() {
  setStatus("Klik op de kaart om selectie te plaatsen", "info");
  map.once("click", e => {
    if (selectionCircle) map.removeLayer(selectionCircle);
    selectionCircle = L.circle(e.latlng, {
      radius: state.settings.detectionRadius,
      color: "#ff8800",
      fillOpacity: 0.2
    }).addTo(map);

    const found = (state.imports || []).filter(p => map.distance([p.lat, p.lng], e.latlng) < state.settings.detectionRadius);
    setStatus(`${found.length} punten binnen ${state.settings.detectionRadius}m`, "ok");
    setFooterInfo({ detect: `| Detectie: ${found.length} binnen selectie` });
    log("Detectie selectie", found);
  });
}

export function clearSelection() {
  if (selectionCircle) {
    map.removeLayer(selectionCircle);
    selectionCircle = null;
  }
  setFooterInfo({ detect: "| Detectie: –" });
  setStatus("Selectie gewist", "ok");
}

/* ---------- HEATMAP ---------- */
export function showHeatmap() {
  const points = (state.imports || []).map(p => [p.lat, p.lng, p.val || p.depth || 0.5]);
  if (!points.length) {
    setStatus("Geen data voor heatmap", "error");
    return;
  }
  heatLayer.setLatLngs(points);
  createLegend();
  setStatus("Heatmap bijgewerkt", "ok");
}

/* ---------- CONTOUREN ---------- */
export function makeContours() {
  try {
    if (!state.imports?.length) {
      return setStatus("Geen importpunten voor contouren", "error");
    }
    const pts = state.imports.map(p => turf.point([p.lng, p.lat], { depth: p.val ?? p.depth ?? 0 }));
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
    if (layer instanceof L.GeoJSON && layer.options.style?.color === "#ff8800") {
      map.removeLayer(layer);
    }
  });
  if (legendControl) {
    legendControl.remove();
    legendControl = null;
  }
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

/* ---------- OVERLAY HELPERS ---------- */
function createLegend() {
  if (legendControl) legendControl.remove();
  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = () => {
    const div = L.DomUtil.create("div", "legend inv");
    div.innerHTML = `
      <h4>Heatmap intensiteit</h4>
      <i style="background:#00f"></i> Laag<br>
      <i style="background:#0ff"></i> Gemiddeld<br>
      <i style="background:#f00"></i> Hoog
    `;
    return div;
  };
  legendControl.addTo(map);
}

function toggleClusterMode() {
  state.settings.cluster = !state.settings.cluster;
  if (state.settings.cluster) {
    map.addLayer(clusterGroup);
    if (map.hasLayer(stekLayer)) map.removeLayer(stekLayer);
    if (map.hasLayer(rigLayer)) map.removeLayer(rigLayer);
  } else {
    if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
    map.addLayer(stekLayer);
    map.addLayer(rigLayer);
  }
  refreshDataLayers();
  saveState();
  setStatus(`Clustering ${state.settings.cluster ? "ingeschakeld" : "uitgeschakeld"}`, "ok");
}

function fixDragIssues() {
  map.dragging.enable();
  map.scrollWheelZoom.enable();
  map.boxZoom.enable();
  map.invalidateSize();
  setStatus("Kaartinteractie hersteld", "ok");
}

/* ---------- DISTANCE TOOL ---------- */
function toggleDistanceMode() {
  distanceMode = !distanceMode;
  if (!distanceMode) {
    if (distanceLine) {
      map.removeLayer(distanceLine);
      distanceLine = null;
    }
    distancePoints = [];
    setStatus("Afstandstool gedeactiveerd", "ok");
  } else {
    setStatus("Klik op de kaart om punten te meten", "info");
  }
}

function addDistancePoint(latlng) {
  distancePoints.push(latlng);
  if (distancePoints.length > 1) {
    if (distanceLine) {
      distanceLine.addLatLng(latlng);
    } else {
      distanceLine = L.polyline(distancePoints, { color: "#00ffaa" }).addTo(map);
    }
    const total = distancePoints.reduce((acc, point, idx, arr) => {
      if (idx === 0) return 0;
      return acc + distanceM(arr[idx - 1].lat, arr[idx - 1].lng, point.lat, point.lng);
    }, 0);
    setStatus(`Totale afstand: ${(total / 1000).toFixed(2)} km`, "ok");
  } else {
    distanceLine = L.polyline(distancePoints, { color: "#00ffaa" }).addTo(map);
  }
}

/* ---------- DATA LAGEN ---------- */
export function refreshImportLayer() {
  importLayer.clearLayers();
  if (!state.imports?.length) {
    setFooterInfo({ detect: "| Detectie: –" });
    return;
  }
  const limited = state.imports.slice(0, 2000);
  limited.forEach(p => {
    L.circleMarker([p.lat, p.lng], {
      radius: 3,
      color: "#ffaa00",
      weight: 1,
      fillOpacity: 0.6
    })
      .bindPopup(`Diepte: ${(p.val ?? p.depth ?? 0).toFixed(1)} m`)
      .addTo(importLayer);
  });
}

export function refreshDataLayers() {
  waterLayer.clearLayers();
  stekLayer.clearLayers();
  rigLayer.clearLayers();
  clusterGroup.clearLayers();

  (state.waters || []).forEach(w => {
    if (!w.lat || !w.lng) return;
    L.circleMarker([w.lat, w.lng], {
      radius: 6,
      color: "#42a5f5",
      fillColor: "#0d47a1",
      fillOpacity: 0.6
    })
      .bindPopup(`<strong>Water:</strong> ${w.name || "Onbekend"}`)
      .addTo(waterLayer);
  });

  const stekMarkers = (state.stekken || []).map(s => createSpotMarker(s, "stek"));
  const rigMarkers = (state.rigs || []).map(r => createSpotMarker(r, "rig"));

  if (state.settings.cluster) {
    stekMarkers.concat(rigMarkers).forEach(m => m && clusterGroup.addLayer(m));
  } else {
    stekMarkers.forEach(m => m && stekLayer.addLayer(m));
    rigMarkers.forEach(m => m && rigLayer.addLayer(m));
  }

  if (!map.hasLayer(waterLayer)) map.addLayer(waterLayer);
  if (!state.settings.cluster) {
    if (!map.hasLayer(stekLayer)) map.addLayer(stekLayer);
    if (!map.hasLayer(rigLayer)) map.addLayer(rigLayer);
  }
}

function createSpotMarker(item, type) {
  if (!item.lat || !item.lng) return null;
  const colors = type === "stek" ? ["#ff9800", "#e65100"] : ["#ab47bc", "#4a148c"];
  return L.circleMarker([item.lat, item.lng], {
    radius: 7,
    color: colors[0],
    fillColor: colors[1],
    fillOpacity: 0.75,
    weight: 2
  }).bindPopup(`
      <strong>${type === "stek" ? "Stek" : "Rig"}:</strong> ${item.name || "Onbekend"}<br>
      Lat/Lon: ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}<br>
      ${item.val !== undefined ? `Waarde: ${item.val}` : ""}
    `);
}

/* ---------- EXPORT ALS MODULE ---------- */
window.VisLokMap = {
  initMap,
  detectOSMWater,
  detectViewport,
  detectSelection,
  clearSelection,
  showHeatmap,
  makeContours,
  clearContours,
  startGPS,
  stopGPS,
  refreshDataLayers,
  refreshImportLayer,
  requestLocationPick
};

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initMap);

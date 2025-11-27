/* =======================================================
   Vis Lokaties — map.js
   Kaartbeheer, detectie, heatmap, GPS, interactieve spots
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log, state, saveState, setFooterInfo } from "./core.js?v=20250715";
import { distanceM, formatLatLng, escapeHtml } from "./helpers.js?v=20250715";
import { interpolateDepthAt } from "./depth.js?v=20250715";
import { t } from "./i18n.js?v=20250715";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://z.overpass-api.de/api/interpreter"
];

let map;
let heatLayer;
let legendControl;
let layerControl;
let clusterGroup;
let importLayer;
let waterLayer;
let stekLayer;
let rigLayer;
let linkLayer;
let contourLayer;
let selectionCircle = null;
let selectionMeta = null;
let distanceMode = false;
let distancePoints = [];
let distanceLine = null;
let pickResolver = null;
let baseLayers = {};
let activeBaseLayer = null;
let depthTooltip = null;
let clickMode = "none";
let detectionLayer = null;
let currentDetection = null;
let drawWaterActive = false;
let drawWaterPoints = [];
let drawWaterLayer = null;
let doubleClickWasEnabled = true;
let placementTooltip = null;
let placementBase = null;
let placementMode = null;
let interactionLock = 0;
let pendingMouseLatLng = null;
let mouseMoveFrame = null;
let pointerDownPoint = null;
let suppressPlacementClick = false;
let suppressTimer = null;
let dragDistanceTooltip = null;
let dragDistanceLine = null;
let dragDistanceContext = null;
let spotPopup = null;
let spotPopupData = null;
const markerRegistry = {
  stek: new Map(),
  rig: new Map()
};

function emitMapBounds() {
  if (!map) return;
  const bounds = map.getBounds();
  if (!bounds) return;
  const detail = {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
    zoom: map.getZoom()
  };
  document.dispatchEvent(new CustomEvent("vislok:map-bounds", { detail }));
}

/* ---------- INITIALISATIE ---------- */
export function initMap() {
  map = L.map("mapContainer", {
    center: state.center,
    zoom: state.zoom,
    zoomControl: true
  });

  const container = document.getElementById("mapContainer");
  if (container) {
    const refreshSize = () => map.invalidateSize();
    requestAnimationFrame(refreshSize);
    setTimeout(refreshSize, 120);
  }

  createBaseLayers();
  switchBaseLayer(state.baseLayer || "osm");

  createLayerControl();

  clusterGroup = L.markerClusterGroup({ disableClusteringAtZoom: 15 });
  importLayer = L.layerGroup().addTo(map);
  waterLayer = L.layerGroup().addTo(map);
  stekLayer = L.layerGroup();
  rigLayer = L.layerGroup();
  linkLayer = L.layerGroup().addTo(map);
  contourLayer = L.layerGroup().addTo(map);

  if (state.settings.cluster) {
    map.addLayer(clusterGroup);
  } else {
    map.addLayer(stekLayer);
    map.addLayer(rigLayer);
  }

  heatLayer = L.heatLayer([], {
    radius: state.settings.heatmapRadius,
    blur: state.settings.heatmapBlur,
    maxZoom: 16
  }).addTo(map);

  depthTooltip = L.tooltip({
    permanent: false,
    className: "depth-tip",
    direction: "top"
  });

  window.map = map;
  window.L = window.L || L;

  map.on("moveend", () => {
    const c = map.getCenter();
    state.center = [c.lat, c.lng];
    state.zoom = map.getZoom();
    setFooterInfo({ zoom: `| ${t("footer_zoom", "Zoom")}: ${map.getZoom()}` });
    saveState();
    refreshImportLayer();
    emitMapBounds();
  });
  map.on("zoomend", () => {
    refreshImportLayer();
    emitMapBounds();
  });
  map.on("mousemove", handleMouseMove);
  map.on("click", handleMapClick);
  map.on("dblclick", handleMapDoubleClick);
  map.on("mousedown", rememberPointerOrigin);
  map.on("touchstart", rememberPointerOrigin);
  map.on("mouseup", resetPointerOrigin);
  map.on("touchend", resetPointerOrigin);
  map.on("dragstart", markClickSuppressed);
  map.on("dragend", markClickSuppressed);

  setFooterInfo({ zoom: `| ${t("footer_zoom", "Zoom")}: ${map.getZoom()}` });
  emitMapBounds();

  bindUI();
  refreshDataLayers();
  refreshImportLayer();
  if (state.imports?.length) {
    showHeatmap(false);
  }

  setStatus(t("status_map_ready", "Kaart geladen"), "ok");
  log("Kaart init voltooid");
  document.dispatchEvent(new Event("vislok:map-ready"));
}

document.addEventListener("click", handleSpotPopupAction, true);

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

function createLayerControl() {
  if (!map) return;
  if (layerControl) {
    layerControl.remove();
  }
  layerControl = L.control.layers(
    {
      [t("basemap_osm", "OpenStreetMap")]: baseLayers.osm,
      [t("basemap_topo", "Topo")]: baseLayers.topo,
      [t("basemap_toner", "Stamen Toner")]: baseLayers.toner,
      [t("basemap_dark", "Donker")]: baseLayers.dark
    },
    {}
  );
  layerControl.addTo(map);
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

function disableMapInteractions() {
  if (!map) return;
  if (map.dragging) map.dragging.disable();
  if (map.boxZoom) map.boxZoom.disable();
  if (map.doubleClickZoom) map.doubleClickZoom.disable();
  if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
}

function enableMapInteractions() {
  if (!map) return;
  if (map.dragging) map.dragging.enable();
  if (map.boxZoom) map.boxZoom.enable();
  if (map.doubleClickZoom) map.doubleClickZoom.enable();
  if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
}

function cloneContainerPoint(e) {
  if (!e) return null;
  if (e.containerPoint && typeof e.containerPoint.clone === "function") {
    return e.containerPoint.clone();
  }
  const touch = e.originalEvent?.touches?.[0];
  if (touch && map?.mouseEventToContainerPoint) {
    return map.mouseEventToContainerPoint(touch);
  }
  return null;
}

function markClickSuppressed() {
  suppressPlacementClick = true;
  if (suppressTimer) clearTimeout(suppressTimer);
  suppressTimer = setTimeout(() => {
    suppressPlacementClick = false;
    suppressTimer = null;
  }, 250);
}

function consumeClickSuppression() {
  if (!suppressPlacementClick) return false;
  suppressPlacementClick = false;
  if (suppressTimer) {
    clearTimeout(suppressTimer);
    suppressTimer = null;
  }
  return true;
}

function rememberPointerOrigin(e) {
  pointerDownPoint = cloneContainerPoint(e);
}

function resetPointerOrigin() {
  pointerDownPoint = null;
}

function detectPointerDrag(e) {
  if (!pointerDownPoint || !map) return;
  const buttons = e?.originalEvent?.buttons;
  const touchCount = e?.originalEvent?.touches?.length || 0;
  if (!buttons && !touchCount) return;
  let currentPoint = cloneContainerPoint(e);
  if (!currentPoint) return;
  const distance =
    typeof pointerDownPoint.distanceTo === "function"
      ? pointerDownPoint.distanceTo(currentPoint)
      : Math.hypot(pointerDownPoint.x - currentPoint.x, pointerDownPoint.y - currentPoint.y);
  if (distance > 8) {
    markClickSuppressed();
  }
}

function suspendMapInteractions() {
  if (!map) return;
  if (interactionLock === 0) {
    disableMapInteractions();
  }
  interactionLock += 1;
}

function resumeMapInteractions(force = false) {
  if (!map) return;
  if (force) {
    interactionLock = 0;
  } else if (interactionLock > 0) {
    interactionLock -= 1;
  }
  if (interactionLock === 0) {
    enableMapInteractions();
  }
}

function swallowLeafletEvent(event) {
  const original = event?.originalEvent || event;
  if (!original) return;
  if (typeof original.stopPropagation === "function") {
    original.stopPropagation();
  }
  if (typeof original.preventDefault === "function") {
    original.preventDefault();
  }
}

function bindUI() {
  const releaseAllInteractions = () => resumeMapInteractions(true);
  if (typeof document !== "undefined") {
    ["mouseup", "touchend", "touchcancel"].forEach(evt => {
      document.addEventListener(evt, releaseAllInteractions, true);
    });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") {
          resumeMapInteractions(true);
        }
      },
      true
    );
  }
  if (typeof window !== "undefined") {
    window.addEventListener(
      "blur",
      () => {
        resumeMapInteractions(true);
      },
      true
    );
  }

  document.addEventListener("vislok:basemap", e => switchBaseLayer(e.detail));
  document.addEventListener("vislok:detect-radius", e => {
    if (selectionCircle) selectionCircle.setRadius(e.detail);
    if (selectionMeta) selectionMeta.radius = e.detail;
    if (currentDetection?.radius) currentDetection.radius = e.detail;
  });
  document.addEventListener("vislok:max-edge", () => {
    if (currentDetection) rerunDetection();
  });
  ["heat-radius", "heat-blur", "heat-min", "heat-max", "heat-invert", "heat-clamp"].forEach(evt => {
    document.addEventListener(`vislok:${evt}`, () => {
      updateHeatOptions();
      if (state.imports?.length) showHeatmap(false);
    });
  });

  document.getElementById("btnTrackGPS")?.addEventListener("click", startGPS);
  document.getElementById("btnStopGPS")?.addEventListener("click", stopGPS);
  document.getElementById("btnCenter")?.addEventListener("click", () => map.panTo(state.center));
  document.getElementById("btnDetectWater")?.addEventListener("click", detectOSMWater);
  document.getElementById("btnDetectViewport")?.addEventListener("click", detectViewport);
  document.getElementById("btnDetectSelection")?.addEventListener("click", detectSelection);
  document.getElementById("btnClearSelection")?.addEventListener("click", clearSelection);
  document.getElementById("btnShowHeat")?.addEventListener("click", () => showHeatmap(true));
  document.getElementById("btnClearHeat")?.addEventListener("click", clearHeatmap);
  document.getElementById("btnMakeContours")?.addEventListener("click", makeContours);
  document.getElementById("btnClearContours")?.addEventListener("click", clearContours);
  document.getElementById("btnDrawDistances")?.addEventListener("click", toggleDistanceMode);
  document.getElementById("btnCluster")?.addEventListener("click", toggleClusterMode);
  document.getElementById("btnFixDrag")?.addEventListener("click", fixDragIssues);
}

/* ---------- FOOTER & DIEPTE ---------- */
function handleMouseMove(e) {
  detectPointerDrag(e);
  pendingMouseLatLng = e?.latlng || null;
  if (mouseMoveFrame) return;
  mouseMoveFrame = requestAnimationFrame(() => {
    mouseMoveFrame = null;
    updateMouseHover(pendingMouseLatLng);
  });
}

function updateMouseHover(latlng) {
  if (!map) return;
  const lat = latlng?.lat;
  const lng = latlng?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (depthTooltip && map.hasLayer(depthTooltip)) {
      depthTooltip.remove();
    }
    updatePlacementPreview(null);
    setFooterInfo({ depth: `| ${t("footer_depth", "Diepte")}: –` });
    return;
  }
  updatePlacementPreview(latlng);
  if (!depthTooltip) {
    depthTooltip = L.tooltip({
      permanent: false,
      className: "depth-tip",
      direction: "top"
    });
  }
  setFooterInfo({ mouse: `| ${t("label_lat", "Lat")}: ${lat.toFixed(5)} ${t("label_lon", "Lon")}: ${lng.toFixed(5)}` });

  depthTooltip.setLatLng([lat, lng]);
  if (!map.hasLayer(depthTooltip)) {
    depthTooltip.addTo(map);
  }

  const info = interpolateDepthAt(lat, lng, state.imports, {
    maxNeighbors: 25,
    cutoff: 1200,
    power: 2
  });
  if (info) {
    const { value, distance, count } = info;
    setFooterInfo({ depth: `| ${t("footer_depth", "Diepte")}: ${value.toFixed(1)}m @ ${Math.round(distance)}m` });
    depthTooltip.setContent(`${t("footer_depth", "Diepte")}: ${value.toFixed(1)}m<br><small>${t("detect_points", "Punten")}: ${count}</small>`);
    return;
  }

  const fallbackWater = findNearestWater(lat, lng);
  if (fallbackWater) {
    const stats = getWaterStats(fallbackWater);
    if (stats && Number.isFinite(stats.avg)) {
      const avg = stats.avg.toFixed(1);
      const waterName = fallbackWater.name || t("label_water", "Water");
      setFooterInfo({
        depth: `| ${t("footer_depth", "Diepte")}: ${avg}m (${waterName})`
      });
      depthTooltip.setContent(
        `${t("footer_depth", "Diepte")}: ${avg}m` +
          `<br><small>${t("label_water", "Water")}: ${waterName}</small>`
      );
      return;
    }
  }

  setFooterInfo({ depth: `| ${t("footer_depth", "Diepte")}: –` });
  depthTooltip.setContent(`${t("footer_depth", "Diepte")}: –`);
}

/* ---------- PICK / CLICK MODES ---------- */

function clearPlacementPreview() {
  if (placementTooltip) {
    map.removeLayer(placementTooltip);
    placementTooltip = null;
  }
  placementBase = null;
  placementMode = null;
}

function updatePlacementPreview(latlng) {
  try {
    if (!map) return;
    if (!latlng || clickMode === "none") {
      clearPlacementPreview();
      return;
    }

    const lat = latlng?.lat;
    const lng = latlng?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      clearPlacementPreview();
      return;
    }

    let reference = null;
    if (clickMode === "stek") {
      reference = findNearestWater(lat, lng);
    } else if (clickMode === "rig") {
      reference = findNearestStek(lat, lng);
    } else {
      clearPlacementPreview();
      return;
    }

    const refLat = reference?.lat;
    const refLng = reference?.lng;
    if (!Number.isFinite(refLat) || !Number.isFinite(refLng)) {
      clearPlacementPreview();
      return;
    }

    let distance;
    try {
      distance = map.distance([refLat, refLng], [lat, lng]);
    } catch (_err) {
      clearPlacementPreview();
      return;
    }
    if (!Number.isFinite(distance)) {
      clearPlacementPreview();
      return;
    }

    const labelKey = clickMode === "stek" ? "preview_stek_distance" : "preview_rig_distance";
    const rounded = Math.round(distance);
    const text = t(labelKey, clickMode === "stek" ? "Afstand tot water: {distance} m" : "Distance to spot: {distance} m")
      .replace("{distance}", String(rounded));
    const nameLine = escapeHtml(reference.name || reference.id || "");

    if (!placementTooltip) {
      placementTooltip = L.tooltip({
        permanent: false,
        direction: "top",
        className: "placement-tip",
        opacity: 0.9
      }).addTo(map);
    }

    const label = nameLine ? `${text}<br><small>${nameLine}</small>` : text;
    placementTooltip.setLatLng([lat, lng]);
    placementTooltip.setContent(label);

    placementBase = reference;
    placementMode = clickMode;
  } catch (_err) {
    clearPlacementPreview();
  }
}

function findNearestWater(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  (state.waters || []).forEach(water => {
    if (!Number.isFinite(water?.lat) || !Number.isFinite(water?.lng)) return;
    const dist = map.distance([lat, lng], [water.lat, water.lng]);
    if (!Number.isFinite(dist)) return;
    if (dist < bestDist) {
      best = water;
      bestDist = dist;
    }
  });
  return best;
}

function findNearestStek(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  (state.stekken || []).forEach(stek => {
    if (!Number.isFinite(stek?.lat) || !Number.isFinite(stek?.lng)) return;
    const dist = map.distance([lat, lng], [stek.lat, stek.lng]);
    if (!Number.isFinite(dist)) return;
    if (dist < bestDist) {
      best = stek;
      bestDist = dist;
    }
  });
  return best;
}

function resolveMarkerReference(item, type) {
  if (!item || !type) return null;
  if (type === "stek") {
    const ref = item.waterId || item.water_id;
    if (ref) {
      const water = findWaterById(ref);
      if (water) return water;
    }
    if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
      return findNearestWater(item.lat, item.lng);
    }
    return null;
  }
  if (type === "rig") {
    const stekRef = item.stekId || item.stek_id;
    if (stekRef) {
      const stek = findStekById(stekRef);
      if (stek) return stek;
    }
    if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
      return findNearestStek(item.lat, item.lng);
    }
    return null;
  }
  return null;
}

function startMarkerDistancePreview(marker, item, type, initialLatLng = null) {
  if (!map) return;
  const reference = resolveMarkerReference(item, type);
  if (!reference || !Number.isFinite(reference.lat) || !Number.isFinite(reference.lng)) {
    stopMarkerDistancePreview();
    return;
  }
  dragDistanceContext = { marker, reference, type };
  const startPoint = initialLatLng || (marker?.getLatLng ? marker.getLatLng() : null);
  if (!startPoint || !Number.isFinite(startPoint.lat) || !Number.isFinite(startPoint.lng)) {
    stopMarkerDistancePreview();
    return;
  }
  const color = type === "rig" ? "#ab47bc" : "#1e88e5";
  if (!dragDistanceTooltip) {
    dragDistanceTooltip = L.tooltip({
      permanent: false,
      direction: "top",
      className: "placement-tip",
      opacity: 0.9
    });
  }
  if (!dragDistanceLine) {
    dragDistanceLine = L.polyline([], {
      color,
      weight: 2,
      opacity: 0.8,
      pane: "overlayPane",
      className: "drag-distance-line"
    });
    dragDistanceLine.addTo(map);
  } else {
    dragDistanceLine.setStyle({ color });
    if (!map.hasLayer(dragDistanceLine)) dragDistanceLine.addTo(map);
  }
  dragDistanceLine.setLatLngs([
    [reference.lat, reference.lng],
    [startPoint.lat, startPoint.lng]
  ]);
  dragDistanceTooltip.setLatLng([startPoint.lat, startPoint.lng]);
  if (!map.hasLayer(dragDistanceTooltip)) {
    dragDistanceTooltip.addTo(map);
  }
  updateMarkerDistancePreview(startPoint);
  }

function updateMarkerDistancePreview(latlng) {
  if (!map || !dragDistanceTooltip || !dragDistanceContext || !latlng) return;
  if (!Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return;
  const { reference, type } = dragDistanceContext;
  if (!reference || !Number.isFinite(reference.lat) || !Number.isFinite(reference.lng)) return;
  const distance = map.distance([reference.lat, reference.lng], [latlng.lat, latlng.lng]);
  if (!Number.isFinite(distance)) return;
  const labelKey = type === "rig" ? "preview_rig_distance" : "preview_stek_distance";
  const fallback = type === "rig" ? "Afstand tot stek: {distance} m" : "Afstand tot water: {distance} m";
  const rounded = Math.round(distance);
  const text = t(labelKey, fallback).replace("{distance}", String(rounded));
  const nameLine = escapeHtml(reference.name || reference.id || "");
  const depthInfo = interpolateDepthAt(latlng.lat, latlng.lng, state.imports, {
    maxNeighbors: 25,
    cutoff: 1200,
    power: 2
  });
  const depthLine = depthInfo && Number.isFinite(depthInfo.value)
    ? `${t("footer_depth", "Diepte")}: ${depthInfo.value.toFixed(1)} m`
    : "";
  const metaLine = [nameLine, depthLine].filter(Boolean).join(" • ");
  const label = metaLine ? `${text}<br><small>${metaLine}</small>` : text;
  if (dragDistanceLine) {
    dragDistanceLine.setLatLngs([
      [reference.lat, reference.lng],
      [latlng.lat, latlng.lng]
    ]);
  }
  dragDistanceTooltip.setLatLng([latlng.lat, latlng.lng]);
  dragDistanceTooltip.setContent(label);
}

function stopMarkerDistancePreview() {
  dragDistanceContext = null;
  if (dragDistanceLine) {
    map.removeLayer(dragDistanceLine);
    dragDistanceLine = null;
  }
  if (dragDistanceTooltip) {
    map.removeLayer(dragDistanceTooltip);
    dragDistanceTooltip = null;
  }
}

function handleMapClick(e) {
  if (consumeClickSuppression()) {
    return;
  }
  if (pickResolver) {
    const resolver = pickResolver;
    pickResolver = null;
    map.getContainer().classList.remove("map-pick-active");
    resolver(e.latlng);
    setStatus(t("status_pick_done", "Kaartselectie voltooid"), "ok");
    return;
  }

  if (drawWaterActive) {
    addWaterDrawPoint(e.latlng);
    return;
  }

  if (distanceMode) {
    addDistancePoint(e.latlng);
    return;
  }

  if (clickMode !== "none") {
    clearPlacementPreview();
    document.dispatchEvent(
      new CustomEvent("vislok:map-new-spot", {
        detail: {
          type: clickMode,
          lat: e.latlng.lat,
          lng: e.latlng.lng
        }
      })
    );
  }
}

function handleMapDoubleClick(e) {
  if (!drawWaterActive) return;
  L.DomEvent.stop(e);
  if (drawWaterPoints.length < 3) {
    setStatus(t("status_draw_water_need_points", "Minimaal drie punten nodig"), "error");
    return;
  }
  document.dispatchEvent(new Event("vislok:draw-water-finish"));
}

export function requestLocationPick(label = "punt") {
  return new Promise(resolve => {
    if (clickMode !== "none") setClickMode("none");
    pickResolver = resolve;
    map.getContainer().classList.add("map-pick-active");
    setStatus(t("status_pick", "Klik op de kaart om") + ` ${label}`, "info");
  });
}

export function setClickMode(mode = "none") {
  clickMode = mode;
  const container = document.getElementById("mapHints");
  if (mode === "none") {
    clearPlacementPreview();
    map.getContainer().classList.remove("map-pick-active");
    if (container) {
      container.classList.remove("error");
      container.classList.add("panel-note");
      container.textContent = t("hint_click_modes", "Gebruik klikmodus om snel punten toe te voegen. Sleep markers om hun positie te wijzigen.");
    }
    setStatus(t("status_mode_clear", "Klikmodus beëindigd"), "ok");
  } else {
    clearPlacementPreview();
    map.getContainer().classList.add("map-pick-active");
    if (container) {
      container.classList.add("panel-note");
      container.textContent = t("status_mode_active", "Klik op de kaart om een item te plaatsen.");
    }
    setStatus(t("status_mode_active", "Klik op de kaart om een item te plaatsen."), "info");
  }
}

export function getClickMode() {
  return clickMode;
}

function addWaterDrawPoint(latlng) {
  if (!drawWaterActive || !latlng) return;
  drawWaterPoints.push(latlng);
  if (drawWaterLayer) {
    map.removeLayer(drawWaterLayer);
    drawWaterLayer = null;
  }
  if (drawWaterPoints.length === 1) {
    drawWaterLayer = L.circleMarker(latlng, {
      radius: 5,
      color: "#00e5ff",
      weight: 2,
      fillOpacity: 0.5
    }).addTo(map);
  } else if (drawWaterPoints.length === 2) {
    drawWaterLayer = L.polyline(drawWaterPoints, {
      color: "#00e5ff",
      weight: 2,
      dashArray: "4 3"
    }).addTo(map);
  } else {
    drawWaterLayer = L.polygon(drawWaterPoints, {
      color: "#00e5ff",
      weight: 2,
      fillOpacity: 0.25
    }).addTo(map);
  }
  setStatus(
    t("status_draw_water_point", "Punt toegevoegd ({count})").replace(
      "{count}",
      drawWaterPoints.length
    ),
    "info"
  );
}

export function startWaterDrawing() {
  if (!map) return false;
  cancelWaterDrawing(true);
  setClickMode("none");
  drawWaterActive = true;
  drawWaterPoints = [];
  if (map.doubleClickZoom) {
    doubleClickWasEnabled = map.doubleClickZoom.enabled();
    map.doubleClickZoom.disable();
  }
  map.getContainer().classList.add("map-draw-water");
  setStatus(t("status_draw_water_start", "Klik punten op de kaart om water te tekenen"), "info");
  return true;
}

export function finishWaterDrawing() {
  if (!drawWaterActive) return false;
  if (drawWaterPoints.length < 3) {
    return false;
  }
  const turfLibLocal = window.turf;
  let polygon = null;
  const coords = drawWaterPoints.map(p => [p.lng, p.lat]);
  if (turfLibLocal?.polygon) {
    try {
      polygon = turfLibLocal.polygon([[...coords, coords[0]]]);
    } catch (err) {
      console.warn("Handmatige polygon creatie mislukt", err);
    }
  }
  if (!polygon) {
    polygon = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[...coords, coords[0]]]
      }
    };
  }
  const stats = summarizePolygonFeatures([polygon], polygon);
  stats.count = drawWaterPoints.length;
  currentDetection = {
    points: drawWaterPoints.map(p => ({ lat: p.lat, lng: p.lng })),
    center: stats.center,
    radius: null,
    polygon,
    stats,
    kind: "manual",
    nameSuggestion: t("detect_manual_name", "Handmatig water")
  };
  renderDetection();
  setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: ${stats.count}` });
  setStatus(t("status_draw_water_done", "Handmatig water geselecteerd"), "ok");
  document.dispatchEvent(new CustomEvent("vislok:detection", { detail: currentDetection }));
  cancelWaterDrawing(true);
  return true;
}

export function cancelWaterDrawing(silent = false) {
  if (drawWaterLayer) {
    map.removeLayer(drawWaterLayer);
    drawWaterLayer = null;
  }
  drawWaterPoints = [];
  if (drawWaterActive) {
    map.getContainer().classList.remove("map-draw-water");
  }
  if (map?.doubleClickZoom && doubleClickWasEnabled) {
    map.doubleClickZoom.enable();
  }
  doubleClickWasEnabled = true;
  const wasActive = drawWaterActive;
  drawWaterActive = false;
  if (!silent && wasActive) {
    setStatus(t("status_draw_water_cancel", "Tekenen geannuleerd"), "warn");
  }
  return wasActive;
}

/* ---------- OSM-WATERDETECTIE ---------- */
export function detectOSMWater() {
  setStatus(t("status_osm_fetch", "Detectie van OSM-water gestart..."));
  if (!map) {
    setStatus(t("status_osm_error", "Fout bij waterdetectie"), "error");
    return;
  }

  let areaBounds;
  try {
    areaBounds = deriveOSMBounds();
  } catch (err) {
    console.error(err);
    setStatus(t("status_osm_error", "Fout bij waterdetectie"), "error");
    return;
  }

  const bbox = [
    areaBounds.getSouth(),
    areaBounds.getWest(),
    areaBounds.getNorth(),
    areaBounds.getEast()
  ]
    .map(v => v.toFixed(6))
    .join(",");

  const query = `
  [out:json][timeout:30];
  (
    way["natural"="water"](${bbox});
    relation["natural"="water"](${bbox});
    way["waterway"="riverbank"](${bbox});
    relation["waterway"="riverbank"](${bbox});
    way["water"](${bbox});
    relation["water"](${bbox});
  );
  out body; >; out skel qt;`;

  requestOverpass(query)
    .then(data => {
      const rawFeatures = overpassToGeoJSON(data);
      const clipped = clipFeaturesToBounds(rawFeatures, areaBounds);
      if (!clipped.length) {
        clearDetection();
        setStatus(t("status_osm_empty", "Geen OSM-water gevonden"), "error");
        return;
      }

      const merged = mergeTouchingPolygons(clipped);
      const combined = mergeToSinglePolygon(merged) || combineToMultiPolygon(merged);
      const polygonFeature =
        combined ||
        (merged.length
          ? { type: "FeatureCollection", features: [merged[0]] }
          : null);
      const stats = summarizePolygonFeatures(merged, combined);

      currentDetection = {
        points: [],
        center: stats.center,
        radius: null,
        polygon: polygonFeature,
        stats,
        kind: "osm",
        nameSuggestion: Array.isArray(stats.names) ? stats.names.find(Boolean) || null : null
      };

      renderDetection();
      setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: ${stats.count}` });
      setStatus(t("status_osm_done", "Waterlagen geladen") + ` (${stats.count})`, "ok");
      document.dispatchEvent(new CustomEvent("vislok:detection", { detail: currentDetection }));
    })
    .catch(err => {
      if (typeof err.overpassStatus === "number") {
        const msg = t(
          "status_osm_unavailable",
          "Overpass-API niet beschikbaar (status {status})"
        ).replace("{status}", String(err.overpassStatus));
        setStatus(msg, "error");
      } else {
        setStatus(t("status_osm_error", "Fout bij waterdetectie"), "error");
      }
      console.error(err);
    });
}

function deriveOSMBounds() {
  if (!map) {
    const center = Array.isArray(state.center)
      ? L.latLng(state.center[0], state.center[1])
      : L.latLng(state.center.lat, state.center.lng);
    return L.latLngBounds(center, center);
  }

  if (selectionCircle && map.hasLayer(selectionCircle)) {
    try {
      const center = selectionCircle.getLatLng();
      const radius = selectionCircle.getRadius();
      if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng) && Number.isFinite(radius)) {
        return boundsFromCircle(center, radius);
      }
    } catch (err) {
      console.warn("Selectiebereik kon niet worden bepaald", err);
    }
  }

  if (selectionMeta?.center && Number.isFinite(selectionMeta.center.lat) && Number.isFinite(selectionMeta.center.lng)) {
    const radius = Number.isFinite(selectionMeta.radius) ? selectionMeta.radius : 0;
    if (radius > 0) {
      return boundsFromCircle(selectionMeta.center, radius);
    }
  }

  return map.getBounds();
}

function requestOverpass(query, index = 0, lastError = null) {
  if (index >= OVERPASS_ENDPOINTS.length) {
    if (lastError) {
      return Promise.reject(lastError);
    }
    const fallbackError = new Error("Overpass request failed");
    fallbackError.overpassStatus = null;
    return Promise.reject(fallbackError);
  }

  const endpoint = OVERPASS_ENDPOINTS[index];

  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  })
    .then(response => {
      if (!response.ok) {
        const err = new Error(`Overpass status ${response.status}`);
        err.overpassStatus = response.status;
        err.overpassEndpoint = endpoint;
        throw err;
      }
      return response.json();
    })
    .catch(err => {
      const shouldRetry =
        index + 1 < OVERPASS_ENDPOINTS.length &&
        (err.overpassStatus === 429 ||
          err.overpassStatus === 502 ||
          err.overpassStatus === 503 ||
          err.overpassStatus === 504 ||
          err.name === "TypeError");

      if (shouldRetry) {
        setStatus(
          t("status_osm_retry", "Overpass bezet, probeer alternatieve server..."),
          "warn"
        );
        return requestOverpass(query, index + 1, err);
      }

      err.overpassEndpoint = err.overpassEndpoint || endpoint;
      return Promise.reject(err);
    });
}

function boundsFromCircle(center, radiusMeters) {
  const earthRadiusLat = 111320; // meter per graad latitude
  const latOffset = radiusMeters / earthRadiusLat;
  const lonDenom = Math.max(Math.cos((center.lat * Math.PI) / 180) * earthRadiusLat, 1e-6);
  const lonOffset = radiusMeters / lonDenom;
  return L.latLngBounds(
    [center.lat - latOffset, center.lng - lonOffset],
    [center.lat + latOffset, center.lng + lonOffset]
  );
}

function overpassToGeoJSON(data) {
  const elements = data?.elements || [];
  const nodeMap = new Map();
  const wayMap = new Map();
  const features = [];

  for (const el of elements) {
    if (el.type === "node") {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
    if (el.type === "way") {
      wayMap.set(el.id, { nodes: el.nodes || [], tags: el.tags || {} });
    }
  }

  const turfLibLocal = window.turf;

  const getCoordsOfWay = way => {
    const coords = [];
    for (const nodeId of way.nodes) {
      const pt = nodeMap.get(nodeId);
      if (!pt) return null;
      coords.push(pt);
    }
    return coords;
  };

  const stitchRings = list => {
    const rings = [];
    const segs = list.map(a => a.slice());
    while (segs.length) {
      let ring = segs.shift();
      let loop = true;
      while (loop) {
        loop = false;
        for (let i = 0; i < segs.length; i += 1) {
          const seg = segs[i];
          const head = ring[0];
          const tail = ring[ring.length - 1];
          const segHead = seg[0];
          const segTail = seg[seg.length - 1];
          if (tail[0] === segHead[0] && tail[1] === segHead[1]) {
            ring = ring.concat(seg.slice(1));
            segs.splice(i, 1);
            loop = true;
            break;
          }
          if (tail[0] === segTail[0] && tail[1] === segTail[1]) {
            ring = ring.concat(seg.slice(0, -1).reverse());
            segs.splice(i, 1);
            loop = true;
            break;
          }
          if (head[0] === segTail[0] && head[1] === segTail[1]) {
            ring = seg.concat(ring.slice(1));
            segs.splice(i, 1);
            loop = true;
            break;
          }
          if (head[0] === segHead[0] && head[1] === segHead[1]) {
            ring = seg.slice(0, -1).reverse().concat(ring);
            segs.splice(i, 1);
            loop = true;
            break;
          }
        }
      }
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push(ring[0]);
      }
      if (ring.length >= 4) rings.push(ring);
    }
    return rings;
  };

  const relationToMultipolygon = rel => {
    const outers = [];
    const inners = [];
    for (const member of rel.members || []) {
      if (member.type !== "way") continue;
      const way = wayMap.get(member.ref);
      if (!way) continue;
      const coords = getCoordsOfWay(way);
      if (!coords) continue;
      (member.role === "inner" ? inners : outers).push(coords);
    }
    const stitchedOuters = stitchRings(outers);
    const stitchedInners = stitchRings(inners);
    if (!stitchedOuters.length) return null;
    const polys = stitchedOuters.map(o => [o]);
    if (turfLibLocal) {
      stitchedInners.forEach(inner => {
        let attached = false;
        for (let k = 0; k < polys.length; k += 1) {
          try {
            if (
              inner.length &&
              turfLibLocal.booleanPointInPolygon(turfLibLocal.point(inner[0]), {
                type: "Polygon",
                coordinates: polys[k]
              })
            ) {
              polys[k].push(inner);
              attached = true;
              break;
            }
          } catch (_) {
            // ignore
          }
        }
        if (!attached) polys.push([inner]);
      });
    } else {
      stitchedInners.forEach(inner => polys.push([inner]));
    }
    return polys.length === 1
      ? { type: "Polygon", coordinates: polys[0] }
      : { type: "MultiPolygon", coordinates: polys };
  };

  for (const el of elements) {
    if (el.type === "way") {
      const way = wayMap.get(el.id);
      if (!way) continue;
      const coords = getCoordsOfWay(way);
      if (!coords) continue;
      if (coords.length && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      if (coords.length >= 4) {
        features.push({
          type: "Feature",
          properties: { id: el.id, kind: "way", tags: way.tags },
          geometry: { type: "Polygon", coordinates: [coords] }
        });
      }
    }
  }

  for (const el of elements) {
    if (el.type === "relation" && el.tags && (el.tags.type === "multipolygon" || el.tags.type === "boundary")) {
      const geom = relationToMultipolygon(el);
      if (geom) {
        features.push({
          type: "Feature",
          properties: { id: el.id, kind: "relation", tags: el.tags },
          geometry: geom
        });
      }
    }
  }

  return features;
}

function clipFeaturesToBounds(features, bounds) {
  const turfLibLocal = window.turf;
  if (!turfLibLocal) return features.slice();
  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  const clipped = [];
  for (const feature of features) {
    if (!feature?.geometry) continue;
    if (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") continue;
    try {
      const clippedFeature = turfLibLocal.bboxClip(feature, bbox);
      if (
        clippedFeature?.geometry &&
        Array.isArray(clippedFeature.geometry.coordinates) &&
        clippedFeature.geometry.coordinates.length
      ) {
        clipped.push(clippedFeature);
      }
    } catch (err) {
      console.warn("Clip mislukt", err);
    }
  }
  return clipped;
}

function mergeTouchingPolygons(features) {
  const turfLibLocal = window.turf;
  if (!turfLibLocal) return features.slice();
  const list = features.slice();
  let changed = true;
  while (changed && list.length > 1) {
    changed = false;
    outer: for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const A = list[i];
        const B = list[j];
        if (!bboxIntersects(A, B, turfLibLocal)) continue;
        if (!featuresTouchOrOverlap(A, B, turfLibLocal)) continue;
        try {
          const union = turfLibLocal.union(A, B);
          if (union) {
            union.properties = { ...(A.properties || {}), ...(B.properties || {}) };
            list.splice(j, 1);
            list.splice(i, 1, union);
            changed = true;
            break outer;
          }
        } catch (err) {
          console.warn("Union mislukt", err);
        }
      }
    }
  }
  return list;
}

function mergeToSinglePolygon(features) {
  const turfLibLocal = window.turf;
  if (!turfLibLocal || !features?.length) return null;
  let result = features[0];
  for (let i = 1; i < features.length; i += 1) {
    try {
      const union = turfLibLocal.union(result, features[i]);
      if (union) {
        union.properties = { ...(result.properties || {}), ...(features[i].properties || {}) };
        result = union;
      }
    } catch (err) {
      console.warn("Union mislukt", err);
    }
  }
  return result;
}

function combineToMultiPolygon(features) {
  const turfLibLocal = window.turf;
  if (!turfLibLocal || !features?.length) return null;
  try {
    const collection = turfLibLocal.featureCollection(features);
    const combined = turfLibLocal.combine(collection);
    const mergedFeatures = combined?.features || [];
    if (!mergedFeatures.length) return null;
    const merged = mergedFeatures[0];
    merged.properties = features.reduce(
      (acc, feat) => ({ ...acc, ...(feat.properties || {}) }),
      {}
    );
    return merged;
  } catch (err) {
    console.warn("Combine naar MultiPolygon mislukt", err);
    return null;
  }

  const bbox = [
    areaBounds.getSouth(),
    areaBounds.getWest(),
    areaBounds.getNorth(),
    areaBounds.getEast()
  ]
    .map(v => v.toFixed(6))
    .join(",");

  const query = `
  [out:json][timeout:30];
  (
    way["natural"="water"](${bbox});
    relation["natural"="water"](${bbox});
    way["waterway"="riverbank"](${bbox});
    relation["waterway"="riverbank"](${bbox});
    way["water"](${bbox});
    relation["water"](${bbox});
  );
  out body; >; out skel qt;`;

  requestOverpass(query)
    .then(data => {
      const rawFeatures = overpassToGeoJSON(data);
      const clipped = clipFeaturesToBounds(rawFeatures, areaBounds);
      if (!clipped.length) {
        clearDetection();
        setStatus(t("status_osm_empty", "Geen OSM-water gevonden"), "error");
        return;
      }

      const merged = mergeTouchingPolygons(clipped);
      const combined = mergeToSinglePolygon(merged) || combineToMultiPolygon(merged);
      const polygonFeature =
        combined ||
        (merged.length
          ? { type: "FeatureCollection", features: [merged[0]] }
          : null);
      const stats = summarizePolygonFeatures(merged, combined);

      currentDetection = {
        points: [],
        center: stats.center,
        radius: null,
        polygon: polygonFeature,
        stats,
        kind: "osm",
        nameSuggestion: Array.isArray(stats.names) ? stats.names.find(Boolean) || null : null
      };

      renderDetection();
      setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: ${stats.count}` });
      setStatus(t("status_osm_done", "Waterlagen geladen") + ` (${stats.count})`, "ok");
      document.dispatchEvent(new CustomEvent("vislok:detection", { detail: currentDetection }));
    })
    .catch(err => {
      if (typeof err.overpassStatus === "number") {
        const msg = t(
          "status_osm_unavailable",
          "Overpass-API niet beschikbaar (status {status})"
        ).replace("{status}", String(err.overpassStatus));
        setStatus(msg, "error");
      } else {
        setStatus(t("status_osm_error", "Fout bij waterdetectie"), "error");
      }
      console.error(err);
    });
}

function summarizePolygonFeatures(features, combinedFeature = null) {
  const turfLibLocal = window.turf;
  const count = features?.length || 0;
  let area = 0;
  let perimeter = 0;
  let center = null;
  const nameSet = new Set();
  const pushName = value => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) nameSet.add(trimmed);
    }
  };
  const reference = combinedFeature || (count ? mergeToSinglePolygon(features) : null);

  (features || []).forEach(feature => {
    const props = feature?.properties || {};
    pushName(props.name);
    if (props.tags) {
      pushName(props.tags.name);
      if (props.tags["name:en"]) pushName(props.tags["name:en"]);
    }
  });

  if (combinedFeature?.properties) {
    const props = combinedFeature.properties;
    pushName(props.name);
    if (props.tags) {
      pushName(props.tags.name);
      if (props.tags["name:en"]) pushName(props.tags["name:en"]);
    }
  }

  if (turfLibLocal && reference) {
    try {
      area = turfLibLocal.area(reference);
    } catch (err) {
      console.warn("Area berekening mislukt", err);
    }
    try {
      const lines = turfLibLocal.polygonToLine(reference);
      perimeter = turfLibLocal.length(lines, { units: "kilometers" });
    } catch (err) {
      console.warn("Perimeter berekening mislukt", err);
    }
    try {
      const c = turfLibLocal.center(reference);
      const coords = c?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        center = { lat: coords[1], lng: coords[0] };
      }
    } catch (err) {
      console.warn("Center berekening mislukt", err);
    }
  }

  if (!center) {
    if (map?.getCenter) {
      const c = map.getCenter();
      center = { lat: c.lat, lng: c.lng };
    } else if (Array.isArray(state.center) && state.center.length >= 2) {
      center = { lat: state.center[0], lng: state.center[1] };
    }
  }

  return { count, area, perimeter, center, names: Array.from(nameSet) };
}

  function bboxIntersects(A, B, lib) {
    try {
      const bbA = lib.bbox(A);
      const bbB = lib.bbox(B);
      return !(bbA[2] < bbB[0] || bbB[2] < bbA[0] || bbA[3] < bbB[1] || bbB[3] < bbA[1]);
    } catch (err) {
      console.warn("BBox berekening mislukt", err);
      return false;
    }
  }

  function featuresTouchOrOverlap(A, B, lib) {
    try {
      if (lib.booleanIntersects(A, B)) return true;
      const buffered = lib.buffer(A, 0.01, { units: "kilometers" });
      return lib.booleanIntersects(buffered, B);
    } catch (err) {
      console.warn("Intersect berekening mislukt", err);
      return false;
    }
  }

/* ---------- DETECTIE ---------- */
export function detectViewport() {
  const bounds = map.getBounds();
  const points = (state.imports || []).filter(p =>
    p.lat > bounds.getSouth() &&
    p.lat < bounds.getNorth() &&
    p.lng > bounds.getWest() &&
    p.lng < bounds.getEast()
  );
  runDetection(points, bounds.getCenter());
}

export function detectSelection() {
  setStatus(t("status_detect_click", "Klik op de kaart om selectie te plaatsen"), "info");
  map.once("click", e => {
    if (selectionCircle) map.removeLayer(selectionCircle);
    selectionCircle = L.circle(e.latlng, {
      radius: state.settings.detectionRadius,
      color: "#ff8800",
      weight: 1,
      fillOpacity: 0.15
    }).addTo(map);

    selectionMeta = {
      center: e.latlng,
      radius: state.settings.detectionRadius
    };

    selectionCircle.on("remove", () => {
      selectionMeta = null;
    });

    const found = (state.imports || []).filter(
      p => map.distance([p.lat, p.lng], e.latlng) <= state.settings.detectionRadius
    );
    runDetection(found, e.latlng, state.settings.detectionRadius);
  });
}

function rerunDetection() {
  if (!currentDetection) return;
  runDetection(currentDetection.points, currentDetection.center, currentDetection.radius, true);
}

function runDetection(points, center, radius = null, silent = false) {
  if (!points?.length) {
    clearDetection();
    setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: 0` });
    if (!silent) setStatus(t("status_detect_none", "Geen punten gevonden"), "error");
    return;
  }

  const polygon = buildDetectionPolygon(points);
  const stats = summarizePoints(points, polygon);
  currentDetection = {
    points,
    center,
    radius,
    polygon,
    stats,
    kind: "bathy",
    nameSuggestion: null
  };
  if (radius && center) {
    selectionMeta = {
      center,
      radius
    };
  }
  state.lastDetection = {
    timestamp: Date.now(),
    stats
  };
  saveState();

  renderDetection();
  setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: ${points.length}` });
  if (!silent) setStatus(t("status_detect_ok", "Detectie voltooid") + ` (${points.length})`, "ok");
  document.dispatchEvent(new CustomEvent("vislok:detection", { detail: currentDetection }));
}

function buildDetectionPolygon(points) {
  if (!points || points.length < 3) return null;
  const fc = turf.featureCollection(points.map(p => turf.point([p.lng, p.lat])));
  const maxEdgeKm = Math.max(0.1, (state.settings.maxEdge || 60) / 1000);
  return (
    turf.concave(fc, { maxEdge: maxEdgeKm, units: "kilometers" }) ||
    turf.convex(fc)
  );
}

function summarizePoints(points, polygon) {
  const depths = points
    .map(p => p.val ?? p.depth)
    .filter(val => Number.isFinite(val));
  const min = depths.length ? Math.min(...depths) : null;
  const max = depths.length ? Math.max(...depths) : null;
  const avg = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : null;
  let area = null;
  let perimeter = null;
  if (polygon) {
    area = turf.area(polygon);
    perimeter = turf.length(turf.polygonToLine(polygon), { units: "kilometers" });
  }
  return {
    count: points.length,
    min,
    max,
    avg,
    area,
    perimeter
  };
}

function renderDetection() {
  if (detectionLayer) {
    map.removeLayer(detectionLayer);
  }
  if (!currentDetection?.polygon) {
    detectionLayer = null;
    return;
  }
  const baseStyle =
    currentDetection?.kind === "osm"
      ? { color: "#00aaff", weight: 2, fillOpacity: 0.2 }
      : { color: "#ff6f00", weight: 2, dashArray: "6 4", fillOpacity: 0.1 };
  detectionLayer = L.geoJSON(currentDetection.polygon, { style: baseStyle }).addTo(map);
}

export function clearDetection() {
  if (detectionLayer) {
    map.removeLayer(detectionLayer);
    detectionLayer = null;
  }
  currentDetection = null;
  setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: –` });
  document.dispatchEvent(new Event("vislok:detection-clear"));
}

export function clearSelection() {
  if (selectionCircle) {
    map.removeLayer(selectionCircle);
    selectionCircle = null;
  }
  selectionMeta = null;
  cancelWaterDrawing(true);
  clearDetection();
  setStatus(t("status_detect_clear", "Selectie gewist"), "ok");
}

export function getCurrentDetection() {
  return currentDetection;
}

/* ---------- HEATMAP ---------- */
function updateHeatOptions() {
  if (!heatLayer) return;
  const opts = {
    radius: state.settings.heatmapRadius,
    blur: state.settings.heatmapBlur
  };
  if (heatLayer.setOptions) {
    heatLayer.setOptions(opts);
  } else {
    heatLayer.options = { ...heatLayer.options, ...opts };
  }
}

export function showHeatmap(setStatusMessage = true) {
  const points = (state.imports || [])
    .map(p => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const raw = p.val ?? p.depth ?? 0;
      let value = raw;
      if (state.settings.heatmapClamp) {
        value = Math.min(state.settings.heatmapMax, Math.max(state.settings.heatmapMin, value));
      }
      const range = Math.max(0.001, state.settings.heatmapMax - state.settings.heatmapMin);
      let weight = (value - state.settings.heatmapMin) / range;
      weight = Math.min(1, Math.max(0, weight));
      if (state.settings.heatmapInvert) weight = 1 - weight;
      weight = Math.max(0.05, weight);
      return [lat, lng, weight];
    })
    .filter(Boolean);

  if (!points.length) {
    if (setStatusMessage) setStatus(t("status_heat_empty", "Geen data voor heatmap"), "error");
    return;
  }

  heatLayer.setLatLngs(points);
  createLegend();
  if (setStatusMessage) setStatus(t("status_heat_ok", "Heatmap bijgewerkt"), "ok");
}

export function clearHeatmap(setStatusMessage = true) {
  heatLayer.setLatLngs([]);
  if (legendControl) {
    legendControl.remove();
    legendControl = null;
  }
  if (setStatusMessage) {
    setStatus(t("status_heat_cleared", "Heatmap gewist"), "ok");
  }
}

/* ---------- CONTOUREN ---------- */
export function makeContours() {
  try {
    if (!state.imports?.length) {
      return setStatus(t("status_contour_empty", "Geen importpunten voor contouren"), "error");
    }

    const turfLibLocal = window.turf;
    if (!turfLibLocal) {
      return setStatus(t("status_contour_noturf", "Turf.js niet beschikbaar"), "error");
    }

    let minDepth = Infinity;
    let maxDepth = -Infinity;
    const features = [];

    state.imports.forEach(point => {
      const depth = Number(point?.val ?? point?.depth);
      if (!Number.isFinite(depth)) return;
      if (depth < minDepth) minDepth = depth;
      if (depth > maxDepth) maxDepth = depth;
      features.push(turfLibLocal.point([point.lng, point.lat], { depth }));
    });

    if (!features.length || !Number.isFinite(minDepth) || !Number.isFinite(maxDepth)) {
      return setStatus(t("status_contour_norange", "Onvoldoende dieptegegevens voor contouren"), "error");
    }

    let rangeMin = minDepth;
    let rangeMax = maxDepth;

    if (state.settings?.heatmapClamp) {
      const clampMin = Number(state.settings.heatmapMin);
      const clampMax = Number(state.settings.heatmapMax);
      if (Number.isFinite(clampMin) && Number.isFinite(clampMax) && clampMin < clampMax) {
        rangeMin = clampMin;
        rangeMax = clampMax;
      }
    }

    if (!(rangeMax > rangeMin)) {
      return setStatus(t("status_contour_flat", "Geen variatie in dieptewaarden"), "error");
    }

    const featureCollection = turfLibLocal.featureCollection(features);
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const diagonalMeters = map.distance(sw, ne) || 1000;
    const cellMeters = Math.max(20, diagonalMeters / 60);
    const cellKm = cellMeters / 1000;

    const grid = turfLibLocal.interpolate(featureCollection, cellKm, {
      gridType: "points",
      property: "depth",
      units: "kilometers",
      bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
    });

    const stepCount = Math.min(15, Math.max(4, Math.round((rangeMax - rangeMin) / Math.max(0.1, cellKm * 1.5))));
    const step = (rangeMax - rangeMin) / stepCount;
    const breaks = [];
    for (let value = rangeMin; value <= rangeMax + step / 2; value += step) {
      const fixed = Number(value.toFixed(2));
      if (breaks.length === 0 || breaks[breaks.length - 1] < fixed) {
        breaks.push(fixed);
      }
    }

    if (breaks.length < 2) {
      return setStatus(t("status_contour_breaks", "Kon contour-niveaus niet bepalen"), "error");
    }

    const contours = turfLibLocal.isolines(grid, breaks, { zProperty: "depth" });

    if (contourLayer) {
      contourLayer.clearLayers();
      L.geoJSON(contours, { style: { color: "#ff8800", weight: 1 } }).addTo(contourLayer);
    } else {
      L.geoJSON(contours, { style: { color: "#ff8800", weight: 1 } }).addTo(map);
    }

    setStatus(t("status_contour_ok", "Contouren gegenereerd"), "ok");
    document.dispatchEvent(
      new CustomEvent("vislok:bathy-stats", {
        detail: summarizePoints(state.imports, null)
      })
    );
  } catch (err) {
    console.error(err);
    setStatus(t("status_contour_err", "Fout bij contouren"), "error");
  }
}

export function clearContours() {
  if (contourLayer) {
    contourLayer.clearLayers();
  }
  if (legendControl) {
    legendControl.remove();
    legendControl = null;
  }
  setStatus(t("status_contour_clear", "Contouren gewist"), "ok");
}

/* ---------- GPS ---------- */
let gpsWatch = null;

export function startGPS() {
  if (!navigator.geolocation) {
    setStatus(t("status_gps_no", "Geen GPS-ondersteuning"), "error");
    return;
  }
  setStatus(t("status_gps_start", "GPS starten..."));
  updateGpsBadge("active");
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
      // Update live depth feedback at the GPS coordinate so hover/drag tooling reflects movement.
      updateMouseHover({ lat: latitude, lng: longitude });
    },
    err => {
      setStatus(`${t("status_gps_error", "GPS-fout")}: ${err.message}`, "error");
      updateGpsBadge("error");
    },
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
  updateGpsBadge("idle");
  setStatus(t("status_gps_stop", "GPS gestopt"), "ok");
  state.gpsActive = false;
  saveState();
}

function updateGpsBadge(status) {
  const badge = document.getElementById("gpsStatus");
  if (!badge) return;
  badge.classList.remove("active", "error");
  if (status === "active") {
    badge.classList.add("active");
    badge.textContent = t("gps_active", "GPS aan");
  } else if (status === "error") {
    badge.classList.add("error");
    badge.textContent = t("gps_error", "GPS fout");
  } else {
    badge.textContent = t("gps_idle", "GPS uit");
  }
}

/* ---------- HEATMAP LEGENDA ---------- */
function createLegend() {
  if (legendControl) legendControl.remove();
  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = () => {
    const div = L.DomUtil.create("div", "legend inv");
    const min = state.settings.heatmapMin;
    const max = state.settings.heatmapMax;
    const avg = ((min + max) / 2).toFixed(1);
    div.innerHTML = `
      <h4>${t("legend_heat", "Heatmap intensiteit")}</h4>
      <div class="legend-row"><i style="background:#00f"></i> ${t("legend_heat_min", "Minimum")}: ${min}</div>
      <div class="legend-row"><i style="background:#0ff"></i> ${t("legend_heat_avg", "Gemiddeld")}: ${avg}</div>
      <div class="legend-row"><i style="background:#f00"></i> ${t("legend_heat_max", "Maximum")}: ${max}</div>
    `;
    return div;
  };
  legendControl.addTo(map);
}

/* ---------- CLUSTER / FIX ---------- */
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
  setStatus(
    state.settings.cluster ? t("status_cluster_on", "Clustering ingeschakeld") : t("status_cluster_off", "Clustering uitgeschakeld"),
    "ok"
  );
}

document.addEventListener("vislok:language", () => {
  if (!map) return;
  createLayerControl();
  setFooterInfo({ zoom: `| ${t("footer_zoom", "Zoom")}: ${map.getZoom()}` });
  updateGpsBadge(state.gpsActive ? "active" : "idle");
  if (legendControl) {
    createLegend();
  }
});

function fixDragIssues() {
  resumeMapInteractions(true);
  map.invalidateSize();
  setStatus(t("status_map_fix", "Kaartinteractie hersteld"), "ok");
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
    setStatus(t("status_distance_off", "Afstandstool gedeactiveerd"), "ok");
  } else {
    setStatus(t("status_distance_on", "Klik op de kaart om punten te meten"), "info");
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
    setStatus(`${t("status_distance_total", "Totale afstand")}: ${(total / 1000).toFixed(2)} km`, "ok");
  } else {
    distanceLine = L.polyline(distancePoints, { color: "#00ffaa" }).addTo(map);
  }
}

/* ---------- DATA LAGEN ---------- */
export function refreshImportLayer() {
  importLayer.clearLayers();
  if (!map) return;
  if (!state.settings?.showImports) {
    return;
  }
  if (!state.imports?.length) {
    setFooterInfo({ detect: `| ${t("footer_detect", "Detectie")}: –` });
    return;
  }
  const bounds = map.getBounds();
  const visible = state.imports.filter(p => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return bounds.contains([lat, lng]);
  });
  if (!visible.length) {
    return;
  }
  visible.forEach(p => {
    L.circleMarker([p.lat, p.lng], {
      radius: 3,
      color: "#ffaa00",
      weight: 1,
      fillOpacity: 0.6
    })
      .bindPopup(`${t("footer_depth", "Diepte")}: ${(p.val ?? p.depth ?? 0).toFixed(1)} m`)
      .addTo(importLayer);
  });
}

export function refreshDataLayers() {
  waterLayer.clearLayers();
  stekLayer.clearLayers();
  rigLayer.clearLayers();
  clusterGroup.clearLayers();
  if (linkLayer) linkLayer.clearLayers();

  (state.waters || []).forEach(w => {
    if (!Number.isFinite(w?.lat) || !Number.isFinite(w?.lng)) return;
    const depthTooltip = buildWaterTooltip(w);
    let hasGeometry = false;

    if (w.polygon) {
      try {
        let polygonGeo = w.polygon;
        if (typeof polygonGeo === "string") {
          polygonGeo = JSON.parse(polygonGeo);
        }
        const polyLayer = L.geoJSON(polygonGeo, {
          style: () => ({
            color: "#42a5f5",
            weight: 2,
            fillOpacity: 0.15
          })
        }).addTo(waterLayer);
        if (depthTooltip) {
          polyLayer.bindTooltip(depthTooltip, { sticky: true, opacity: 0.9 });
        }
        hasGeometry = true;
      } catch (err) {
        console.warn("Kon waterpolygon niet tekenen", err);
      }
    }

    if (!hasGeometry) {
      const circle = L.circle([w.lat, w.lng], {
        radius: 25,
        color: "#42a5f5",
        weight: 1.5,
        fillOpacity: 0.15,
        interactive: Boolean(depthTooltip)
      }).addTo(waterLayer);
      if (depthTooltip) {
        circle.bindTooltip(depthTooltip, { sticky: true, opacity: 0.9 });
      }
    }
  });

  markerRegistry.stek.clear();
  markerRegistry.rig.clear();

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

  renderLinkLines();
}

function createSpotMarker(item, type) {
  if (!item.lat || !item.lng) return null;
  const marker = L.marker([item.lat, item.lng], {
    draggable: true,
    icon: createSpotIcon(type),
    autoPan: true,
    autoPanPadding: [80, 80]
  });
  registerMarkerReference(marker, item, type);
  attachMarkerHandlers(marker, item, type);
  return marker;
}

function registerMarkerReference(marker, item, type) {
  if (!marker || !item || !item.id || !markerRegistry[type]) return;
  markerRegistry[type].set(String(item.id), marker);
}

function getMarkerReference(type, id) {
  if (!type || !id || !markerRegistry[type]) return null;
  return markerRegistry[type].get(String(id)) || null;
}

function renderLinkLines() {
  if (!map || !linkLayer) return;
  linkLayer.clearLayers();

  const waterById = new Map();
  (state.waters || []).forEach(water => {
    if (!Number.isFinite(water?.lat) || !Number.isFinite(water?.lng)) return;
    waterById.set(water.id, water);
  });

  const stekById = new Map();
  (state.stekken || []).forEach(stek => {
    if (!Number.isFinite(stek?.lat) || !Number.isFinite(stek?.lng)) return;
    stekById.set(stek.id, stek);
  });

  (state.rigs || []).forEach(rig => {
    if (!Number.isFinite(rig?.lat) || !Number.isFinite(rig?.lng)) return;
    if (rig.stekId) {
      const parentStek = stekById.get(rig.stekId);
      if (parentStek) {
        drawLink(parentStek, rig, "#ab47bc", 0.7);
        return;
      }
    }
  });
}

function drawLink(source, target, color, opacity, dashed = false) {
  const start = [source.lat, source.lng];
  const end = [target.lat, target.lng];
  if (!Number.isFinite(start[0]) || !Number.isFinite(start[1]) || !Number.isFinite(end[0]) || !Number.isFinite(end[1])) {
    return;
  }
  const options = {
    color,
    weight: dashed ? 1.5 : 2,
    opacity: opacity ?? 0.75,
    pane: map.getPane("overlayPane"),
    className: dashed ? "link-line link-line--dashed" : "link-line"
  };
  if (dashed) {
    options.dashArray = "4 6";
  }
  L.polyline([start, end], options).addTo(linkLayer);
}

function ensureSpotPopup() {
  if (spotPopup) return spotPopup;
  spotPopup = L.popup({
    className: "spot-popup-wrapper",
    closeButton: true,
    autoClose: true,
    maxWidth: 260
  });
  return spotPopup;
}

function buildSpotPopupContent(item, type) {
  const title = escapeHtml(item.name || item.id || (type === "stek" ? t("default_stek", "Stek") : t("default_rig", "Rig")));
  const coords = Number.isFinite(item.lat) && Number.isFinite(item.lng)
    ? formatLatLng(item.lat, item.lng)
    : "";
  const labelRename = t("spot_popup_rename", "Hernoem");
  const labelDelete = t("spot_popup_delete", "Verwijderen");
  const labelCatch = t("action_add_catch", "Vangst");
  const actionButtons = [
    { action: "catch", label: labelCatch },
    { action: "rename", label: labelRename },
    { action: "delete", label: labelDelete }
  ];

  const buttonsHtml = actionButtons
    .map(btn =>
      `<button type="button" class="spot-popup__btn" data-spot-action="${btn.action}" data-spot-id="${escapeHtml(item.id)}" data-spot-type="${type}">${escapeHtml(btn.label)}</button>`
    )
    .join("");

  const subtitle = coords ? `<div class="spot-popup__meta">${escapeHtml(coords)}</div>` : "";
  return `<div class="spot-popup">` +
    `<div class="spot-popup__title">${title}</div>` +
    subtitle +
    `<div class="spot-popup__actions">${buttonsHtml}</div>` +
    `</div>`;
}

function showSpotPopup(marker, item, type) {
  if (!map || !marker || !item || !type) return;
  const popup = ensureSpotPopup();
  const latLng = marker.getLatLng();
  popup.setLatLng(latLng);
  popup.setContent(buildSpotPopupContent(item, type));
  popup.openOn(map);
  spotPopupData = { id: item.id, type, item };
}

function closeSpotPopup() {
  if (spotPopup) {
    map.closePopup(spotPopup);
  }
  spotPopupData = null;
}

function handleSpotPopupAction(e) {
  const btn = e.target.closest("[data-spot-action]");
  if (!btn) return;
  const action = btn.dataset.spotAction;
  const id = btn.dataset.spotId;
  const type = btn.dataset.spotType;
  if (!action || !id || !type) return;
  e.preventDefault();
  e.stopPropagation();
  const item = spotPopupData && spotPopupData.id === id && spotPopupData.type === type
    ? spotPopupData.item
    : type === "stek"
      ? findStekById(id)
      : findRigById(id);
  if (action === "catch") {
    const detail = { stekId: type === "stek" ? id : null, rigId: type === "rig" ? id : null, scroll: true };
    document.dispatchEvent(new CustomEvent("vislok:focus-catch-form", { detail }));
    closeSpotPopup();
    return;
  }
  closeSpotPopup();
  document.dispatchEvent(
    new CustomEvent("vislok:spot-action", {
      detail: { action, id, type }
    })
  );
}

function createSpotIcon(type) {
  const colors = {
    water: "#42a5f5",
    stek: "#ff9800",
    rig: "#ab47bc"
  };
  return L.divIcon({
    className: `spot-marker spot-${type}`,
    html: `<span></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function findWaterById(id) {
  if (!id) return null;
  return (state.waters || []).find(w => w.id === id) || null;
}

function findStekById(id) {
  if (!id) return null;
  return (state.stekken || []).find(s => s.id === id) || null;
}

function findRigById(id) {
  if (!id) return null;
  return (state.rigs || []).find(r => r.id === id) || null;
}

function extractWaterStatsFromGeometry(geometry) {
  if (!geometry) return null;
  const readFeature = feature => {
    if (!feature || typeof feature !== "object") return null;
    const props = feature.properties || {};
    const raw = props.vislokStats || props.vislok || props.stats;
    if (!raw || typeof raw !== "object") return null;
    const cleaned = { ...raw };
    ["avg", "min", "max", "area", "perimeter"].forEach(key => {
      if (cleaned[key] !== undefined && cleaned[key] !== null) {
        const value = Number(cleaned[key]);
        cleaned[key] = Number.isFinite(value) ? value : null;
      }
    });
    return cleaned;
  };

  if (Array.isArray(geometry)) {
    for (const entry of geometry) {
      const stats = extractWaterStatsFromGeometry(entry);
      if (stats) return stats;
    }
    return null;
  }

  if (geometry.type === "FeatureCollection" && Array.isArray(geometry.features)) {
    for (const feature of geometry.features) {
      const stats = readFeature(feature);
      if (stats) return stats;
    }
    return null;
  }

  if (geometry.type === "Feature") {
    return readFeature(geometry);
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return readFeature({ properties: geometry.properties || {} });
  }

  return null;
}

function getWaterStats(water) {
  if (!water) return null;
  if (water.depthStats && typeof water.depthStats === "object") return water.depthStats;
  if (water.stats && typeof water.stats === "object") return water.stats;
  if (water.polygon) return extractWaterStatsFromGeometry(water.polygon);
  return null;
}

function buildWaterTooltip(water) {
  const stats = getWaterStats(water);
  if (stats && Number.isFinite(stats.avg)) {
    const avg = stats.avg.toFixed(1);
    const range = Number.isFinite(stats.min) && Number.isFinite(stats.max)
      ? ` (${stats.min.toFixed(1)} – ${stats.max.toFixed(1)} m)`
      : "";
    return `${t("footer_depth", "Diepte")}: ${avg} m${range}`;
  }
  if (Number.isFinite(water?.val)) {
    return `${t("footer_depth", "Diepte")}: ${Number(water.val).toFixed(1)} m`;
  }
  return null;
}

function attachMarkerHandlers(marker, item, type) {
  let markerMoved = false;
  let clusteredDuringDrag = false;

  const ensureDraggingEnabled = () => {
    if (marker?.dragging && typeof marker.dragging.enable === "function") {
      marker.dragging.enable();
    }
  };

  const removeFromClusterForDrag = () => {
    if (!clusterGroup || !map || !state.settings.cluster) return false;
    if (clusterGroup.hasLayer(marker)) {
      clusteredDuringDrag = true;
      clusterGroup.removeLayer(marker);
      marker.addTo(map);
      return true;
    }
    clusteredDuringDrag = false;
    return false;
  };

  marker.on("add", ensureDraggingEnabled);

  ["mousedown", "touchstart", "pointerdown"].forEach(evt => {
    marker.on(evt, ev => {
      removeFromClusterForDrag();
      ensureDraggingEnabled();
      startMarkerDistancePreview(marker, item, type, marker.getLatLng());
      const original = ev?.originalEvent || ev;
      if (original?.stopPropagation) original.stopPropagation();
      if (marker.dragging?._draggable?.["_onDown"]) {
        marker.dragging._draggable._onDown(original);
      }
    });
  });

  const restoreClusterAfterDrag = () => {
    if (!clusterGroup || !map || !state.settings.cluster) return;
    if (clusteredDuringDrag) {
      if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
      clusterGroup.addLayer(marker);
    }
    clusteredDuringDrag = false;
  };

  marker.on("dragstart", () => {
    markerMoved = false;
    try { map.dragging.disable(); } catch (_) {}
    removeFromClusterForDrag();
    startMarkerDistancePreview(marker, item, type, marker.getLatLng());
  });

  marker.on("drag", e => {
    markerMoved = true;
    updateMarkerDistancePreview(e.target.getLatLng());
  });

  marker.on("dragend", e => {
    stopMarkerDistancePreview();
    try { map.dragging.enable(); } catch (_) {}
    restoreClusterAfterDrag();
    const target = e?.target;
    if (!target?.getLatLng) return;
    const { lat, lng } = target.getLatLng();
    if (markerMoved) {
      document.dispatchEvent(
        new CustomEvent("vislok:spot-move", {
          detail: { id: item.id, type, lat, lng }
        })
      );
      setStatus(t("spot_popup_move_done", "Positie bijgewerkt"), "ok");
    }
    markerMoved = false;
  });

  marker.on("click", e => {
    swallowLeafletEvent(e);
    stopMarkerDistancePreview();
    showSpotPopup(marker, item, type);
  });
}

/* ---------- EXPORT ALS MODULE ---------- */
window.VisLokMap = {
  initMap,
  detectOSMWater,
  detectViewport,
  detectSelection,
  clearSelection,
  clearDetection,
  showHeatmap,
  clearHeatmap,
  makeContours,
  clearContours,
  startGPS,
  stopGPS,
  startWaterDrawing,
  finishWaterDrawing,
  cancelWaterDrawing,
  refreshDataLayers,
  refreshImportLayer,
  requestLocationPick,
  setClickMode,
  getClickMode,
  getCurrentDetection
};

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initMap);

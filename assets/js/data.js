/* =======================================================
   Vis Lokaties — data.js
   Dataopslag, import/export, CSV/ZIP, local save/load/reset, server sync
   Versie: 0.0.0
   ======================================================= */

import {
  setStatus,
  log,
  state,
  saveState,
  loadState
} from "./core.js?v=20250715";
import { updateOverview, applyFeatureVisibility } from "./ui.js?v=20250715";
import {
  refreshDataLayers,
  refreshImportLayer,
  showHeatmap,
  requestLocationPick,
  setClickMode,
  getCurrentDetection,
  clearDetection,
  clearHeatmap,
  startWaterDrawing,
  finishWaterDrawing,
  cancelWaterDrawing
} from "./map.js?v=20250715";
import {
  saveSpot,
  fetchSpots,
  resetServer,
  deleteSpot,
  saveBathyBatch,
  fetchBathyImports,
  clearBathyImports,
  fetchBathyPoints,
  fetchCatches,
  saveCatch,
  deleteCatch
} from "./db.js?v=20250715";
import { uid, distanceM, escapeHtml } from "./helpers.js?v=20250715";
import { t } from "./i18n.js?v=20250715";

let rawImports = [];
let rawImportKeys = new Set();
let importQueue = [];
let processing = false;
let activeModeButton = null;
let manageActive = "water";
let importTotal = 0;
let importProcessed = 0;
let importHistory = [];
let serverImports = [];
let serverImportSummary = { batches: 0, points: 0 };
let catchFormEls = {};
let activeCatchId = null;
const importEntryMap = new WeakMap();
let currentImportName = null;
let waterDrawActive = false;
let btnDrawWater = null;
let btnFinishWater = null;
let btnCancelWater = null;
let bathyFetchQueued = null;
let bathyFetchActive = false;
let bathyFetchedBounds = null;
let bathyServerAvailable = true;
let lastViewportDetail = null;
const BATHY_FETCH_MARGIN = 0.02;
const FEATURE_KEYS = [
  "showData",
  "showWeather",
  "showContours",
  "showManage",
  "showOverview",
  "showChangelog",
  "allowManualWater",
  "autoLink",
  "toolbarDrag"
];
function ensureFeatureDefaults() {
  if (!state.settings) state.settings = {};
  FEATURE_KEYS.forEach(key => {
    if (state.settings[key] === undefined) {
      state.settings[key] = true;
    }
  });
  if (!Array.isArray(state.settings.panelOrder)) {
    state.settings.panelOrder = [];
  }
  if (!state.settings.panelOpen || typeof state.settings.panelOpen !== "object") {
    state.settings.panelOpen = {};
  }
}

function applyFeatureSettings(options = {}) {
  ensureFeatureDefaults();
  let changed = false;
  FEATURE_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      const value = options[key] !== false;
      if (state.settings[key] !== value) {
        state.settings[key] = value;
        changed = true;
      }
    }
  });
  if (Array.isArray(options.panelOrder)) {
    const cleaned = options.panelOrder.filter(item => typeof item === "string");
    if (cleaned.length) {
      state.settings.panelOrder = cleaned;
      changed = true;
    }
  }
  if (changed) {
    saveState();
  }
  applyFeatureVisibility();
  whenMapReady(() => {
    refreshDataLayers();
    if (state.settings.autoLink !== false) {
      ensureAllRelationships();
    }
  });
  if (state.settings.allowManualWater === false && waterDrawActive) {
    cancelWaterDrawing();
    setWaterDrawButtons(false);
  }
}

function loadRemoteConfigOptions() {
  applyFeatureSettings(state.settings || {});
  return Promise.resolve();
}

function setImportMeta({ stored, total, truncated = false, dropped = false } = {}) {
  const storedValue = Number.isFinite(stored) ? stored : state.imports?.length || 0;
  const totalValue = Number.isFinite(total) ? total : state.imports?.length || 0;
  state.importsMeta = {
    stored: storedValue,
    total: totalValue,
    truncated: truncated && totalValue > storedValue,
    dropped: dropped && totalValue > 0
  };
}

function normalizeImportMeta() {
  const meta = state.importsMeta || {};
  setImportMeta({
    stored: meta.stored,
    total: meta.total,
    truncated: meta.truncated,
    dropped: meta.dropped
  });
}

function extractPolygonStats(polygon) {
  if (!polygon) return null;

  const readFeature = feature => {
    if (!feature || typeof feature !== "object") return null;
    const props = feature.properties || {};
    const raw = props.vislokStats || props.vislok || props.stats;
    if (!raw || typeof raw !== "object") return null;
    const result = { ...raw };
    ["avg", "min", "max", "area", "perimeter"].forEach(key => {
      if (result[key] !== undefined && result[key] !== null) {
        const num = Number(result[key]);
        result[key] = Number.isFinite(num) ? num : null;
      }
    });
    return result;
  };

  if (Array.isArray(polygon)) {
    for (const entry of polygon) {
      const stats = extractPolygonStats(entry);
      if (stats) return stats;
    }
    return null;
  }

  if (polygon.type === "FeatureCollection" && Array.isArray(polygon.features)) {
    for (const feature of polygon.features) {
      const stats = readFeature(feature);
      if (stats) return stats;
    }
    return null;
  }

  if (polygon.type === "Feature") {
    return readFeature(polygon);
  }

  if (polygon.type === "Polygon" || polygon.type === "MultiPolygon") {
    return readFeature({ properties: polygon.properties || {} });
  }

  return null;
}

function normalizeSpotEntry(entry, fallbackType) {
  if (!entry) return null;
  const spot = { ...entry };
  if (!spot.type && fallbackType) spot.type = fallbackType;
  if (!spot.type) return null;

  if (spot.water_id !== undefined && spot.waterId === undefined) {
    spot.waterId = spot.water_id;
  }
  if (spot.stek_id !== undefined && spot.stekId === undefined) {
    spot.stekId = spot.stek_id;
  }
  delete spot.water_id;
  delete spot.stek_id;

  if (!spot.id) {
    spot.id = uid(spot.type);
  }

  if (spot.polygon && typeof spot.polygon === "string") {
    try {
      spot.polygon = JSON.parse(spot.polygon);
    } catch (err) {
      spot.polygon = null;
    }
  }

  const numeric = key => {
    if (spot[key] === undefined || spot[key] === null) return;
    const value = Number(spot[key]);
    spot[key] = Number.isFinite(value) ? value : null;
  };

  numeric("lat");
  numeric("lng");
  numeric("val");

  if (typeof spot.note === "string" && !spot.note.trim()) {
    spot.note = null;
  }

  const cleanRef = key => {
    const value = spot[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      spot[key] = trimmed ? trimmed : null;
    } else if (value === undefined) {
      spot[key] = null;
    }
  };

  cleanRef("waterId");
  cleanRef("stekId");

  if (spot.polygon) {
    const stats = extractPolygonStats(spot.polygon);
    if (stats) {
      spot.depthStats = stats;
      if ((spot.val === undefined || spot.val === null) && Number.isFinite(stats.avg)) {
        spot.val = stats.avg;
      }
    }
  }

  return spot;
}

function findNearestWater(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  (state.waters || []).forEach(w => {
    if (!Number.isFinite(w?.lat) || !Number.isFinite(w?.lng)) return;
    const dist = distanceM(lat, lng, w.lat, w.lng);
    if (!Number.isFinite(dist)) return;
    if (dist < bestDist) {
      bestDist = dist;
      best = w;
    }
  });
  return best;
}

function findNearestStek(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  (state.stekken || []).forEach(s => {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lng)) return;
    const dist = distanceM(lat, lng, s.lat, s.lng);
    if (!Number.isFinite(dist)) return;
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  });
  return best;
}

function findNearestStekId(spot) {
  if (!spot) return "";
  if (spot.stekId) return spot.stekId;
  if (spot.stek_id) return spot.stek_id;
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return "";
  const nearest = findNearestStek(spot.lat, spot.lng);
  return nearest?.id || "";
}

function ensureSpotRelationships(spot) {
  if (!spot || !spot.type) return false;
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return false;
  if (state.settings.autoLink === false) return false;
  let changed = false;

  if (spot.type === "stek") {
    const currentWater = spot.waterId ? findSpot("water", spot.waterId) : null;
    if (!currentWater) {
      const nearest = findNearestWater(spot.lat, spot.lng);
      if (nearest) {
        if (spot.waterId !== nearest.id) {
          spot.waterId = nearest.id;
          changed = true;
        }
      } else if (spot.waterId) {
        spot.waterId = null;
        changed = true;
      }
    }
  } else if (spot.type === "rig") {
    let stek = spot.stekId ? findSpot("stek", spot.stekId) : null;
    if (!stek) {
      const nearestStek = findNearestStek(spot.lat, spot.lng);
      if (nearestStek) {
        if (spot.stekId !== nearestStek.id) {
          spot.stekId = nearestStek.id;
          changed = true;
        }
        stek = nearestStek;
      } else if (spot.stekId) {
        spot.stekId = null;
        changed = true;
      }
    }

    let water = spot.waterId ? findSpot("water", spot.waterId) : null;
    if (!water && stek?.waterId) {
      water = findSpot("water", stek.waterId);
    }
    if (!water) {
      const nearestWater = findNearestWater(spot.lat, spot.lng);
      if (nearestWater) {
        if (spot.waterId !== nearestWater.id) {
          spot.waterId = nearestWater.id;
          changed = true;
        }
      } else if (spot.waterId) {
        spot.waterId = null;
        changed = true;
      }
    } else if (spot.waterId !== water.id) {
      spot.waterId = water.id;
      changed = true;
    }
  }

  return changed;
}

function ensureAllRelationships() {
  let dirty = false;
  (state.stekken || []).forEach(stek => {
    if (ensureSpotRelationships(stek)) dirty = true;
  });
  (state.rigs || []).forEach(rig => {
    if (ensureSpotRelationships(rig)) dirty = true;
  });
  if (dirty) {
    saveState();
  }
}

/* ---------- INITIALISATIE ---------- */
export function initData() {
  loadState();
  ensureFeatureDefaults();
  if (state.settings.saveBathy === undefined) state.settings.saveBathy = true;
  if (state.settings.autoSync === undefined) state.settings.autoSync = true;
  if (!state.imports) state.imports = [];
  if (!state.waters) state.waters = [];
  if (!state.stekken) state.stekken = [];
  if (!state.rigs) state.rigs = [];
  if (!state.filters) state.filters = { depthMin: 0, depthMax: 10 };
  applyFeatureVisibility();
  normalizeImportMeta();

  state.waters = state.waters
    .map(w => normalizeSpotEntry({ type: "water", ...w }, "water"))
    .filter(Boolean);
  state.stekken = state.stekken
    .map(s => normalizeSpotEntry({ type: "stek", ...s }, "stek"))
    .filter(Boolean);
  state.rigs = state.rigs
    .map(r => normalizeSpotEntry({ type: "rig", ...r }, "rig"))
    .filter(Boolean);

  ensureAllRelationships();

  rawImports = [...state.imports];
  rebuildImportIndex();
  syncStateImports();
  bindEvents();
  whenMapReady(() => {
    refreshDataLayers();
    refreshImportLayer();
    if (state.imports?.length) {
      showHeatmap(false);
    } else {
      clearHeatmap(false);
    }
  });
  updateOverview();
  updateImportStats();
  updateImportTable();
  updateToolbarLinks();
  clearDetectionSummary();
  loadRemoteConfigOptions();
  log("Data-init voltooid");
}

function whenMapReady(cb) {
  if (window.map) {
    cb();
  } else {
    document.addEventListener("vislok:map-ready", () => cb(), { once: true });
  }
}

function bindEvents() {
  const csvInput = document.getElementById("csvFile");
  const folderInput = document.getElementById("folderInput");
  const btnLoad = document.getElementById("btnLoadCSV");
  const btnImportFolder = document.getElementById("btnImportFolder");
  const btnGeo = document.getElementById("btnImportGeoJSON");
  const btnSaveHtml = document.getElementById("btnSaveHtml");
  const btnSaveHtmlData = document.getElementById("btnSaveHtmlData");
  const btnLocalSave = document.getElementById("btnLocalSave");
  const btnLocalLoad = document.getElementById("btnLocalLoad");
  const btnLocalReset = document.getElementById("btnLocalReset");
  const btnExportJSON = document.getElementById("btnExportGeoJSON");
  const btnExportZIP = document.getElementById("btnExportZIP");
  const btnFilterDepth = document.getElementById("btnFilterDepth");
  const btnResetDepth = document.getElementById("btnResetDepth");
  const btnAutoRigs = document.getElementById("btnAutoRigs");
  const btnNormalize = document.getElementById("btnNormalizeDB");
  const btnSync = document.getElementById("btnSyncServer");
  const btnResetServer = document.getElementById("btnResetServer");
  const btnClearHeat = document.getElementById("btnClearHeat");
  const btnDetectSave = document.getElementById("btnDetectSave");
  const btnDetectClear = document.getElementById("btnDetectClear");
  const btnBathyStats = document.getElementById("btnBathyStats");
  const btnClearBathy = document.getElementById("btnClearBathy");
  const chkSaveBathy = document.getElementById("saveBathy");
  const btnRefreshImports = document.getElementById("btnRefreshImports");
  const btnClearBathyServer = document.getElementById("btnClearBathyServer");
  const btnExportAll = document.getElementById("btnExportAll");
  const chkShowImports = document.getElementById("toggleImports");
  btnDrawWater = document.getElementById("btnDrawWaterPoly");
  btnFinishWater = document.getElementById("btnFinishWaterPoly");
  btnCancelWater = document.getElementById("btnCancelWaterPoly");

  csvInput?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) {
      const entry = queueImport(file);
      if (entry) {
        setStatus(`${t("status_queue_add", "Bestand in wachtrij")}: ${file.name}`, "info");
      }
    }
  });

  folderInput?.addEventListener("change", handleFolderImport);

  btnLoad?.addEventListener("click", () => csvInput?.click());
  btnImportFolder?.addEventListener("click", () => folderInput?.click());
  btnGeo?.addEventListener("click", openGeoJSONDialog);
  btnSaveHtml?.addEventListener("click", exportHTML);
  btnSaveHtmlData?.addEventListener("click", exportHTMLWithData);
  btnLocalSave?.addEventListener("click", localSave);
  btnLocalLoad?.addEventListener("click", localLoad);
  btnLocalReset?.addEventListener("click", localReset);
  btnExportJSON?.addEventListener("click", exportGeoJSON);
  btnExportZIP?.addEventListener("click", exportZIP);
  btnFilterDepth?.addEventListener("click", applyDepthFilter);
  btnResetDepth?.addEventListener("click", resetDepthFilter);
  btnAutoRigs?.addEventListener("click", generateAutoRigs);
  btnNormalize?.addEventListener("click", normalizeDatabase);
  btnSync?.addEventListener("click", () => syncWithServer(true));
  btnResetServer?.addEventListener("click", resetServerData);
  btnClearHeat?.addEventListener("click", () => {
    clearHeatmap();
    updateImportStats();
  });
  btnDetectSave?.addEventListener("click", saveDetectionAsWater);
  btnDetectClear?.addEventListener("click", () => {
    clearDetection();
    clearDetectionSummary();
  });
  btnDrawWater?.addEventListener("click", startManualWaterDraw);
  btnFinishWater?.addEventListener("click", finishManualWaterDraw);
  btnCancelWater?.addEventListener("click", cancelManualWaterDraw);
  btnBathyStats?.addEventListener("click", showBathyStats);
  btnClearBathy?.addEventListener("click", () => clearBathymetry());
  btnRefreshImports?.addEventListener("click", () => loadServerImportSummary(true));
  btnClearBathyServer?.addEventListener("click", () => {
    if (!confirm(t("confirm_clear_bathy_server", "Weet je zeker dat je alle bathydata uit de database wilt verwijderen?"))) {
      return;
    }
    clearBathyImports()
      .then(() => loadServerImportSummary())
      .then(() => {
        setStatus(t("status_bathy_server_cleared", "Bathydatabase gewist"), "ok");
      })
      .catch(err => {
        console.error(err);
        setStatus(t("status_bathy_server_clear_error", "Bathydatabase kon niet worden gewist"), "error");
      });
  });
  if (chkSaveBathy) {
    chkSaveBathy.checked = state.settings.saveBathy !== false;
    chkSaveBathy.addEventListener("change", () => {
      state.settings.saveBathy = chkSaveBathy.checked;
      saveState();
      const adminToggle = document.getElementById("adminForceBathy");
      if (adminToggle) adminToggle.checked = chkSaveBathy.checked;
      updateImportStats();
      if (chkSaveBathy.checked) {
        setStatus(t("status_bathy_db_enabled", "Nieuwe imports worden in de database opgeslagen"), "info");
      } else {
        setStatus(t("status_bathy_db_disabled", "Nieuwe imports worden alleen lokaal opgeslagen"), "warning");
      }
    });
  }

  if (chkShowImports) {
    chkShowImports.checked = state.settings.showImports === true;
    chkShowImports.addEventListener("change", () => {
      state.settings.showImports = chkShowImports.checked;
      saveState();
      whenMapReady(() => refreshImportLayer());
      const key = chkShowImports.checked
        ? "status_import_points_on"
        : "status_import_points_off";
      setStatus(
        t(key, chkShowImports.checked ? "Deeper-punten zichtbaar" : "Deeper-punten verborgen"),
        "info"
      );
    });
  }
  btnExportAll?.addEventListener("click", exportAll);
  setWaterDrawButtons(false);

  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = state.language;

  document.querySelectorAll("button[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode || "none";
      setClickMode(mode);
      if (activeModeButton) activeModeButton.classList.remove("active");
      if (mode !== "none") {
        btn.classList.add("active");
        activeModeButton = btn;
      } else {
        activeModeButton = null;
      }
    });
  });

  catchFormEls = {
    panel: document.querySelector('details[data-panel="catches"]'),
    form: document.getElementById("catchModalForm"),
    id: document.getElementById("catchModalId"),
    stek: document.getElementById("catchModalStek"),
    rig: document.getElementById("catchModalRig"),
    weightKg: document.getElementById("catchModalWeightKg"),
    weightLbs: document.getElementById("catchModalWeightLbs"),
    length: document.getElementById("catchModalLength"),
    notes: document.getElementById("catchModalNotes"),
    photo: document.getElementById("catchModalPhoto"),
    date: document.getElementById("catchModalDate"),
    deleteBtn: document.getElementById("btnDeleteCatch"),
    cancelBtn: document.getElementById("btnCancelCatch"),
    summaryLabel: document.getElementById("catchSummarySelection"),
    selectionLabel: document.getElementById("catchSelectionLabel"),
    list: document.getElementById("catchList")
  };

  ensureCatchFormVisible();
  bindCatchForm();

  openCatchModal({ forceNew: true });

  document.addEventListener("vislok:focus-catch-form", e => focusCatchForm(e.detail));

  setInterval(populateTables, 10000);
  setInterval(autoSave, 60000);

  const pushOnInit = state.settings?.autoSync !== false;
  syncWithServer(pushOnInit);

  document.addEventListener("vislok:map-new-spot", onMapNewSpot);
  document.addEventListener("vislok:spot-move", onSpotMove);
  document.addEventListener("vislok:spot-action", onSpotAction);
  document.addEventListener("vislok:detection", onDetection);
  document.addEventListener("vislok:detection-clear", clearDetectionSummary);
  document.addEventListener("vislok:draw-water-finish", finishManualWaterDraw);
  document.addEventListener("vislok:bathy-stats", e => updateBathyPanel(e.detail));
  document.addEventListener("vislok:storage-truncated", handleStorageTruncated);
  document.addEventListener("vislok:storage-error", handleStorageError);
  document.addEventListener("vislok:map-bounds", e => scheduleBathyViewportFetch(e?.detail || e));
}

function ensureCatchFormVisible() {
  if (catchFormEls.panel) {
    catchFormEls.panel.setAttribute("open", "open");
    catchFormEls.panel.classList.remove("is-hidden");
  }
  if (catchFormEls.selectionLabel) catchFormEls.selectionLabel.hidden = false;
  if (catchFormEls.list) catchFormEls.list.hidden = false;
}

/* ---------- MAP EVENT HANDLERS ---------- */
function onMapNewSpot(e) {
  const { type, lat, lng } = e.detail || {};
  if (!type || lat === undefined || lng === undefined) return;
  const defaultNames = {
    water: t("default_water", "Nieuw water"),
    stek: t("default_stek", "Nieuwe stek"),
    rig: t("default_rig", "Nieuwe rig")
  };
  const prompts = {
    water: t("prompt_water_name", "Naam voor het nieuwe water"),
    stek: t("prompt_stek_name", "Naam voor de nieuwe stek"),
    rig: t("prompt_rig_name", "Naam voor de nieuwe rig")
  };
  const name = window.prompt(prompts[type] || prompts.water, defaultNames[type] || defaultNames.water);
  if (name === null) return; // cancelled
  const trimmed = name.trim();
  if (!trimmed) {
    setStatus(t("error_name_required", "Naam is vereist"), "error");
    return;
  }
  const spot = {
    id: uid(type),
    type,
    name: trimmed,
    lat,
    lng
  };
  if (type === "stek") spot.val = null;
  if (type === "rig") spot.note = "";
  addSpotToState(spot).catch(err => {
    console.warn("Interactieve spot kon niet worden opgeslagen", err);
  });
}

  function onSpotMove(e) {
    const { id, type, lat, lng } = e.detail || {};
    if (!id || !type) return;
    const spot = findSpot(type, id);
    if (!spot) return;
    spot.lat = lat;
    spot.lng = lng;
    ensureSpotRelationships(spot);
    persistSpot(spot, false)
      .then(() => {
        populateTables();
      })
      .catch(err => {
        console.warn("Spot bijwerken mislukte", err);
      });
  }

  function onSpotAction(e) {
    const { action, id, type } = e.detail || {};
    if (!action || !id || !type) return;
    const spot = findSpot(type, id);
    if (!spot) return;
    if (action === "rename") {
    const newName = window.prompt(t("prompt_rename", "Nieuwe naam"), spot.name || "");
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setStatus(t("error_name_required", "Naam is vereist"), "error");
      return;
    }
    if (trimmed === spot.name) return;
    const confirmText = t("confirm_rename", "Naam wijzigen naar {name}?").replace("{name}", trimmed);
    if (!window.confirm(confirmText)) return;
      spot.name = trimmed;
      persistSpot(spot, false)
        .then(() => {
          populateTables();
          setStatus(t("status_renamed", "Naam bijgewerkt"), "ok");
        })
        .catch(err => {
          console.warn("Naam bijwerken mislukte", err);
          setStatus(t("status_save_error", "Lokaal opgeslagen (server faalde)"), "error");
        });
    }
    if (action === "delete") {
      const confirmText = t("confirm_delete", "Weet je zeker dat je dit item wilt verwijderen?");
      if (!window.confirm(confirmText)) return;
      removeSpotFromState(type, id);
      deleteSpot(id).catch(err => {
        console.warn("Server delete faalde", err);
      });
      refreshAfterDataChange();
      setStatus(t("status_deleted", "Item verwijderd"), "ok");
    }
  }

function onDetection(e) {
  const detection = e.detail;
  if (!detection) return;
  const summaryEl = document.getElementById("detectSummary");
  const btnSave = document.getElementById("btnDetectSave");
  if (btnSave) btnSave.disabled = false;
  if (!summaryEl) return;
  const { stats } = detection;
  const lines = [];
  lines.push(`${t("detect_points", "Punten")}: ${stats.count}`);
  if (Number.isFinite(stats.avg)) lines.push(`${t("detect_avg", "Gemiddelde")}: ${stats.avg.toFixed(2)}m`);
  if (Number.isFinite(stats.min) && Number.isFinite(stats.max)) {
    lines.push(`${t("detect_range", "Bereik")}: ${stats.min.toFixed(1)}m – ${stats.max.toFixed(1)}m`);
  }
  if (Number.isFinite(stats.area)) {
    lines.push(`${t("detect_area", "Oppervlakte")}: ${(stats.area / 10000).toFixed(2)} ha`);
  }
  if (Number.isFinite(stats.perimeter)) {
    lines.push(`${t("detect_perimeter", "Omtrek")}: ${stats.perimeter.toFixed(2)} km`);
  }
  summaryEl.classList.remove("error");
  summaryEl.classList.add("panel-note");
  summaryEl.innerHTML = lines.join("<br>");
  const nameInput = document.getElementById("detectName");
  const suggestion =
    detection.nameSuggestion || (Array.isArray(stats.names) ? stats.names.find(Boolean) : null);
  if (nameInput) {
    const currentValue = typeof nameInput.value === "string" ? nameInput.value.trim() : "";
    if (detection.kind === "osm" && suggestion) {
      nameInput.value = suggestion;
    } else if (!currentValue) {
      nameInput.value = suggestion || `${t("default_water", "Nieuw water")} ${stats.count}`;
    }
    nameInput.focus();
    nameInput.select();
  }

  if (detection.kind === "osm" || detection.kind === "manual") {
    const defaultName =
      (nameInput && typeof nameInput.value === "string" && nameInput.value.trim()) ||
      suggestion ||
      (detection.kind === "manual"
        ? t("detect_manual_name", "Handmatig water")
        : t("default_water", "Nieuw water"));
    const promptKey = detection.kind === "manual" ? "prompt_detect_manual_name" : "prompt_detect_osm_name";
    const promptLabel = t(promptKey, "Geef een naam voor dit water");
    const response = window.prompt(promptLabel, defaultName);
    if (response !== null) {
      const trimmed = response.trim();
      if (trimmed) {
        if (nameInput) nameInput.value = trimmed;
        detection.nameSuggestion = trimmed;
      }
    }
  }
  let finalName = nameInput && typeof nameInput.value === "string" ? nameInput.value.trim() : "";
  if (!finalName) finalName = detection.nameSuggestion || suggestion || "";
  if (!finalName) {
    const fallbackBase = t("default_water", "Nieuw water");
    finalName = `${fallbackBase} ${new Date().toISOString().slice(11, 19)}`;
    if (nameInput) nameInput.value = finalName;
  }
  if (detection.kind === "osm" || detection.kind === "manual") {
    saveDetectionAsWater({ auto: true, name: finalName });
  }
  setWaterDrawButtons(false);
}

function clearDetectionSummary() {
  const summaryEl = document.getElementById("detectSummary");
  if (summaryEl) {
    summaryEl.textContent = t("detect_idle", "Nog geen detectie uitgevoerd.");
    summaryEl.classList.remove("error");
    summaryEl.classList.add("panel-note");
  }
  const btnSave = document.getElementById("btnDetectSave");
  if (btnSave) btnSave.disabled = true;
  setWaterDrawButtons(false);
}

function handleStorageTruncated(e) {
  normalizeImportMeta();
  updateImportStats();
  const detail = e?.detail || {};
  const total = Number.isFinite(detail.total) ? detail.total : state.importsMeta.total || 0;
  const stored = Number.isFinite(detail.stored) ? detail.stored : state.importsMeta.stored || 0;
  const key = detail.dropped
    ? "status_storage_dropped"
    : "status_storage_trimmed";
  const template = t(
    key,
    detail.dropped
      ? "Lokale cache kon {total} bathy-punten niet opslaan"
      : "Lokale cache beperkt tot {stored} van {total} bathy-punten"
  );
  const message = template
    .replace("{stored}", stored)
    .replace("{total}", total);
  setStatus(message, detail.dropped ? "error" : "warning");
}

function handleStorageError() {
  setStatus(t("status_storage_failed", "Kon lokale opslag niet bijwerken"), "error");
}

function setWaterDrawButtons(active) {
  const allow = state.settings.allowManualWater !== false;
  waterDrawActive = allow && Boolean(active);
  if (btnDrawWater) btnDrawWater.disabled = !allow || waterDrawActive;
  if (btnFinishWater) btnFinishWater.disabled = !waterDrawActive;
  if (btnCancelWater) btnCancelWater.disabled = !waterDrawActive;
}

function startManualWaterDraw(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  if (state.settings.allowManualWater === false) {
    setStatus(t("status_draw_water_disabled", "Handmatig water tekenen is uitgeschakeld"), "warning");
    return;
  }
  if (waterDrawActive) return;
  whenMapReady(() => {
    const started = startWaterDrawing();
    if (started === false) return;
    setWaterDrawButtons(true);
    setStatus(t("status_draw_water_start", "Klik punten op de kaart om water te tekenen"), "info");
  });
}

function finishManualWaterDraw(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  if (!waterDrawActive) return;
  const result = finishWaterDrawing();
  if (result === false) {
    setStatus(t("status_draw_water_need_points", "Minimaal drie punten nodig"), "error");
    return;
  }
  setWaterDrawButtons(false);
}

function cancelManualWaterDraw(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  if (!waterDrawActive) return;
  cancelWaterDrawing();
  setWaterDrawButtons(false);
  setStatus(t("status_draw_water_cancel", "Tekenen geannuleerd"), "warn");
}

function updateBathyPanel(detail) {
  const el = document.getElementById("contourStats");
  if (!el) return;
  if (!detail) {
    el.textContent = t("contour_idle", "Nog geen contouren of bathy-data geanalyseerd.");
    return;
  }
  const lines = [];
  if (Number.isFinite(detail.count)) lines.push(`${t("detect_points", "Punten")}: ${detail.count}`);
  if (Number.isFinite(detail.avg)) lines.push(`${t("detect_avg", "Gemiddelde")}: ${detail.avg.toFixed(2)}m`);
  if (Number.isFinite(detail.min) && Number.isFinite(detail.max)) {
    lines.push(`${t("detect_range", "Bereik")}: ${detail.min.toFixed(1)}m – ${detail.max.toFixed(1)}m`);
  }
  if (state.settings?.saveBathy === false) {
    lines.push(t("status_bathy_db_disabled", "Nieuwe imports worden alleen lokaal opgeslagen"));
  } else {
    lines.push(t("status_bathy_db_enabled", "Nieuwe imports worden in de database opgeslagen"));
  }

  el.innerHTML = lines.join("<br>");
}

function saveDetectionAsWater(options = {}) {
  if (options && typeof options.preventDefault === "function") {
    options.preventDefault();
    options = {};
  }
  const auto = options.auto === true;
  const overrideName = typeof options.name === "string" ? options.name.trim() : "";
  const detect = getCurrentDetection();
  if (!detect) {
    if (!auto) setStatus(t("error_no_detection", "Geen actieve detectie"), "error");
    return Promise.resolve(null);
  }
  if (detect.autoSaved) {
    if (!auto) {
      setStatus(t("status_detect_saved", "Detectie opgeslagen als water"), "info");
    }
    return Promise.resolve(null);
  }
  const input = document.getElementById("detectName");
  let name = overrideName || (input ? input.value.trim() : "");
  if (!name) {
    const fallbackBase = t("default_water", "Nieuw water");
    name = `${fallbackBase} ${new Date().toISOString().slice(11, 19)}`;
    if (input) input.value = name;
  }
  let center = detect.center;
  if (!center && window.map?.getCenter) {
    const c = window.map.getCenter();
    center = { lat: c.lat, lng: c.lng };
  }
  if (!center) {
    if (Array.isArray(state.center) && state.center.length >= 2) {
      center = { lat: state.center[0], lng: state.center[1] };
    } else if (state.center?.lat !== undefined && state.center?.lng !== undefined) {
      center = { lat: state.center.lat, lng: state.center.lng };
    }
  }
  const lat =
    center?.lat ??
    (Array.isArray(center) ? center[0] : undefined) ??
    state.center?.[0];
  const lng =
    center?.lng ??
    (Array.isArray(center) ? center[1] : undefined) ??
    state.center?.[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (!auto) setStatus(t("error_location_required", "Geen geldige locatie beschikbaar"), "error");
    return Promise.resolve(null);
  }
  const stats = detect.stats || {};
  const statsPayload = {
    avg: Number.isFinite(stats.avg) ? stats.avg : null,
    min: Number.isFinite(stats.min) ? stats.min : null,
    max: Number.isFinite(stats.max) ? stats.max : null,
    area: Number.isFinite(stats.area) ? stats.area : null,
    perimeter: Number.isFinite(stats.perimeter) ? stats.perimeter : null
  };

  const water = {
    id: uid("water"),
    type: "water",
    name,
    lat,
    lng,
    polygon: null,
    val: Number.isFinite(statsPayload.avg) ? statsPayload.avg : null,
    depthStats: statsPayload
  };

  if (detect.polygon) {
    try {
      const polygon = JSON.parse(JSON.stringify(detect.polygon));
      const assignStats = feature => {
        if (!feature || typeof feature !== "object") return feature;
        const props = feature.properties || {};
        feature.properties = { ...props, vislokStats: { ...statsPayload } };
        return feature;
      };
      if (Array.isArray(polygon)) {
        water.polygon = polygon.map(assignStats);
      } else if (polygon.type === "FeatureCollection" && Array.isArray(polygon.features)) {
        polygon.features = polygon.features.map(assignStats);
        water.polygon = polygon;
      } else if (polygon.type === "Feature") {
        water.polygon = assignStats(polygon);
      } else {
        assignStats(polygon);
        water.polygon = polygon;
      }
    } catch (err) {
      console.warn("Kon detectiepolygon niet klonen", err);
      water.polygon = detect.polygon;
    }
  }

  detect.autoSaved = true;
  return addSpotToState(water)
    .then(saved => {
      if (input) input.value = "";
      const btn = document.getElementById("btnDetectSave");
      if (btn) btn.disabled = true;
      setStatus(t("status_detect_saved", "Detectie opgeslagen als water"), "ok");
      return saved || water;
    })
    .then(saved =>
      syncWithServer(false)
        .then(() => saved)
        .catch(err => {
          console.warn("Sync na watersave faalde", err);
          return saved;
        })
    )
    .catch(err => {
      console.error("Detectie opslaan mislukte", err);
      setStatus(t("status_save_error", "Lokaal opgeslagen (server faalde)"), "error");
      detect.autoSaved = false;
      return null;
    });
}

function showBathyStats() {
  if (!state.imports?.length) {
    updateBathyPanel(null);
    setStatus(t("error_no_imports", "Geen bathydata beschikbaar"), "error");
    return;
  }
  updateBathyPanel(summarizeDepth(state.imports));
  setStatus(t("status_bathy_stats", "Bathystatistieken bijgewerkt"), "ok");
}

function clearBathymetry() {
  rawImports = [];
  rawImportKeys.clear();
  syncStateImports();
  setImportMeta({ stored: 0, total: 0, truncated: false, dropped: false });
  saveState();
  whenMapReady(() => {
    refreshImportLayer();
    clearHeatmap(false);
  });
  updateImportStats();
  importHistory.forEach(entry => {
    entry.status = "cleared";
    entry.message = t("import_status_cleared", "Lokale data gewist");
  });
  updateImportTable();
  setStatus(t("status_bathy_clear", "Bathymetrie gewist"), "ok");
  if (shouldPersistBathy()) {
    clearBathyImports()
      .then(() => loadServerImportSummary())
      .then(() => {
        setStatus(t("status_bathy_clear_sync", "Bathymetrie gewist en database opgeschoond"), "ok");
      })
      .catch(err => {
        console.error(err);
        setStatus(t("status_bathy_server_clear_error", "Bathydatabase kon niet worden gewist"), "error");
      });
  }
}

function handleFolderImport(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  let queued = 0;
  files.forEach(file => {
    if (/\.(csv|zip)$/i.test(file.name)) {
      const entry = queueImport(file);
      if (entry) queued += 1;
    }
  });
  if (queued) {
    setStatus(t("status_folder_queue", "Bestanden toegevoegd aan wachtrij") + ` (${queued})`, "info");
  }
  e.target.value = "";
}

function addSpotToState(rawSpot) {
  const normalized = normalizeSpotEntry(rawSpot, rawSpot?.type);
  if (!normalized) return Promise.resolve();
  const list = getListByType(normalized.type);
  if (!list) return Promise.resolve();
  ensureSpotRelationships(normalized);
  list.push(normalized);
  populateTables();
  return persistSpot(normalized, false)
    .then(saved => {
      if (saved && saved !== normalized) {
        const merged = normalizeSpotEntry({ ...normalized, ...saved }, normalized.type);
        if (merged) {
          Object.assign(normalized, merged);
        }
      }
      return relinkAfterAddition(normalized);
    })
    .then(updatedLinks => {
      populateTables();
      const baseMessages = {
        water: t("status_water_added", "Water opgeslagen"),
        stek: t("status_stek_added", "Stek opgeslagen"),
        rig: t("status_rig_added", "Rig opgeslagen")
      };
      const linkMessages = {
        water: t("status_water_added_links", "Water opgeslagen en koppelingen bijgewerkt"),
        stek: t("status_stek_added_links", "Stek opgeslagen en gekoppeld"),
        rig: t("status_rig_added_links", "Rig opgeslagen"),
        default: t("status_spot_added", "Item toegevoegd")
      };
      const key = updatedLinks > 0 ? normalized.type : null;
      let message = key ? linkMessages[key] : baseMessages[normalized.type] || linkMessages.default;
      if (updatedLinks > 0) {
        const suffix = t("status_links_updated", "Links updated: {count}").replace("{count}", updatedLinks);
        message = `${message} (${suffix})`;
      }
      setStatus(message || baseMessages[normalized.type] || linkMessages.default, "ok");
      if (normalized.type === "stek") {
        document.dispatchEvent(
          new CustomEvent("vislok:focus-catch-form", {
            detail: { stekId: normalized.id, scroll: true }
          })
        );
      } else if (normalized.type === "rig") {
        document.dispatchEvent(
          new CustomEvent("vislok:focus-catch-form", {
            detail: {
              stekId: normalized.stekId || findNearestStekId(normalized) || "",
              rigId: normalized.id,
              scroll: true
            }
          })
        );
      }
      return normalized;
    })
    .catch(err => {
      console.warn("Spot toevoegen mislukte", err);
      setStatus(t("status_save_error", "Lokaal opgeslagen (server faalde)"), "error");
      throw err;
    });
}

function relinkAfterAddition(spot) {
  if (!spot) return Promise.resolve(0);
  const tasks = [];
  let updated = 0;
  const enqueue = (candidate, ensureFn) => {
    if (!candidate) return;
    if (ensureFn(candidate)) {
      tasks.push(() =>
        persistSpot(candidate, false).then(() => {
          updated += 1;
        })
      );
    }
  };

  if (spot.type === "water") {
    (state.stekken || []).forEach(stek => {
      if (stek.id === spot.id) return;
      enqueue(stek, ensureSpotRelationships);
    });
    (state.rigs || []).forEach(rig => {
      enqueue(rig, ensureSpotRelationships);
    });
  } else if (spot.type === "stek") {
    (state.rigs || []).forEach(rig => {
      enqueue(rig, ensureSpotRelationships);
    });
  }

  if (!tasks.length) {
    return Promise.resolve(0);
  }

  return tasks.reduce((chain, task) => chain.then(task), Promise.resolve()).then(() => updated);
}

function getListByType(type) {
  if (type === "water") {
    if (!Array.isArray(state.waters)) state.waters = [];
    return state.waters;
  }
  if (type === "stek") {
    if (!Array.isArray(state.stekken)) state.stekken = [];
    return state.stekken;
  }
  if (type === "rig") {
    if (!Array.isArray(state.rigs)) state.rigs = [];
    return state.rigs;
  }
  return null;
}

function findSpot(type, id) {
  const list = getListByType(type);
  return list?.find(item => item.id === id) || null;
}

function removeSpotFromState(type, id) {
  const list = getListByType(type);
  if (!list) return;
  const index = list.findIndex(item => item.id === id);
  if (index >= 0) {
    list.splice(index, 1);
  }
  if (type === "water") {
    let dirty = false;
    (state.stekken || []).forEach(stek => {
      if (stek.waterId === id) {
        stek.waterId = null;
        if (ensureSpotRelationships(stek)) dirty = true;
        dirty = true;
      }
    });
    (state.rigs || []).forEach(rig => {
      if (rig.waterId === id) {
        rig.waterId = null;
        if (ensureSpotRelationships(rig)) dirty = true;
        dirty = true;
      }
    });
    if (dirty) saveState();
  }
  if (type === "stek") {
    let dirty = false;
    (state.rigs || []).forEach(rig => {
      if (rig.stekId === id) {
        rig.stekId = null;
        if (ensureSpotRelationships(rig)) dirty = true;
        dirty = true;
      }
    });
    if (dirty) saveState();
  }
}

function refreshAfterDataChange() {
  saveState();
  whenMapReady(() => refreshDataLayers());
  updateOverview();
  populateTables();
  updateToolbarLinks();
}

function summarizeDepth(points) {
  if (!points?.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let validCount = 0;
  points.forEach(point => {
    const value = Number(point?.val ?? point?.depth);
    if (Number.isFinite(value)) {
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
      validCount += 1;
    }
  });
  return {
    count: points.length,
    min: validCount ? min : null,
    max: validCount ? max : null,
    avg: validCount ? sum / validCount : null
  };
}

function updateImportStats() {
  const el = document.getElementById("importStats");
  if (!el) return;
  const lines = [];

  if (state.imports?.length) {
    lines.push(t("import_local_ready", "Bathymetrie beschikbaar voor heatmap."));
  } else {
    lines.push(t("import_local_empty", "Geen lokale bathydata"));
  }

  const meta = state.importsMeta || {};
  if (meta.dropped || meta.truncated) {
    lines.push(
      t(
        "import_local_storage_warning",
        "Niet alle bathydata kon lokaal worden opgeslagen; de database bevat de volledige set."
      )
    );
  }

  if (serverImportSummary?.batches || serverImportSummary?.points) {
    lines.push(t("import_server_available", "Bathymetrie staat in de database."));
  } else {
    lines.push(t("import_server_empty", "Geen bathydata in database"));
  }

  const persistToDb = state.settings?.saveBathy !== false;
  lines.push(
    persistToDb
      ? t("status_bathy_db_enabled", "Nieuwe imports worden in de database opgeslagen")
      : t("status_bathy_db_disabled", "Nieuwe imports worden alleen lokaal opgeslagen")
  );

  el.innerHTML = lines.join("<br>");
}

function shouldPersistBathy() {
  if (state.settings?.saveBathy === undefined) state.settings.saveBathy = true;
  const checkbox = document.getElementById("saveBathy");
  if (checkbox) {
    return checkbox.checked;
  }
  return state.settings.saveBathy !== false;
}

function createImportEntry(file, source) {
  const entry = {
    id: uid("imp"),
    name: file?.name || source || "import",
    source,
    size: file?.size || 0,
    status: "queued",
    message: t("import_status_queued", "In wachtrij"),
    count: 0,
    stored: 0,
    created: new Date().toISOString(),
    scope: "local"
  };
  importHistory = [entry, ...importHistory].slice(0, 50);
  updateImportTable();
  return entry;
}

function updateImportEntry(entry, updates = {}) {
  if (!entry) return;
  Object.assign(entry, updates, { updated: new Date().toISOString() });
  updateImportTable();
}

function updateImportTable() {
  const table = document.querySelector("#importTable tbody");
  if (table) {
    table.innerHTML = "";
  }
  const empty = document.getElementById("importTableEmpty");
  if (empty) empty.hidden = true;
}

function formatDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  } catch (err) {
    return "";
  }
}

  function loadServerImportSummary(showStatus = false) {
    return fetchBathyImports()
      .then(({ list, summary }) => {
        serverImports = Array.isArray(list) ? list : [];
        serverImportSummary = summary || { batches: 0, points: 0 };
        const wasUnavailable = !bathyServerAvailable;
        bathyServerAvailable = true;
        if (wasUnavailable) {
          bathyFetchedBounds = null;
        }
        if ((serverImportSummary.points || 0) > (state.imports?.length || 0)) {
          bathyFetchedBounds = null;
        }
        updateImportStats();
        updateImportTable();
        if ((serverImportSummary.points || 0) > 0 && lastViewportDetail) {
          scheduleBathyViewportFetch(lastViewportDetail);
        }
        if (showStatus) {
          setStatus(t("status_imports_synced", "Lokale imports bijgewerkt"), "ok");
        }
      })
      .catch(err => {
        console.warn("Kon lokale imports niet laden", err);
        bathyServerAvailable = false;
        if (showStatus) {
          setStatus(t("status_imports_sync_error", "Imports konden niet geladen worden"), "error");
        }
      });
  }

  function exportAll() {
    setStatus(t("status_export_all", "Alles exporteren..."));
    try {
      const zip = new JSZip();
      zip.file("state.json", JSON.stringify(state, null, 2));
      zip.file("waters.json", JSON.stringify(state.waters || [], null, 2));
    zip.file("steks.json", JSON.stringify(state.stekken || [], null, 2));
    zip.file("rigs.json", JSON.stringify(state.rigs || [], null, 2));
    zip.file("imports.geojson", JSON.stringify({
      type: "FeatureCollection",
      features: (state.imports || []).map(p => ({
        type: "Feature",
        properties: { depth: p.val ?? p.depth ?? null },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] }
      }))
    }, null, 2));

      return zip
        .generateAsync({ type: "blob" })
        .then(blob => {
          downloadBlob(blob, "vislokaties_export_all.zip", "application/zip");
          setStatus(t("status_export_done", "Export voltooid"), "ok");
        })
        .catch(err => {
          console.error(err);
          setStatus(t("status_export_error", "Fout bij export"), "error");
        });
    } catch (err) {
      console.error(err);
      setStatus(t("status_export_error", "Fout bij export"), "error");
    }
  }

/* ---------- IMPORT QUEUE ---------- */
function queueImport(file) {
  if (!file) return null;
  const source = file.name?.toLowerCase().endsWith(".zip") ? "zip" : "csv";
  const entry = createImportEntry(file, source);
  importQueue.push(file);
  importEntryMap.set(file, entry);
  importTotal += 1;
  updateImportMessage();
  setImportProgress(importProcessed, importTotal);
  updateQueueList();
  processQueue();
  return entry;
}

  function processQueue() {
    if (processing) return;
    const file = importQueue.shift();
    updateQueueList();
    if (!file) {
      if (!importQueue.length) updateImportMessage();
      return;
    }
    processing = true;
    const entry = importEntryMap.get(file);
    currentImportName = file?.name || file?.webkitRelativePath || null;
    updateImportEntry(entry, {
      status: "processing",
      message: t("import_status_processing", "Bezig met import...")
    });
    updateImportMessage(`${t("status_queue_processing", "Bezig met")} ${file.name}...`);
    setImportProgress(importProcessed, importTotal);
    const lower = file.name.toLowerCase();
    const importPromise = lower.endsWith(".zip") ? importZIP(file, entry) : importCSV(file, { entry });

    const finish = () => {
      processing = false;
      currentImportName = null;
      importProcessed += 1;
      setImportProgress(importProcessed, importTotal);
      updateImportMessage();
      if (!importQueue.length) {
        resetImportProgress();
      } else {
        processQueue();
      }
    };

    importPromise
      .then(result => {
        if (result?.dbError) {
          setStatus(`${t("status_import_db_error", "Database opslaan mislukt")}: ${file.name}`, "error");
          return;
        }
        const parts = [`${t("status_import_done", "Import voltooid")}: ${file.name}`];
        const count = result?.count ?? 0;
        if (count > 0) {
          parts.push(`(${count} ${t("detect_points", "Punten")})`);
        } else {
          parts.push(t("import_status_no_new", "Geen nieuwe punten"));
        }
        if (result?.stored) {
          parts.push(`${t("import_status_stored", "DB")}: ${result.stored}`);
        }
        if (result?.duplicates) {
          parts.push(
            t("import_status_duplicates", "Dubbele punten overgeslagen: {count}").replace(
              "{count}",
              result.duplicates
            )
          );
        }
        setStatus(parts.join(" – "), "ok");
      })
      .catch(err => {
        console.error(err);
        if (entry && entry.status !== "warning") {
          updateImportEntry(entry, {
            status: "error",
            message: t("import_status_error", "Import mislukt")
          });
        }
        setStatus(`${t("status_import_error", "Fout bij import van")}: ${file.name}`, "error");
      })
      .then(finish, err => {
        console.error(err);
        finish();
      });
  }

function updateImportMessage(message) {
  const el = document.getElementById("importQueue");
  if (!el) return;
  if (!message && !importQueue.length && !processing) {
    el.textContent = t("import_idle", "Geen actieve import");
    el.className = "panel-note";
    updateQueueList();
    return;
  }
  if (!message && importQueue.length) {
    el.textContent = `${importQueue.length} ${t("status_queue_remaining", "bestand(en) in wachtrij")}`;
  } else if (message) {
    el.textContent = message;
  }
  el.className = "panel-note";
  setImportProgress(importProcessed, importTotal);
}

function setImportProgress(done, total) {
  const bar = document.getElementById("importProgressBar");
  if (bar) {
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
  }
  if (!total) {
    if (bar) {
      bar.style.width = "0%";
      bar.setAttribute("aria-valuenow", "0");
      bar.setAttribute("aria-valuetext", "0%");
    }
    const legacyBar = document.getElementById("impBarAll");
    if (legacyBar) legacyBar.style.width = "0%";
    const countEl = document.getElementById("impCount");
    if (countEl) countEl.textContent = "0/0";
    const pctEl = document.getElementById("impPctAll");
    if (pctEl) pctEl.textContent = "0%";
    return;
  }
  const percent = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  if (bar) {
    bar.style.width = `${percent}%`;
    bar.setAttribute("aria-valuenow", String(percent));
    bar.setAttribute("aria-valuetext", `${percent}%`);
  }
  const legacyBar = document.getElementById("impBarAll");
  if (legacyBar) legacyBar.style.width = `${percent}%`;
  const countEl = document.getElementById("impCount");
  if (countEl) countEl.textContent = `${done}/${total}`;
  const pctEl = document.getElementById("impPctAll");
  if (pctEl) pctEl.textContent = `${percent}%`;
}

function resetImportProgress() {
  importTotal = 0;
  importProcessed = 0;
  setImportProgress(0, 0);
  currentImportName = null;
  updateQueueList();
}

function updateQueueList() {
  const el = document.getElementById("importQueueList");
  if (!el) return;
  const items = [];
  if (currentImportName) items.push(`▶ ${currentImportName}`);
  importQueue.forEach(file => {
    const name = file?.webkitRelativePath || file?.name;
    if (name) items.push(name);
  });
  if (items.length) {
    el.textContent = items.join("\n");
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function detectDelimiter(sampleLine = "") {
  const candidates = [",", ";", "\t"];
  const counts = new Map();
  let inQuotes = false;
  for (let i = 0; i < sampleLine.length; i += 1) {
    const ch = sampleLine[i];
    if (ch === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && candidates.includes(ch)) {
      counts.set(ch, (counts.get(ch) || 0) + 1);
    }
  }
  let best = ",";
  let bestCount = -1;
  candidates.forEach(candidate => {
    const value = counts.get(candidate) ?? 0;
    if (value > bestCount) {
      best = candidate;
      bestCount = value;
    }
  });
  return bestCount > 0 ? best : ",";
}

function parseCSVRows(text) {
  const lines = [];
  const firstLine = text.split(/\r?\n/).find(line => line.trim().length) || "";
  const delimiter = detectDelimiter(firstLine);
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\n") {
      row.push(field.trim());
      field = "";
      if (row.some(cell => cell.length)) {
        lines.push(row);
      }
      row = [];
      continue;
    }
    if (ch === delimiter) {
      row.push(field.trim());
      field = "";
      continue;
    }
    field += ch;
  }
  row.push(field.trim());
  if (row.some(cell => cell.length)) {
    lines.push(row);
  }
  return lines;
}

function parseLocaleNumber(value) {
  if (value === null || value === undefined) return NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^0-9,.-]+/g, "");
  if (!cleaned) return NaN;
  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;
  let normalised = cleaned;
  if (commaCount && !dotCount) {
    normalised = cleaned.replace(/,/g, ".");
  } else if (dotCount && commaCount) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalised = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalised = cleaned.replace(/,/g, "");
    }
  } else if (dotCount > 1 && !commaCount) {
    normalised = cleaned.replace(/\./g, "");
  }
  const num = Number.parseFloat(normalised);
  return Number.isFinite(num) ? num : NaN;
}

function parseBathymetryCSV(text) {
  const sanitized = text.replace(/^\uFEFF/, "");
  const rows = parseCSVRows(sanitized);
  if (!rows.length) {
    throw new Error(t("error_csv_empty", "Leeg CSV-bestand"));
  }
  const headerRaw = rows.shift();
  const header = headerRaw.map(cell => cell.replace(/^"(.*)"$/, "$1").trim());
  const matchIndex = (patterns) =>
    header.findIndex(col => patterns.some(regex => regex.test(col)));

  let latIndex = matchIndex([/^latitude$/i, /gps.*lat/i, /lat/i]);
  let lonIndex = matchIndex([/^longitude$/i, /gps.*lon/i, /(lon|lng)/i]);
  let depthIndex = matchIndex([/^depth( ?\(m\))?$/i, /^(depth|dep|diepte)/i, /depth ?value/i]);

  let dataRows = rows;
  if (latIndex < 0 || lonIndex < 0) {
    latIndex = 0;
    lonIndex = headerRaw.length > 1 ? 1 : 0;
    depthIndex = headerRaw.length > 2 ? 2 : headerRaw.length - 1;
    dataRows = [headerRaw, ...rows];
  }

  if (latIndex < 0 || lonIndex < 0) {
    throw new Error(t("error_csv_columns", "CSV mist lat/lon kolommen"));
  }

  const seen = new Set();
  const points = [];
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  dataRows.forEach(cells => {
    const lat = parseLocaleNumber(cells[latIndex]);
    const lng = parseLocaleNumber(cells[lonIndex]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    if (Math.abs(lat) < 1e-9 && Math.abs(lng) < 1e-9) {
      return;
    }
    const depthValue = depthIndex >= 0 ? parseLocaleNumber(cells[depthIndex]) : NaN;
    if (Number.isFinite(depthValue)) {
      minDepth = Math.min(minDepth, depthValue);
      maxDepth = Math.max(maxDepth, depthValue);
    }
    const depthKey = Number.isFinite(depthValue) ? depthValue.toFixed(2) : "nan";
    const key = `${lat.toFixed(6)},${lng.toFixed(6)},${depthKey}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    points.push({
      lat,
      lng,
      val: Number.isFinite(depthValue) ? depthValue : undefined
    });
  });

  if (!points.length) {
    throw new Error(t("error_csv_empty_points", "CSV bevat geen geldige punten"));
  }

  return {
    points,
    min: Number.isFinite(minDepth) ? minDepth : null,
    max: Number.isFinite(maxDepth) ? maxDepth : null
  };
}

/* ---------- CSV / ZIP IMPORT ---------- */
  export function importCSV(file, meta = {}) {
    setStatus(t("status_csv", "CSV-bestand verwerken..."));
    return file
      .text()
      .then(text => {
        let parsed;
        try {
          parsed = parseBathymetryCSV(text);
        } catch (err) {
          updateImportEntry(meta.entry, {
            status: "error",
            message: err?.message || t("import_status_error", "Import mislukt")
          });
          throw err;
        }
        return applyImports(parsed.points, {
          ...meta,
          fileName: meta.fileName || file.name,
          source: meta.source || "csv",
          stats: parsed
        });
      });
  }

  function importZIP(file, entry) {
    setStatus(t("status_zip", "ZIP uitpakken..."));
    return file
      .arrayBuffer()
      .then(buffer => JSZip.loadAsync(buffer))
      .then(zip => {
        const csvNames = Object.keys(zip.files).filter(name => {
          const item = zip.files[name];
          return !item.dir && name.toLowerCase().endsWith(".csv");
        });
        if (!csvNames.length) {
          throw new Error(t("error_zip_no_csv", "ZIP bevat geen CSV"));
        }

        const imported = [];
        let min = Infinity;
        let max = -Infinity;
        const processed = [];

        const tasks = csvNames.map(name =>
          zip.files[name]
            .async("string")
            .then(csvText => {
              const parsed = parseBathymetryCSV(csvText);
              imported.push(...parsed.points);
              if (Number.isFinite(parsed.min)) min = Math.min(min, parsed.min);
              if (Number.isFinite(parsed.max)) max = Math.max(max, parsed.max);
              processed.push(name);
            })
            .catch(err => {
              console.warn(`CSV ${name} kon niet worden verwerkt`, err);
            })
        );

        return Promise.all(tasks).then(() => {
          if (!imported.length) {
            throw new Error(t("error_zip_no_usable_csv", "ZIP bevat geen bruikbare bathy-data"));
          }

          if (entry) {
            updateImportEntry(entry, {
              message: t("import_status_zip_processed", "ZIP verwerkt ({count} CSV's)").replace(
                "{count}",
                processed.length
              )
            });
          }

          return applyImports(imported, {
            entry,
            source: "zip",
            fileName: file.name,
            zipProcessed: processed.length,
            stats: {
              min: Number.isFinite(min) ? min : null,
              max: Number.isFinite(max) ? max : null
            }
          });
        });
      });
  }

function makeImportKey(point = {}) {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  const depth = Number(point.val ?? point.depth);
  const latKey = Number.isFinite(lat) ? lat.toFixed(6) : String(lat ?? "");
  const lngKey = Number.isFinite(lng) ? lng.toFixed(6) : String(lng ?? "");
  const depthKey = Number.isFinite(depth) ? depth.toFixed(2) : "nan";
  return `${latKey},${lngKey},${depthKey}`;
}

function rebuildImportIndex() {
  rawImportKeys = new Set(rawImports.map(makeImportKey));
}

function syncStateImports() {
  state.imports = rawImports;
}

function mergeImportPoints(points, options = {}) {
  const incoming = Array.isArray(points) ? points : [];
  if (!incoming.length) {
    if (options.updateMeta !== false) {
      setImportMeta({ stored: state.imports.length, total: state.imports.length, truncated: false, dropped: false });
    }
    return { added: 0, duplicates: 0 };
  }

  const existingKeys = rawImportKeys;
  const unique = [];

  incoming.forEach(point => {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    const key = makeImportKey(point);
    if (existingKeys.has(key)) {
      return;
    }
    existingKeys.add(key);
    unique.push({
      lat,
      lng,
      val: Number.isFinite(point.val) ? point.val : Number.isFinite(point.depth) ? point.depth : undefined
    });
  });

  const duplicates = Math.max(0, incoming.length - unique.length);
  if (!unique.length) {
    if (options.updateMeta !== false) {
      setImportMeta({ stored: state.imports.length, total: state.imports.length, truncated: false, dropped: false });
    }
    return { added: 0, duplicates };
  }

  rawImports.push(...unique);
  syncStateImports();

  if (options.updateMeta !== false) {
    setImportMeta({ stored: state.imports.length, total: state.imports.length, truncated: false, dropped: false });
  }

  const shouldSaveState = options.save === true;
  if (shouldSaveState) {
    saveState();
  }

  if (options.refresh !== false) {
    whenMapReady(() => {
      refreshImportLayer();
      if (state.imports?.length) {
        showHeatmap(false);
      }
    });
  }

  if (options.stats !== false) {
    updateOverview();
    updateImportStats();
    document.dispatchEvent(
      new CustomEvent("vislok:bathy-stats", { detail: summarizeDepth(state.imports) })
    );
  }

  return { added: unique.length, duplicates };
}

function applyImports(imported, meta = {}) {
  const incoming = Array.isArray(imported) ? imported : [];
  const { added, duplicates } = mergeImportPoints(incoming, {
    updateMeta: meta.updateMeta !== false,
    save: meta.save !== false,
    refresh: meta.refresh !== false,
    stats: meta.stats !== false
  });

  const persist = meta.persist !== undefined ? meta.persist : shouldPersistBathy();
  const zipMessage = meta.zipProcessed
    ? t("import_status_zip_processed", "ZIP verwerkt ({count} CSV's)").replace(
        "{count}",
        meta.zipProcessed
      )
    : null;
  const formatMessage = base => (zipMessage ? `${zipMessage} – ${base}` : base);

  const hasNewPoints = added > 0;
  const baseStatus = hasNewPoints
    ? persist
      ? t("import_status_saving", "Opslaan in database...")
      : t("import_status_done_local", "Lokaal opgeslagen")
    : t("import_status_no_new", "Geen nieuwe punten");
  const duplicateMessage = duplicates
    ? t("import_status_duplicates", "Dubbele punten overgeslagen: {count}").replace("{count}", duplicates)
    : null;
  const combinedMessage = duplicateMessage ? `${baseStatus} – ${duplicateMessage}` : baseStatus;
  const entryStatus = persist && hasNewPoints ? "saving" : "done";

  updateImportEntry(meta.entry, {
    count: added,
    status: entryStatus,
    message: formatMessage(combinedMessage),
    duplicates,
    stats: meta.stats || null
  });

  let stored = 0;
  let dbError = null;
  if (persist && hasNewPoints) {
    const payload = {
      batchId: meta.entry?.id || uid("import"),
      source: meta.source || "csv",
      file: meta.fileName || null,
      points: rawImports
        .slice(rawImports.length - added)
        .map(p => ({ lat: p.lat, lng: p.lng, val: p.val ?? null }))
    };
    return saveBathyBatch(payload)
      .then(response => {
        stored = response?.stored ?? added;
        updateImportEntry(meta.entry, {
          status: "done",
          stored,
          message: formatMessage(
            duplicateMessage
              ? `${t("import_status_done_server", "Opgeslagen in database")} – ${duplicateMessage}`
              : t("import_status_done_server", "Opgeslagen in database")
          )
        });
        return loadServerImportSummary();
      })
      .catch(err => {
        console.warn("Opslaan in database mislukt", err);
        dbError = err;
        updateImportEntry(meta.entry, {
          status: "warning",
          message: formatMessage(t("import_status_db_error", "Database opslaan mislukt"))
        });
      })
      .then(() => ({ count: added, stored, dbError, duplicates }));
  }

  return Promise.resolve({ count: added, stored, dbError, duplicates });
}

/* ---------- BATHY VIEWPORT ---------- */
function normalizeBoundsInput(raw) {
  if (!raw) return null;
  const src = raw.bounds || raw;
  const south = Number(src.south);
  const west = Number(src.west);
  const north = Number(src.north);
  const east = Number(src.east);
  if (!Number.isFinite(south) || !Number.isFinite(west) || !Number.isFinite(north) || !Number.isFinite(east)) {
    return null;
  }
  const normalized = {
    south: Math.min(south, north),
    west: Math.min(west, east),
    north: Math.max(south, north),
    east: Math.max(west, east)
  };
  if (Number.isFinite(raw.zoom)) {
    normalized.zoom = raw.zoom;
  } else if (Number.isFinite(src.zoom)) {
    normalized.zoom = src.zoom;
  }
  return normalized;
}

function boundsContains(container, target, margin = 0) {
  if (!container || !target) return false;
  return (
    target.south >= container.south - margin &&
    target.west >= container.west - margin &&
    target.north <= container.north + margin &&
    target.east <= container.east + margin
  );
}

function mergeBounds(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return {
    south: Math.min(a.south, b.south),
    west: Math.min(a.west, b.west),
    north: Math.max(a.north, b.north),
    east: Math.max(a.east, b.east)
  };
}

function scheduleBathyViewportFetch(detail) {
  const bounds = normalizeBoundsInput(detail);
  if (!bounds) return;
  lastViewportDetail = { ...bounds };
  if (!bathyServerAvailable) return;
  if (bathyFetchedBounds && boundsContains(bathyFetchedBounds, bounds, BATHY_FETCH_MARGIN)) {
    return;
  }
  bathyFetchQueued = bounds;
  if (!bathyFetchActive) {
    processBathyViewportQueue();
  }
}

function processBathyViewportQueue() {
  if (!bathyFetchQueued) {
    bathyFetchActive = false;
    return;
  }
  const bounds = bathyFetchQueued;
  bathyFetchQueued = null;
  bathyFetchActive = true;

  fetchBathyPoints({
    south: bounds.south,
    west: bounds.west,
    north: bounds.north,
    east: bounds.east
  })
    .then(result => {
      const points = Array.isArray(result?.points) ? result.points : [];
      if (points.length) {
        const mapped = points.map(item => ({
          lat: item.lat,
          lng: item.lng,
          val: Number.isFinite(item.depth) ? item.depth : Number.isFinite(item.val) ? item.val : null
        }));
        mergeImportPoints(mapped, {
          save: false
        });
      }
      bathyFetchedBounds = mergeBounds(bathyFetchedBounds, bounds);
      bathyServerAvailable = true;
    })
    .catch(err => {
      console.warn("Kon bathy-punten voor kaart niet laden", err);
      bathyServerAvailable = false;
    })
    .finally(() => {
      bathyFetchActive = false;
      if (bathyFetchQueued) {
        processBathyViewportQueue();
      }
    });
}

/* ---------- GEOJSON IMPORT ---------- */
  function openGeoJSONDialog() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".geojson,.json";
    input.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (!file) return;
      file
        .text()
        .then(text => {
          let geojson;
          try {
            geojson = JSON.parse(text);
          } catch (err) {
            throw err;
          }
          const features = geojson.features || [];
          const points = features
            .filter(f => f.geometry?.type === "Point")
            .map(f => ({
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              val: f.properties?.value ?? f.properties?.depth
            }));
          return applyImports(points, {
            source: "geojson",
            fileName: file.name
          }).then(result => ({ result, count: points.length }));
        })
        .then(({ result, count }) => {
          if (result?.dbError) {
            setStatus(t("status_import_db_error", "Database opslaan mislukt"), "error");
          } else {
            setStatus(
              `${count} ${t("status_import_points", "punten geïmporteerd")}` +
                (result?.stored ? ` – ${t("import_status_stored", "DB")}: ${result.stored}` : ""),
              "ok"
            );
          }
        })
        .catch(err => {
          console.error(err);
          setStatus("Ongeldig GeoJSON-bestand", "error");
        });
    });
    input.click();
  }

/* ---------- EXPORT ---------- */
export function exportGeoJSON() {
  const features = (state.imports || []).map((p, idx) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: { id: idx + 1, value: p.val ?? null }
  }));
  const geojson = { type: "FeatureCollection", features };
  downloadBlob(JSON.stringify(geojson, null, 2), "vislokaties.geojson", "application/geo+json");
  setStatus("GeoJSON geëxporteerd", "ok");
}

export function exportHTML() {
  setStatus(t("status_export_html", "HTML-bestand genereren..."));
  const html = document.documentElement.outerHTML;
  downloadBlob(html, "vislokaties_page.html", "text/html");
  setStatus(t("status_export_html_done", "Pagina opgeslagen als HTML"), "ok");
}

function exportHTMLWithData() {
  setStatus(t("status_export_html_data", "HTML + data samenstellen..."));
  const html = document.documentElement.outerHTML.replace(
    "</body>",
    `<script>window.__VISLOK_EXPORT__=${JSON.stringify(state)};</script></body>`
  );
  downloadBlob(html, "vislokaties_page_data.html", "text/html");
  setStatus(t("status_export_html_data_done", "HTML + data opgeslagen"), "ok");
}

  export function exportZIP() {
    setStatus(t("status_export_zip", "ZIP maken..."));
    try {
      const zip = new JSZip();
      zip.file("data.json", JSON.stringify(state, null, 2));
      zip.file("readme.txt", "Vis Lokaties data-export");

      return zip
        .generateAsync({ type: "blob" })
        .then(blob => {
          downloadBlob(blob, "vislokaties_data.zip", "application/zip");
          setStatus(t("status_export_zip_done", "ZIP-export voltooid"), "ok");
        })
        .catch(err => {
          console.error(err);
          setStatus(t("status_export_zip_error", "Fout bij ZIP-export"), "error");
        });
    } catch (err) {
      console.error(err);
      setStatus(t("status_export_zip_error", "Fout bij ZIP-export"), "error");
    }
  }

function downloadBlob(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- LOKALE OPSLAG ---------- */
export function localSave() {
  try {
    localStorage.setItem("vislokaties_local_backup", JSON.stringify(state));
    setStatus(t("status_local_saved", "Project lokaal opgeslagen"), "ok");
  } catch (err) {
    setStatus(t("status_local_save_error", "Fout bij lokaal opslaan"), "error");
    console.error(err);
  }
}

export function localLoad() {
  try {
    const data = localStorage.getItem("vislokaties_local_backup");
    if (!data) return setStatus(t("status_local_missing", "Geen lokale back-up gevonden"), "error");
    const parsed = JSON.parse(data);
    Object.assign(state, parsed);
    rawImports = [...(state.imports || [])];
    rebuildImportIndex();
    syncStateImports();
    normalizeImportMeta();
    saveState();
    whenMapReady(() => {
      refreshDataLayers();
      refreshImportLayer();
      if (state.imports?.length) {
        showHeatmap(false);
      } else {
        clearHeatmap(false);
      }
    });
    setStatus(t("status_local_loaded", "Lokaal project geladen"), "ok");
    updateOverview();
  } catch (err) {
    setStatus(t("status_local_load_error", "Fout bij lokaal laden"), "error");
    console.error(err);
  }
}

export function localReset() {
  if (!confirm(t("confirm_local_reset", "Weet je zeker dat je alle lokale data wilt wissen?"))) {
    return;
  }

  localStorage.removeItem("vislokaties_local_backup");
  localStorage.removeItem("vislokaties_state");

  rawImports = [];
  rawImportKeys.clear();
  syncStateImports();
  state.waters = [];
  state.stekken = [];
  state.rigs = [];

  setImportMeta({ stored: 0, total: 0, truncated: false, dropped: false });
  saveState();

  whenMapReady(() => {
    refreshDataLayers();
    refreshImportLayer();
    clearDetection();
    clearHeatmap(false);
  });

  updateOverview();
  updateImportStats();

  setStatus(t("status_local_reset", "Lokale opslag gewist"), "ok");
}

/* ---------- FILTERS ---------- */
function applyDepthFilter() {
  const min = parseFloat(document.getElementById("depthMin")?.value ?? state.filters.depthMin);
  const max = parseFloat(document.getElementById("depthMax")?.value ?? state.filters.depthMax);
  state.filters.depthMin = Number.isFinite(min) ? min : state.filters.depthMin;
  state.filters.depthMax = Number.isFinite(max) ? max : state.filters.depthMax;

  const filtered = rawImports.filter(p => {
    const val = p.val ?? 0;
    return val >= state.filters.depthMin && val <= state.filters.depthMax;
  });
  state.imports = filtered;
  setImportMeta({ stored: filtered.length, total: filtered.length, truncated: false, dropped: false });
  saveState();
  whenMapReady(() => {
    refreshImportLayer();
    if (state.imports?.length) {
      showHeatmap(false);
    } else {
      clearHeatmap(false);
    }
  });
  updateImportStats();
  setStatus(`${filtered.length} ${t("status_filter_match", "punten binnen filter")}`, "ok");
}

function resetDepthFilter() {
  state.filters = { depthMin: 0, depthMax: 10 };
  syncStateImports();
  setImportMeta({ stored: state.imports.length, total: state.imports.length, truncated: false, dropped: false });
  saveState();
  whenMapReady(() => {
    refreshImportLayer();
    if (state.imports?.length) {
      showHeatmap(false);
    } else {
      clearHeatmap(false);
    }
  });
  updateImportStats();
  setStatus(t("status_filter_reset", "Dieptefilter hersteld"), "ok");
}

/* ---------- AUTORIGS & NORMALISEREN ---------- */
function generateAutoRigs() {
  if (!state.stekken?.length) {
    setStatus(t("error_no_steks", "Geen stekken beschikbaar"), "error");
    return;
  }
  const created = [];
  const radius = 30; // meters
  state.stekken.forEach(stek => {
    const bearings = [30, 150, 270];
    bearings.forEach((bearing, idx) => {
      const offset = offsetLatLng(stek.lat, stek.lng, radius, bearing);
      const rig = {
        id: uid("rig"),
        type: "rig",
        name: `${t("auto_rig_label", "Auto rig")} ${stek.name || ""}`.trim() + ` #${idx + 1}`,
        lat: offset.lat,
        lng: offset.lng,
        note: t("auto_rig_note", "Automatisch gegenereerd")
      };
      state.rigs.push(rig);
      created.push(rig);
    });
  });
  saveState();
  whenMapReady(() => refreshDataLayers());
  updateOverview();
  populateTables();
  setStatus(`${created.length} ${t("status_auto_rigs", "auto-rigs aangemaakt")}`, "ok");
}

function offsetLatLng(lat, lng, distanceMeters, bearingDeg) {
  const earthRadius = 6378137;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angular = distanceMeters / earthRadius;

  const newLat = Math.asin(
    Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
  );
  const newLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(newLat)
    );

  return {
    lat: (newLat * 180) / Math.PI,
    lng: ((newLng * 180) / Math.PI + 540) % 360 - 180
  };
}

function normalizeDatabase() {
  const normal = str => (str ? str.toString().trim().replace(/\s+/g, " ").replace(/(^|\s)\S/g, t => t.toUpperCase()) : "");
  [state.waters, state.stekken, state.rigs].forEach(list => {
    list.forEach(item => {
      item.name = normal(item.name);
    });
  });
  saveState();
  whenMapReady(() => refreshDataLayers());
  updateOverview();
  populateTables();
  setStatus(t("status_normalized", "Database genormaliseerd"), "ok");
}


function persistSpot(spot, showStatus = true) {
  ensureSpotRelationships(spot);
  saveState();
  whenMapReady(() => refreshDataLayers());
  updateOverview();
  updateToolbarLinks();
  return saveSpot(spot)
    .then(serverSpot => {
      let applied = spot;
      if (serverSpot) {
        const normalizedServer = normalizeSpotEntry(
          { type: serverSpot.type || spot.type, ...serverSpot },
          serverSpot.type || spot.type
        );
        if (normalizedServer) {
          const list = getListByType(normalizedServer.type || spot.type);
          if (list) {
            const index = list.findIndex(item => item.id === normalizedServer.id);
            if (index >= 0) {
              list[index] = { ...list[index], ...normalizedServer };
              applied = list[index];
            } else {
              list.push(normalizedServer);
              applied = normalizedServer;
            }
          } else {
            applied = normalizedServer;
          }
        }
      }

      saveState();
      whenMapReady(() => refreshDataLayers());
      updateOverview();
      updateToolbarLinks();

      if (showStatus) {
        const typeLabel = spot.type ? t(`label_${spot.type}`, spot.type) : t("status_saved", "opgeslagen");
        setStatus(`${typeLabel} ${t("status_saved", "opgeslagen")}`, "ok");
      }

      return applied;
    })
    .catch(err => {
      console.warn("Kon spot niet naar server schrijven", err);
      if (showStatus) {
        setStatus(t("status_save_error", "Lokaal opgeslagen (server faalde)"), "error");
      }
      throw err;
    });
}

/* ---------- SERVER SYNC ---------- */
  function syncWithServer(pushLocal) {
    const spotPromise = fetchSpots().catch(err => {
      console.warn("Spots ophalen mislukt", err);
      return [];
    });
    const catchPromise = fetchCatches().catch(err => {
      console.warn("Vangsten ophalen mislukt", err);
      return [];
    });

    return Promise.all([spotPromise, catchPromise])
      .then(([spots, catchList]) => {
        if (Array.isArray(spots)) {
          mergeServerData(spots);
          setStatus(`${t("status_sync_done", "Lokale opslag geladen")} (${spots.length})`, "ok");
        }
        if (Array.isArray(catchList)) {
          state.catches = catchList;
          updateCatchList();
          saveState();
        }

      if (!pushLocal) return;
      const all = [...state.waters, ...state.stekken, ...state.rigs];
      return all.reduce(
        (chain, spot) =>
          chain.then(() =>
            saveSpot(spot).catch(err => {
              console.warn("Lokale opslag bijwerken faalde", err);
            })
          ),
        Promise.resolve()
      );
    })
    .then(() => {
      whenMapReady(() => refreshDataLayers());
      updateOverview();
      populateTables();
      updateImportStats();
      return loadServerImportSummary();
    })
    .catch(err => {
      console.warn("Lokale sync faalde", err);
      setStatus(t("status_sync_error", "Lokale opslag niet beschikbaar"), "error");
    });
}

function mergeServerData(records) {
  const waters = records.filter(r => r.type === "water");
  const stekken = records.filter(r => r.type === "stek");
  const rigs = records.filter(r => r.type === "rig");
  if (waters.length) state.waters = dedupe(state.waters, waters, "water");
  if (stekken.length) state.stekken = dedupe(state.stekken, stekken, "stek");
  if (rigs.length) state.rigs = dedupe(state.rigs, rigs, "rig");
  ensureAllRelationships();
  saveState();
}

function dedupe(local, remote, type) {
  const map = new Map();
  local
    .map(entry => normalizeSpotEntry(entry, type))
    .filter(Boolean)
    .forEach(item => {
      map.set(item.id, item);
    });
  remote
    .map(entry => normalizeSpotEntry(entry, type))
    .filter(Boolean)
    .forEach(item => {
      map.set(item.id, item);
    });
  return Array.from(map.values());
}

function resetServerData() {
  if (!confirm(t("confirm_reset_server", "Weet je zeker dat je de serverdata wilt resetten?"))) return;
  resetServer()
    .then(() => {
      state.waters = [];
      state.stekken = [];
      state.rigs = [];
      state.catches = [];
      state.imports = [];
      state.importsMeta = { stored: 0, total: 0 };
      saveState();
      setStatus(t("status_server_reset", "Lokale opslag gewist"), "ok");
      whenMapReady(() => refreshDataLayers());
      populateTables();
    })
    .catch(err => {
      console.error(err);
      setStatus(t("status_server_reset_error", "Lokale reset mislukt"), "error");
    });
}

/* ---------- TABELLEN ---------- */
  export function populateTables() {
    ensureManageUI();
    updateManageTable();
    updateImportStats();
    updateToolbarLinks();
  }

function updateToolbarLinks() {
  const container = document.getElementById("linkSummaryContent");
  if (!container) return;
  const waters = [...(state.waters || [])].sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
  if (!waters.length) {
    container.innerHTML = `<p class="panel-note">${t("link_summary_empty", "Nog geen wateren beschikbaar.")}</p>`;
    return;
  }
  const stekList = [...(state.stekken || [])];
  const rigList = [...(state.rigs || [])];
  const rows = waters.map(water => {
    const steks = stekList
      .filter(s => s.waterId === water.id)
      .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
    const rigsForWater = rigList.filter(r => r.waterId === water.id);
    const counts = t("link_summary_counts", "{stekken} stekken / {rigs} rigs")
      .replace("{stekken}", steks.length)
      .replace("{rigs}", rigsForWater.length);

    const stekItems = steks.length
      ? `<ul class="link-tree">${steks
          .map(stek => {
            const rigs = rigList
              .filter(r => r.stekId === stek.id)
              .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
            const rigPreview = rigs.slice(0, 4).map(r => `<li>${escapeHtml(r.name || r.id)}</li>`).join("");
            const rigOverflow = rigs.length > 4
              ? `<li class="link-more">${t("link_summary_more", "+{count} meer").replace("{count}", rigs.length - 4)}</li>`
              : "";
            const rigBlock = rigs.length
              ? `<ul>${rigPreview}${rigOverflow}</ul>`
              : `<small class="link-empty">${t("link_summary_no_rigs", "Nog geen rigs gekoppeld.")}</small>`;
            return `
              <li>
                <strong>${escapeHtml(stek.name || stek.id)}</strong>
                ${rigBlock}
              </li>
            `;
          })
          .join("")}</ul>`
      : `<p class="link-empty">${t("link_summary_no_steks", "Nog geen stekken voor dit water.")}</p>`;

    return `
      <div class="link-item">
        <strong>${escapeHtml(water.name || water.id)}</strong>
        <span class="link-counts">${counts}</span>
        ${stekItems}
      </div>
    `;
  });

  const unlinkedSteks = stekList.filter(s => !s.waterId);
  const unlinkedRigs = rigList.filter(r => !r.waterId || !r.stekId);
  const extras = [];
  if (unlinkedSteks.length || unlinkedRigs.length) {
    const stekLine = unlinkedSteks.length
      ? `<li>${t("link_unlinked_steks", "Stekken zonder water: {count}").replace("{count}", unlinkedSteks.length)}</li>`
      : "";
    const rigLine = unlinkedRigs.length
      ? `<li>${t("link_unlinked_rigs", "Rigs zonder koppeling: {count}").replace("{count}", unlinkedRigs.length)}</li>`
      : "";
    extras.push(`
      <div class="link-item link-item-unlinked">
        <strong>${t("link_unlinked_heading", "Losse items")}</strong>
        <ul>${stekLine}${rigLine}</ul>
      </div>
    `);
  }

  container.innerHTML = rows.concat(extras).join("");
}

function ensureManageUI() {
  const container = document.getElementById("manageTabs");
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = "true";
  container.innerHTML = `
    <div class="tab-actions" id="manageTabButtons">
      <button data-manage="water" class="active">${t("tab_waters", "🏞️ Wateren")}</button>
      <button data-manage="stek">${t("tab_steks", "🎣 Stekken")}</button>
      <button data-manage="rig">${t("tab_rigs", "🪝 Rigs")}</button>
    </div>
    <div class="manage-table-wrapper">
      <table id="manageTable">
        <thead>
          <tr>
            <th>${t("col_name", "Naam")}</th>
            <th>${t("col_lat", "Lat")}</th>
            <th>${t("col_lon", "Lon")}</th>
            <th>${t("col_value", "Waarde")}</th>
            <th>${t("col_link", "Koppeling")}</th>
            <th>${t("col_actions", "Acties")}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  container.querySelectorAll("button[data-manage]").forEach(btn => {
    btn.addEventListener("click", () => {
      manageActive = btn.dataset.manage;
      container.querySelectorAll("button[data-manage]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateManageTable();
    });
  });
  const table = container.querySelector("#manageTable");
  table.addEventListener("click", ev => {
    const target = ev.target.closest("button[data-action]");
    if (!target) return;
    const id = target.dataset.id;
    const action = target.dataset.action;
    if (!id || !action) return;
    onSpotAction({ detail: { action, id, type: manageActive } });
  });
  table.addEventListener("change", ev => {
    const select = ev.target.closest("select[data-link]");
    if (!select) return;
    const { id } = select.dataset;
    const linkType = select.dataset.link;
    if (!id || !linkType) return;
    if (manageActive === "stek" && linkType === "water") {
      reassignStekWater(id, select.value || null);
    }
    if (manageActive === "rig") {
      if (linkType === "stek") {
        reassignRigStek(id, select.value || null);
      }
      if (linkType === "water") {
        reassignRigWater(id, select.value || null);
      }
    }
  });
}

async function readPhotoInput(input) {
  if (!input?.files?.length) return null;
  const file = input.files[0];
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function handleCatchSubmit(e) {
  e.preventDefault();
  if (!catchFormEls.form) return;
  const stekId = catchFormEls.stek?.value || "";
  let rigId = catchFormEls.rig?.value || "";
  if (rigId && !stekId) {
    const rig = findSpot("rig", rigId);
    if (rig?.stekId) {
      catchFormEls.stek.value = rig.stekId;
    }
  }
  const finalStek = catchFormEls.stek?.value || "";
  if (!finalStek) {
    setStatus(t("error_stek_required", "Kies eerst een stek"), "error");
    return;
  }
  const payload = {
    id: activeCatchId || catchFormEls.id?.value || null,
    stekId: finalStek,
    rigId: rigId || null,
    waterId: findSpot("stek", finalStek)?.waterId || null,
    weightKg: parseFloat(catchFormEls.weightKg?.value || ""),
    weightLbs: parseFloat(catchFormEls.weightLbs?.value || ""),
    lengthCm: parseFloat(catchFormEls.length?.value || ""),
    notes: catchFormEls.notes?.value || "",
    caughtAt: normalizeDateInput(catchFormEls.date?.value)
  };
  if (!Number.isFinite(payload.weightKg)) payload.weightKg = null;
  if (!Number.isFinite(payload.weightLbs)) payload.weightLbs = null;
  if (!Number.isFinite(payload.lengthCm)) payload.lengthCm = null;
  payload.photo = await readPhotoInput(catchFormEls.photo);

  return saveCatch(payload)
    .then(saved => {
      upsertCatch(saved);
      updateCatchList();
      closeCatchModal();
      setStatus(t("status_catch_saved", "Vangst opgeslagen"), "ok");
    })
    .catch(err => {
      console.warn("Catch save failed", err);
      setStatus(t("status_catch_save_error", "Vangst opslaan mislukt"), "error");
    });
}

function normalizeDateInput(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const sec = s || "00";
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);
  return m ? `${m[1]}T${m[2]}` : "";
}

function upsertCatch(entry) {
  if (!entry) return;
  if (!state.catches) state.catches = [];
  const idx = state.catches.findIndex(c => c.id === entry.id);
  if (idx >= 0) {
    state.catches[idx] = { ...state.catches[idx], ...entry };
  } else {
    state.catches.push(entry);
  }
  saveState();
}

function updateManageTable() {
  const container = document.getElementById("manageTabs");
  const table = container?.querySelector("#manageTable tbody");
  if (!table) return;
  const dataMap = {
    water: state.waters || [],
    stek: state.stekken || [],
    rig: state.rigs || []
  };
  const source = dataMap[manageActive] || [];
  const rows = [...source].sort((a, b) => {
    const nameA = (a?.name || "").toLocaleLowerCase();
    const nameB = (b?.name || "").toLocaleLowerCase();
    if (nameA && nameB && nameA !== nameB) return nameA.localeCompare(nameB);
    return (a?.id || "").localeCompare(b?.id || "");
  });

  if (!rows.length) {
    table.innerHTML = `
      <tr class="table-empty">
        <td colspan="6">${t("manage_empty", "Nog geen items beschikbaar")}</td>
      </tr>
    `;
    return;
  }

  table.innerHTML = rows
    .map(item => {
      const lat = Number.isFinite(item?.lat) ? item.lat.toFixed(5) : "-";
      const lng = Number.isFinite(item?.lng) ? item.lng.toFixed(5) : "-";
      const value =
        manageActive === "stek"
          ? item.val ?? ""
          : manageActive === "rig"
          ? item.note || ""
          : item.polygon
          ? t("label_polygon", "poly")
          : "";
      const linkCell = buildLinkCell(item, manageActive);
      const actionButtons = [];
      if (manageActive === "stek" || manageActive === "rig") {
        actionButtons.push(
          `<button data-action="catch" data-id="${escapeHtml(item.id)}">${t("action_add_catch", "Vangst")}</button>`
        );
      }
      actionButtons.push(
        `<button data-action="rename" data-id="${escapeHtml(item.id)}">${t("action_rename", "Hernoem")}</button>`
      );
      actionButtons.push(
        `<button data-action="delete" data-id="${escapeHtml(item.id)}">${t("action_delete", "Verwijder")}</button>`
      );
      return `
        <tr>
          <td>${escapeHtml(item?.name || "-")}</td>
          <td>${lat}</td>
          <td>${lng}</td>
          <td>${escapeHtml(value)}</td>
          <td>${linkCell}</td>
          <td class="table-actions">${actionButtons.join(" ")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderWaterOptions(selectedId) {
  const options = [`<option value="">${t("option_unlinked", "(geen)")}</option>`];
  [...(state.waters || [])]
    .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""))
    .forEach(water => {
      const selected = water.id === selectedId ? " selected" : "";
      options.push(`<option value="${escapeHtml(water.id)}"${selected}>${escapeHtml(water.name || water.id)}</option>`);
    });
  return options.join("");
}

function renderStekOptions(selectedId) {
  const options = [`<option value="">${t("option_unlinked", "(geen)")}</option>`];
  [...(state.stekken || [])]
    .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""))
    .forEach(stek => {
      const selected = stek.id === selectedId ? " selected" : "";
      options.push(`<option value="${escapeHtml(stek.id)}"${selected}>${escapeHtml(stek.name || stek.id)}</option>`);
    });
  return options.join("");
}

function buildLinkCell(item, type) {
  if (type === "water") {
    const stekCount = (state.stekken || []).filter(s => s.waterId === item.id).length;
    const rigCount = (state.rigs || []).filter(r => r.waterId === item.id).length;
    return `<span class="link-summary">${t("link_summary_counts", "{stekken} stekken / {rigs} rigs")
      .replace("{stekken}", stekCount)
      .replace("{rigs}", rigCount)}</span>`;
  }
  if (type === "stek") {
    return `
      <label class="link-select">
        <span>${t("label_link_water", "Water")}</span>
        <select data-link="water" data-id="${item.id}">
          ${renderWaterOptions(item.waterId)}
        </select>
      </label>
    `;
  }
  if (type === "rig") {
    return `
      <div class="link-multi">
        <label class="link-select">
          <span>${t("label_link_stek", "Stek")}</span>
          <select data-link="stek" data-id="${item.id}">
            ${renderStekOptions(item.stekId)}
          </select>
        </label>
        <label class="link-select">
          <span>${t("label_link_water", "Water")}</span>
          <select data-link="water" data-id="${item.id}">
            ${renderWaterOptions(item.waterId)}
          </select>
        </label>
      </div>
    `;
  }
  return "";
}

function renderCatchSelects(selectedStek, selectedRig) {
  if (!catchFormEls.stek || !catchFormEls.rig) return;
  catchFormEls.stek.innerHTML = renderStekOptions(selectedStek || "");
  const rigOptions = [`<option value="">${t("option_unlinked", "(geen)")}</option>`];
  [...(state.rigs || [])]
    .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""))
    .forEach(rig => {
      const selected = rig.id === selectedRig ? " selected" : "";
      rigOptions.push(`<option value="${escapeHtml(rig.id)}"${selected}>${escapeHtml(rig.name || rig.id)}</option>`);
    });
  catchFormEls.rig.innerHTML = rigOptions.join("");
}

function bindCatchForm() {
  renderCatchSelects();
  updateCatchList();
  catchFormEls.form?.addEventListener("submit", handleCatchSubmit);
  catchFormEls.stek?.addEventListener("change", updateCatchSelectionLabel);
  catchFormEls.rig?.addEventListener("change", () => {
    const rigId = catchFormEls.rig.value;
    if (rigId) {
      const rig = findSpot("rig", rigId);
      if (rig?.stekId && catchFormEls.stek) catchFormEls.stek.value = rig.stekId;
    }
    updateCatchSelectionLabel();
  });
  const syncWeights = (source, target, factor) => {
    source?.addEventListener("input", () => {
      const val = parseFloat(source.value);
      if (!Number.isFinite(val)) {
        target.value = "";
        return;
      }
      target.value = (val * factor).toFixed(1);
    });
  };
  syncWeights(catchFormEls.weightKg, catchFormEls.weightLbs, 2.20462);
  syncWeights(catchFormEls.weightLbs, catchFormEls.weightKg, 0.453592);

  catchFormEls.cancelBtn?.addEventListener("click", closeCatchModal);
  catchFormEls.deleteBtn?.addEventListener("click", handleCatchDelete);
  catchFormEls.list?.addEventListener("click", handleCatchListClick);
}

function focusCatchForm(detail = {}) {
  openCatchModal({ stekId: detail.stekId, rigId: detail.rigId, scroll: true });
}

function openCatchModal(detail = {}) {
  if (!catchFormEls.form) return;
  const existing = detail.forceNew ? null : detail.catchId ? state.catches?.find(c => c.id === detail.catchId) : null;
  activeCatchId = existing?.id || null;
  catchFormEls.id.value = existing?.id || "";
  renderCatchSelects(detail.stekId || existing?.stek_id, detail.rigId || existing?.rig_id);
  if (catchFormEls.stek) catchFormEls.stek.value = detail.stekId || existing?.stek_id || "";
  if (catchFormEls.rig) catchFormEls.rig.value = detail.rigId || existing?.rig_id || "";
  if (catchFormEls.weightKg) catchFormEls.weightKg.value = Number.isFinite(existing?.weight_kg) ? existing.weight_kg : "";
  if (catchFormEls.weightLbs) catchFormEls.weightLbs.value = Number.isFinite(existing?.weight_lbs) ? existing.weight_lbs : "";
  if (catchFormEls.length) catchFormEls.length.value = Number.isFinite(existing?.length_cm) ? existing.length_cm : "";
  if (catchFormEls.notes) catchFormEls.notes.value = existing?.notes || "";
  if (catchFormEls.date) catchFormEls.date.value = toDatetimeLocal(existing?.caught_at);
  if (catchFormEls.photo) catchFormEls.photo.value = "";
  if (catchFormEls.deleteBtn) catchFormEls.deleteBtn.hidden = !existing;
  updateCatchSelectionLabel();
  if (detail.scroll && catchFormEls.form) {
    catchFormEls.form.scrollIntoView({ behavior: "smooth" });
  }
}

function closeCatchModal() {
  activeCatchId = null;
  if (catchFormEls.form) catchFormEls.form.reset();
  updateCatchSelectionLabel();
}

function handleCatchListClick(ev) {
  const btn = ev.target.closest("button[data-catch-id]");
  if (!btn) return;
  const id = btn.dataset.catchId;
  if (!id) return;
  openCatchModal({ catchId: id, scroll: true });
}

function handleCatchDelete() {
  if (!activeCatchId) {
    closeCatchModal();
    return;
  }
  if (!window.confirm(t("confirm_delete_catch", "Vangst verwijderen?"))) return;
  deleteCatch(activeCatchId)
    .then(() => {
      state.catches = (state.catches || []).filter(c => c.id !== activeCatchId);
      updateCatchList();
      setStatus(t("status_catch_deleted", "Vangst verwijderd"), "ok");
      closeCatchModal();
    })
    .catch(err => {
      console.warn("Catch delete failed", err);
      setStatus(t("status_catch_delete_error", "Verwijderen mislukt"), "error");
    });
}

function updateCatchSelectionLabel() {
  if (!catchFormEls.selectionLabel && !catchFormEls.summaryLabel) return;
  const stekId = catchFormEls.stek?.value || "";
  const rigId = catchFormEls.rig?.value || "";
  const stek = stekId ? findSpot("stek", stekId) : null;
  const rig = rigId ? findSpot("rig", rigId) : null;
  if (rig && !stek && rig.stekId) {
    const parent = findSpot("stek", rig.stekId);
    if (parent) {
      catchFormEls.stek.value = parent.id;
    }
  }
  const label = rig
    ? t("catch_selected_rig", "Rig: {rig} (stek {stek})")
        .replace("{rig}", rig.name || rig.id)
        .replace("{stek}", (stek || findSpot("stek", rig?.stekId || ""))?.name || "-")
    : stek
    ? t("catch_selected_stek", "Stek: {stek}").replace("{stek}", stek.name || stek.id)
    : t("catch_selection_placeholder", "Kies een stek of rig om een vangst vast te leggen.");
  if (catchFormEls.selectionLabel) catchFormEls.selectionLabel.textContent = label;
  if (catchFormEls.summaryLabel) catchFormEls.summaryLabel.textContent = label;
}

function updateCatchList() {
  const listEl = catchFormEls.list;
  if (!listEl) return;
  if (!state.catches?.length) {
    listEl.textContent = t("catch_list_empty", "Nog geen vangsten.");
    return;
  }
  const rows = state.catches
    .slice()
    .sort((a, b) => (b.caught_at || b.created_at || "").localeCompare(a.caught_at || a.created_at || ""))
    .map(c => {
      const stek = findSpot("stek", c.stek_id || "");
      const rig = findSpot("rig", c.rig_id || "");
      const name = rig?.name || stek?.name || c.stek_id || c.rig_id || c.id;
      const weight = Number.isFinite(c.weight_kg)
        ? `${c.weight_kg.toFixed(1)} kg / ${(c.weight_lbs ?? 0).toFixed(1)} lbs`
        : "-";
      const when = c.caught_at ? c.caught_at.split(" ")[0] : "";
      return `
        <div class="catch-row">
          <div><strong>${escapeHtml(name || "-" )}</strong>${when ? ` · ${escapeHtml(when)}` : ""}</div>
          <div class="catch-row-meta">${weight}</div>
          <div class="catch-row-actions"><button data-catch-id="${escapeHtml(c.id)}" data-i18n="btn_edit_catch">✏️ Bewerken</button></div>
        </div>`;
    });
  listEl.innerHTML = rows.join("");
}

function reassignStekWater(id, waterId) {
  const stek = findSpot("stek", id);
  if (!stek) return;
  stek.waterId = waterId || null;
  ensureSpotRelationships(stek);
  persistSpot(stek, false)
    .then(() => {
      populateTables();
      updateToolbarLinks();
      setStatus(t("status_link_updated", "Koppeling bijgewerkt"), "ok");
    })
    .catch(() => {
      setStatus(t("status_link_error", "Koppeling bijwerken mislukt"), "error");
    });
}

function reassignRigStek(id, stekId) {
  const rig = findSpot("rig", id);
  if (!rig) return;
  rig.stekId = stekId || null;
  ensureSpotRelationships(rig);
  persistSpot(rig, false)
    .then(() => {
      populateTables();
      updateToolbarLinks();
      setStatus(t("status_link_updated", "Koppeling bijgewerkt"), "ok");
    })
    .catch(() => {
      setStatus(t("status_link_error", "Koppeling bijwerken mislukt"), "error");
    });
}

function reassignRigWater(id, waterId) {
  const rig = findSpot("rig", id);
  if (!rig) return;
  rig.waterId = waterId || null;
  ensureSpotRelationships(rig);
  persistSpot(rig, false)
    .then(() => {
      populateTables();
      updateToolbarLinks();
      setStatus(t("status_link_updated", "Koppeling bijgewerkt"), "ok");
    })
    .catch(() => {
      setStatus(t("status_link_error", "Koppeling bijwerken mislukt"), "error");
    });
}

/* ---------- AUTOSAVE ---------- */
export function autoSave() {
  saveState();
  log("Autosave uitgevoerd");
}

export function forceServerSync(pushLocal = true) {
  return syncWithServer(pushLocal);
}

window.VisLokData = { forceServerSync };

/* ---------- EVENTKOPPELINGEN ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initData();
});

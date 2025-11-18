/* =======================================================
   Vis Lokaties — core.js
   Centrale app-logica: thema, status, opslag, versiebeheer
   Versie: 0.0.0
   ======================================================= */

export const APP_VERSION = "0.0.0";
export const TOOLBAR_MIN_WIDTH = 280;
export const TOOLBAR_MAX_WIDTH = 520;
export const TOOLBAR_DEFAULT_WIDTH = 340;
export let state = {
  theme: "dark",
  language: "nl",
  gpsActive: false,
  center: [52.1, 5.1],
  zoom: 8,
  baseLayer: "osm",
  imports: [],
  importsMeta: { stored: 0, total: 0, truncated: false, dropped: false },
  waters: [],
  stekken: [],
  rigs: [],
  catches: [],
  lastDetection: null,
  settings: {
    heatmapRadius: 25,
    heatmapBlur: 15,
    heatmapMin: 0,
    heatmapMax: 10,
    heatmapInvert: false,
    heatmapClamp: false,
    cluster: true,
    tooltipDepth: true,
    detectionRadius: 200,
    maxEdge: 60,
    saveBathy: true,
    autoSync: true,
    showImports: false,
    showData: true,
    showWeather: true,
    showContours: true,
    showCatches: true,
    showManage: true,
    showOverview: true,
    showChangelog: true,
    allowManualWater: true,
    autoLink: true,
    toolbarDrag: true,
    panelOrder: [],
    toolbarWidth: TOOLBAR_DEFAULT_WIDTH
  },
  filters: {
    depthMin: 0,
    depthMax: 10
  },
  weather: {
    density: 5,
    overlay: false
  },
  version: {
    current: APP_VERSION,
    releases: []
  }
};

function clampToolbarWidth(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return TOOLBAR_DEFAULT_WIDTH;
  }
  return Math.min(TOOLBAR_MAX_WIDTH, Math.max(TOOLBAR_MIN_WIDTH, Math.round(num)));
}

export function setToolbarWidth(width, persist = true) {
  const clamped = clampToolbarWidth(width);
  const root = document.documentElement;
  if (root) {
    root.style.setProperty("--sidebar-width", `${clamped}px`);
  }
  if (!state.settings) {
    state.settings = {};
  }
  state.settings.toolbarWidth = clamped;
  if (persist) {
    saveState();
  }
  const display = document.getElementById("toolbarWidthValue");
  if (display) {
    display.textContent = `${clamped}px`;
  }
  const slider = document.getElementById("toolbarWidthControl");
  if (slider && slider !== document.activeElement) {
    slider.value = String(clamped);
  }
  return clamped;
}

/* ---------- STATUS EN LOG ---------- */
export function setStatus(text, type = "info") {
  const el = document.getElementById("statusLine");
  if (!el) return;
  el.textContent = `Status: ${text}`;
  el.style.color =
    type === "error" ? "#f55" : type === "ok" ? "#0f0" : "#ccc";
  console.log(`[${type}] ${text}`);
}

export function setFooterInfo({
  mouse,
  zoom,
  detect,
  depth
} = {}) {
  if (mouse !== undefined) {
    const mouseEl = document.getElementById("mouseLL");
    if (mouseEl) mouseEl.textContent = mouse;
  }
  if (zoom !== undefined) {
    const zoomEl = document.getElementById("zoomLbl");
    if (zoomEl) zoomEl.textContent = zoom;
  }
  if (detect !== undefined) {
    const detectEl = document.getElementById("detectInfo");
    if (detectEl) detectEl.textContent = detect;
  }
  if (depth !== undefined) {
    const depthEl = document.getElementById("depthInfo");
    if (depthEl) depthEl.textContent = depth;
  }
}

function applyVersionInfo(info) {
  const current = info?.current || APP_VERSION;
  const releases = Array.isArray(info?.releases) ? info.releases : [];
  state.version = { current, releases };
  const label = document.getElementById("versionLabel");
  if (label) {
    label.textContent = `v${current}`;
  }
  return current;
}

export function loadVersionInfo(showStatus = false) {
  return fetch('api/get_version.php')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      const version = applyVersionInfo(data?.version || {});
      if (showStatus) {
        setStatus(`Versiegegevens bijgewerkt (v${version})`, 'ok');
      }
      log(`Versiegegevens geladen: v${version}`);
      return version;
    })
    .catch(err => {
      console.warn('Kon versiegegevens niet laden', err);
      if (showStatus) {
        setStatus('Kon versiegegevens niet laden', 'error');
      }
      return APP_VERSION;
    });
}

export function log(...args) {
  console.log("[VisLokaties]", ...args);
}

/* ---------- THEMA ---------- */
export function toggleTheme() {
  const link = document.getElementById("theme");
  const newTheme = state.theme === "dark" ? "light" : "dark";
  link.href = `assets/css/style-${newTheme}.css`;
  state.theme = newTheme;
  saveState();
  setStatus(`Thema gewijzigd naar ${newTheme}`, "ok");
}

/* ---------- OPSLAG ---------- */
export function saveState() {
  const persistable = buildPersistableState();
  state.importsMeta = { ...persistable.importsMeta };
  const payload = JSON.stringify(persistable);
  try {
    localStorage.setItem("vislokaties_state", payload);
    if (persistable.importsMeta?.truncated || persistable.importsMeta?.dropped) {
      dispatchStorageEvent("vislok:storage-truncated", persistable.importsMeta);
    }
  } catch (e) {
    if (isQuotaError(e)) {
      console.warn("Kon state niet opslaan wegens opslaglimiet, probeer imports te trimmen", e);
      const fallbackMeta = {
        stored: 0,
        total: state.imports?.length || 0,
        truncated: state.imports?.length > 0,
        dropped: true
      };
      const fallback = {
        ...persistable,
        imports: [],
        importsMeta: fallbackMeta
      };
      state.importsMeta = { ...fallbackMeta };
      try {
        localStorage.setItem("vislokaties_state", JSON.stringify(fallback));
        dispatchStorageEvent("vislok:storage-truncated", fallbackMeta);
      } catch (innerErr) {
        console.warn("Fallback-opslag zonder imports mislukte", innerErr);
        dispatchStorageEvent("vislok:storage-error", { error: innerErr });
      }
    } else {
      console.warn("Kon state niet opslaan:", e);
      dispatchStorageEvent("vislok:storage-error", { error: e });
    }
  }
}

export function loadState() {
  try {
    const saved = localStorage.getItem("vislokaties_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      state = {
        ...state,
        ...parsed,
        settings: { ...state.settings, ...(parsed.settings || {}) },
        filters: { ...state.filters, ...(parsed.filters || {}) },
        weather: { ...state.weather, ...(parsed.weather || {}) }
      };
      const meta = parsed.importsMeta || {};
      state.importsMeta = {
        stored: Number.isFinite(meta.stored) ? meta.stored : state.imports.length,
        total: Number.isFinite(meta.total) ? meta.total : state.imports.length,
        truncated: !!meta.truncated,
        dropped: !!meta.dropped
      };
      log("State geladen:", state);
    }
  } catch (e) {
    console.warn("Kon state niet laden:", e);
  }
}

export function clearCache() {
  localStorage.removeItem("vislokaties_state");
  setStatus("Lokale cache gewist", "ok");
}

/* ---------- INITIALISATIE ---------- */
export function initCore() {
  loadState();
  const initialWidth = state.settings?.toolbarWidth ?? TOOLBAR_DEFAULT_WIDTH;
  setToolbarWidth(initialWidth, false);
  const versionLabel = document.getElementById("versionLabel");
  if (versionLabel) {
    const versionText = state.version?.current || APP_VERSION;
    versionLabel.textContent = `v${versionText}`;
  }
  document.documentElement.lang = state.language;

  // Thema laden
  const link = document.getElementById("theme");
  link.href = `assets/css/style-${state.theme}.css`;

  // Knoppen koppelen
  const btnTheme = document.getElementById("btnTheme");
  if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

  const btnResetCache = document.getElementById("btnResetCache");
  if (btnResetCache) btnResetCache.addEventListener("click", clearCache);

  const baseSelect = document.getElementById("baseLayerSelect");
  if (baseSelect) {
    baseSelect.value = state.baseLayer || "osm";
    baseSelect.addEventListener("change", () => {
      state.baseLayer = baseSelect.value;
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:basemap", { detail: baseSelect.value }));
    });
  }

  const detectRadius = document.getElementById("detectRadius");
  if (detectRadius) {
    detectRadius.value = state.settings.detectionRadius;
    detectRadius.addEventListener("input", () => {
      state.settings.detectionRadius = parseInt(detectRadius.value, 10);
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:detect-radius", { detail: state.settings.detectionRadius }));
    });
  }

  const detectMaxEdge = document.getElementById("detectMaxEdge");
  if (detectMaxEdge) {
    detectMaxEdge.value = state.settings.maxEdge;
    detectMaxEdge.addEventListener("change", () => {
      state.settings.maxEdge = parseFloat(detectMaxEdge.value);
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:max-edge", { detail: state.settings.maxEdge }));
    });
  }

  const heatRadius = document.getElementById("heatRadius");
  if (heatRadius) {
    heatRadius.value = state.settings.heatmapRadius;
    heatRadius.addEventListener("input", () => {
      state.settings.heatmapRadius = parseInt(heatRadius.value, 10);
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:heat-radius", { detail: state.settings.heatmapRadius }));
    });
  }

  const heatBlur = document.getElementById("heatBlur");
  if (heatBlur) {
    heatBlur.value = state.settings.heatmapBlur;
    heatBlur.addEventListener("input", () => {
      state.settings.heatmapBlur = parseInt(heatBlur.value, 10);
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:heat-blur", { detail: state.settings.heatmapBlur }));
    });
  }

  const heatMin = document.getElementById("heatMin");
  if (heatMin) {
    heatMin.value = state.settings.heatmapMin;
    heatMin.addEventListener("change", () => {
      state.settings.heatmapMin = parseFloat(heatMin.value);
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:heat-min", { detail: state.settings.heatmapMin }));
    });
  }

  const heatMax = document.getElementById("heatMax");
  if (heatMax) {
    heatMax.value = state.settings.heatmapMax;
    heatMax.addEventListener("change", () => {
      state.settings.heatmapMax = parseFloat(heatMax.value);
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:heat-max", { detail: state.settings.heatmapMax }));
    });
  }

  const heatInvert = document.getElementById("heatInvert");
  if (heatInvert) {
    heatInvert.checked = state.settings.heatmapInvert;
    heatInvert.addEventListener("change", () => {
      state.settings.heatmapInvert = heatInvert.checked;
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:heat-invert", { detail: state.settings.heatmapInvert }));
    });
  }

  const heatClamp = document.getElementById("heatClamp");
  if (heatClamp) {
    heatClamp.checked = state.settings.heatmapClamp;
    heatClamp.addEventListener("change", () => {
      state.settings.heatmapClamp = heatClamp.checked;
      saveState();
      document.dispatchEvent(new CustomEvent("vislok:heat-clamp", { detail: state.settings.heatmapClamp }));
    });
  }

  // Versie tonen
  loadVersionInfo();
  const activeVersion = state.version?.current || APP_VERSION;
  log(`Vis Lokaties v${activeVersion} gestart`);
  setStatus("Gereed");
}

function buildPersistableState() {
  const base = { ...state, imports: [], importsMeta: state.importsMeta };
  const persist = safeClone(base);
  const imports = Array.isArray(state.imports) ? state.imports : [];
  const sanitized = imports
    .map(point => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      const depth = Number(point?.val ?? point?.depth);
      const entry = {};
      if (Number.isFinite(lat)) entry.lat = lat;
      if (Number.isFinite(lng)) entry.lng = lng;
      if (Number.isFinite(depth)) entry.val = depth;
      if (Object.keys(entry).length === 0) return null;
      return entry;
    })
    .filter(Boolean);

  persist.imports = sanitized;
  persist.importsMeta = {
    stored: sanitized.length,
    total: imports.length,
    truncated: false,
    dropped: false
  };
  return persist;
}

function safeClone(value) {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    if (Array.isArray(value)) {
      return value.map(item => safeClone(item));
    }
    if (typeof value === "object") {
      return Object.keys(value).reduce((acc, key) => {
        acc[key] = safeClone(value[key]);
        return acc;
      }, {});
    }
    return value;
  }
}

function isQuotaError(error) {
  if (!error) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.code === 22 ||
    error.code === 1014 ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

function dispatchStorageEvent(name, detail) {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") return;
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/* ---------- EXPORT ALS MODULE ---------- */
window.VisLokCore = {
  initCore,
  toggleTheme,
  setStatus,
  log,
  saveState,
  loadState,
  clearCache,
  state,
  setFooterInfo,
  loadVersionInfo
};

/* ---------- AUTO-INIT BIJ LADEN ---------- */
document.addEventListener("DOMContentLoaded", initCore);

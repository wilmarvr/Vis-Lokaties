/* =======================================================
   Vis Lokaties — core.js
   Centrale app-logica: thema, status, opslag, versiebeheer
   Versie: 0.0.0
   ======================================================= */

export const APP_VERSION = "0.0.0";
export let state = {
  theme: "dark",
  language: "nl",
  gpsActive: false,
  center: [52.1, 5.1],
  zoom: 8,
  baseLayer: "osm",
  imports: [],
  waters: [],
  stekken: [],
  rigs: [],
  settings: {
    heatmapRadius: 25,
    heatmapBlur: 15,
    cluster: true,
    tooltipDepth: true,
    detectionRadius: 200,
    maxEdge: 60
  },
  filters: {
    depthMin: 0,
    depthMax: 10
  }
};

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
  try {
    localStorage.setItem("vislokaties_state", JSON.stringify(state));
  } catch (e) {
    console.warn("Kon state niet opslaan:", e);
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
        filters: { ...state.filters, ...(parsed.filters || {}) }
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
  document.getElementById("versionLabel").textContent = `v${APP_VERSION}`;

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
    });
  }

  // Versie tonen
  log(`Vis Lokaties v${APP_VERSION} gestart`);
  setStatus("Gereed");
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
  setFooterInfo
};

/* ---------- AUTO-INIT BIJ LADEN ---------- */
document.addEventListener("DOMContentLoaded", initCore);

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
  settings: {
    heatmapRadius: 25,
    heatmapBlur: 15,
    cluster: true,
    tooltipDepth: true
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
      state = { ...state, ...JSON.parse(saved) };
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
  state
};

/* ---------- AUTO-INIT BIJ LADEN ---------- */
document.addEventListener("DOMContentLoaded", initCore);

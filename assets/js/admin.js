/* =======================================================
   Vis Lokaties — admin.js
   Adminpaneel voor databaseconfiguratie, synchronisatie en versiebeheer
   Versie: 0.0.0
   ======================================================= */

import { setStatus, state, saveState, loadVersionInfo, applyVersionInfo } from "./core.js?v=20250715";
import { t } from "./i18n.js?v=20250715";
import { escapeHtml } from "./helpers.js?v=20250715";

const FEATURE_DEFAULTS = {
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
  cluster: true,
  showImports: false,
  saveBathy: true,
  autoSync: true,
  heatmapInvert: false,
  heatmapClamp: false
};

const SETTING_DEFAULTS = {
  detectionRadius: 200,
  maxEdge: 60,
  heatmapRadius: 25,
  heatmapBlur: 15,
  heatmapMin: 0,
  heatmapMax: 10
};

function initAdmin() {
  const form = document.getElementById("adminConfigForm");
  const versionForm = document.getElementById("adminVersionForm");
  if (!form && !versionForm) return;

  const statusEl = document.getElementById("adminStatus");
  const optionInputs = Array.from(document.querySelectorAll("[data-option]"));
  const settingInputs = Array.from(document.querySelectorAll("[data-setting]"));

  const versionCurrent = document.getElementById("adminVersionCurrent");
  const versionDate = document.getElementById("adminVersionDate");
  const versionNotes = document.getElementById("adminVersionNotes");
  const versionSetCurrent = document.getElementById("adminVersionSetCurrent");
  const versionStatus = document.getElementById("adminVersionStatus");
  const versionHistory = document.getElementById("versionHistory");

  function setPanelMessage(key, fallback, type = "info") {
    if (!form) return;
    const message = t(key, fallback);
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.classList.remove("error", "success");
      if (type === "error") statusEl.classList.add("error");
      if (type === "ok" || type === "success") statusEl.classList.add("success");
    }
    setStatus(message, type === "error" ? "error" : type === "success" || type === "ok" ? "ok" : "info");
  }

  function setVersionMessage(key, fallback, type = "info") {
    if (!versionStatus) return;
    const message = t(key, fallback);
    versionStatus.textContent = message;
    versionStatus.classList.remove("error", "success");
    if (type === "error") versionStatus.classList.add("error");
    if (type === "ok" || type === "success") versionStatus.classList.add("success");
    if (type === "error") {
      setStatus(message, "error");
    }
  }

  function renderVersionHistory(list = []) {
    if (!versionHistory) return;
    const entries = Array.isArray(list) ? list : [];
    if (!entries.length) {
      versionHistory.innerHTML = `<li class="version-empty">${t(
        "admin_version_history_empty",
        "Nog geen versies opgeslagen"
      )}</li>`;
      return;
    }

    const currentVersion = state.version?.current || "0.0.0";
    const items = entries.slice(0, 12).map(rel => {
      const version = escapeHtml(rel?.version || "");
      const date = escapeHtml(rel?.date || "");
      const notesText = rel?.notes ? escapeHtml(rel.notes).replace(/\n/g, "<br />") : "";
      const noteMarkup = notesText ? `<p>${notesText}</p>` : "";
      const isCurrent = rel?.version === currentVersion;
      const classes = `version-entry${isCurrent ? " current" : ""}`;
      return `<li class="${classes}"><div class="version-entry-header"><strong>v${version}</strong><span>${date}</span></div>${noteMarkup}</li>`;
    });

    versionHistory.innerHTML = items.join("\n");
  }

  function refreshVersionForm() {
    const info = state.version || {};
    const current = info.current || "0.0.0";
    const releases = Array.isArray(info.releases) ? info.releases : [];
    const today = new Date().toISOString().slice(0, 10);
    const primary = releases.find(rel => rel.version === current) || releases[0] || null;

    if (versionCurrent) versionCurrent.value = current;
    if (versionDate) versionDate.value = primary?.date || today;
    if (versionNotes) versionNotes.value = primary?.notes || "";
    if (versionSetCurrent) versionSetCurrent.checked = true;

    renderVersionHistory(releases);
  }

  function buildVersionPayload() {
    const existingCurrent = state.version?.current || "0.0.0";
    const versionValue = versionCurrent?.value?.trim() || existingCurrent || "0.0.0";
    const dateValue = versionDate?.value || new Date().toISOString().slice(0, 10);
    const notesValue = versionNotes?.value?.trim() || "";

    const entry = {
      version: versionValue,
      date: dateValue,
      notes: notesValue
    };

    const releases = Array.isArray(state.version?.releases) ? [...state.version.releases] : [];
    const existingIndex = releases.findIndex(rel => rel.version === entry.version && rel.date === entry.date);
    if (existingIndex >= 0) {
      releases[existingIndex] = entry;
    } else {
      releases.unshift(entry);
    }

    const seen = new Set();
    const normalized = [];
    for (const rel of releases) {
      if (!rel) continue;
      const key = `${rel.version}|${rel.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(rel);
      if (normalized.length >= 50) break;
    }

    const makeCurrent = versionSetCurrent ? !!versionSetCurrent.checked : true;
    const current = makeCurrent ? entry.version : existingCurrent;

    return { payload: { current, releases: normalized }, entry };
  }

  function readOptions() {
    const values = { ...FEATURE_DEFAULTS };
    optionInputs.forEach(input => {
      const key = input.dataset.option;
      if (!key) return;
      values[key] = input.checked;
    });
    return values;
  }

  function readSettings() {
    const values = { ...SETTING_DEFAULTS };
    settingInputs.forEach(input => {
      const key = input.dataset.setting;
      if (!key) return;
      const parsed = parseFloat(input.value);
      values[key] = Number.isFinite(parsed) ? parsed : SETTING_DEFAULTS[key];
    });
    return values;
  }

  function applyOptions(options = {}) {
    const normalized = { ...FEATURE_DEFAULTS, ...(options || {}) };
    optionInputs.forEach(input => {
      const key = input.dataset.option;
      if (!key) return;
      input.checked = normalized[key] !== false;
    });
    if (!state.settings) state.settings = {};
    Object.keys(FEATURE_DEFAULTS).forEach(key => {
      state.settings[key] = normalized[key] !== false;
    });
    saveState();
  }

  function applySettings(settings = {}) {
    const normalized = { ...SETTING_DEFAULTS, ...(settings || {}) };
    settingInputs.forEach(input => {
      const key = input.dataset.setting;
      if (!key) return;
      const value = normalized[key];
      if (input.type === "number") {
        input.value = value;
      }
    });
    if (!state.settings) state.settings = {};
    Object.keys(SETTING_DEFAULTS).forEach(key => {
      const val = normalized[key];
      state.settings[key] = Number.isFinite(val) ? val : SETTING_DEFAULTS[key];
    });
    saveState();
  }

  function readFormConfig() {
    return {
      options: readOptions(),
      settings: readSettings()
    };
  }

  function applyConfig(config = {}) {
    if (config.options) {
      applyOptions(config.options);
    } else {
      applyOptions();
    }
    if (config.settings) {
      applySettings(config.settings);
    } else {
      applySettings();
    }
  }

  function loadConfig() {
    if (!form) return;
    applyConfig({ options: state.settings || FEATURE_DEFAULTS, settings: state.settings || SETTING_DEFAULTS });
    setPanelMessage("admin_status_loaded", "Configuratie geladen", "ok");
  }

    if (form) {
      optionInputs.forEach(input => {
        input.addEventListener("change", () => {
          const key = input.dataset.option;
          const checked = input.checked;
          if (key) {
            if (!state.settings) state.settings = {};
            state.settings[key] = checked;
            saveState();
          }
          setPanelMessage(
            "admin_status_option_changed",
            "Opties bijgewerkt. Klik Opslaan om te bewaren.",
            "info"
          );
        });
      });

      settingInputs.forEach(input => {
        input.addEventListener("change", () => {
          const key = input.dataset.setting;
          if (!key) return;
          const val = parseFloat(input.value);
          const normalized = Number.isFinite(val) ? val : SETTING_DEFAULTS[key];
          if (!state.settings) state.settings = {};
          state.settings[key] = normalized;
          saveState();
          setPanelMessage(
            "admin_status_option_changed",
            "Opties bijgewerkt. Klik Opslaan om te bewaren.",
            "info"
          );
        });
      });

      form.addEventListener("submit", e => {
        e.preventDefault();
        const payload = readFormConfig();
        applyConfig(payload);
        setPanelMessage("admin_status_saved", "Configuratie opgeslagen", "ok");
      });

      setPanelMessage("admin_status_test_ok", "Lokale opslag actief", "ok");

      loadConfig();
    }

  if (versionForm) {
    versionForm.addEventListener("submit", e => {
      e.preventDefault();
      const { payload } = buildVersionPayload();
      setVersionMessage("admin_version_saving", "Versie opslaan...", "info");
      state.version = payload;
      saveState();
      applyVersionInfo(state.version);
      refreshVersionForm();
      setVersionMessage("admin_version_saved", "Versiedetails opgeslagen", "ok");
    });
  }

  refreshVersionForm();
  loadVersionInfo()
    .then(() => {
      refreshVersionForm();
      setVersionMessage("admin_version_loaded", "Versiegegevens geladen", "ok");
    })
    .catch(err => {
      console.error("Versiegegevens laden mislukt", err);
      setVersionMessage("admin_version_error", "Versiegegevens konden niet worden geladen", "error");
    });
}

document.addEventListener("DOMContentLoaded", initAdmin);

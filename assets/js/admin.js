/* =======================================================
   Vis Lokaties — admin.js
   Adminpaneel voor databaseconfiguratie, synchronisatie en versiebeheer
   Versie: 0.0.0
   ======================================================= */

import { setStatus, state, saveState, loadVersionInfo } from "./core.js?v=20250611";
import { t } from "./i18n.js?v=20250611";
import { escapeHtml } from "./helpers.js?v=20250611";

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
  toolbarDrag: true
};

function initAdmin() {
  const form = document.getElementById("adminConfigForm");
  const versionForm = document.getElementById("adminVersionForm");
  if (!form && !versionForm) return;

  const statusEl = document.getElementById("adminStatus");
  const btnTest = document.getElementById("btnAdminTest");
  const autoSync = document.getElementById("adminAutoSync");
  const autoBathy = document.getElementById("adminForceBathy");
  const optionInputs = Array.from(document.querySelectorAll("[data-option]"));

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

  function readFormConfig() {
    return {
      options: readOptions()
    };
  }

  function applyConfig(config = {}) {
    if (config.options) {
      applyOptions(config.options);
    } else {
      applyOptions();
    }
  }

  function loadConfig() {
    if (!form) return;
    fetch("api/get_config.php")
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (data?.config) {
          applyConfig(data.config);
          setPanelMessage("admin_status_loaded", "Configuratie geladen", "ok");
        } else {
          throw new Error("config ontbreekt");
        }
      })
      .catch(err => {
        console.error("Admin config laden mislukt", err);
        setPanelMessage("admin_status_error", "Configuratie kon niet worden geladen", "error");
      });
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

    form.addEventListener("submit", e => {
      e.preventDefault();
      const payload = readFormConfig();
      setPanelMessage("admin_status_saving", "Configuratie opslaan...", "info");
      fetch("api/save_config.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(response => {
          if (!response.ok) return response.json().then(err => Promise.reject(err));
          return response.json();
        })
        .then(result => {
          if (result?.config) {
            applyConfig(result.config);
            setPanelMessage("admin_status_saved", "Configuratie opgeslagen", "ok");
            if (autoSync?.checked) {
              triggerSync().catch(err => console.warn("Auto-sync na opslaan mislukt", err));
            }
          } else {
            throw new Error("config ontbreekt");
          }
        })
        .catch(err => {
          console.error("Configuratie opslaan mislukt", err);
          const msg = err?.error || err?.message || "Onbekende fout";
          setPanelMessage("admin_status_save_error", msg, "error");
        });
    });

    btnTest?.addEventListener("click", () => {
      const payload = readFormConfig();
      setPanelMessage("admin_status_testing", "Verbinding testen...", "info");
      fetch("api/test_connection.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(response => {
          if (!response.ok) return response.json().then(err => Promise.reject(err));
          return response.json();
        })
        .then(() => {
          setPanelMessage("admin_status_test_ok", "Verbinding geslaagd", "ok");
        })
        .catch(err => {
          console.error("Verbindingstest mislukt", err);
          const msg = err?.error || err?.message || "Onbekende fout";
          setPanelMessage("admin_status_test_error", msg, "error");
        });
    });

    if (autoSync) {
      autoSync.checked = state.settings?.autoSync !== false;
      autoSync.addEventListener("change", () => {
        state.settings.autoSync = autoSync.checked;
        saveState();
        const key = autoSync.checked ? "admin_status_auto_sync_on" : "admin_status_auto_sync_off";
        const fallback = autoSync.checked ? "Auto-sync geactiveerd" : "Auto-sync gedeactiveerd";
        setPanelMessage(key, fallback, autoSync.checked ? "ok" : "warning");
        if (autoSync.checked) {
          triggerSync().catch(err => console.warn("Auto-sync activatie faalde", err));
        }
      });
    }

    if (autoBathy) {
      autoBathy.checked = state.settings?.saveBathy !== false;
      autoBathy.addEventListener("change", () => {
        const enabled = !!autoBathy.checked;
        state.settings.saveBathy = enabled;
        saveState();
        const dataCheckbox = document.getElementById("saveBathy");
        if (dataCheckbox && dataCheckbox.checked !== enabled) {
          dataCheckbox.checked = enabled;
          dataCheckbox.dispatchEvent(new Event("change"));
        } else {
          const key = enabled ? "status_bathy_db_enabled" : "status_bathy_db_disabled";
          setStatus(
            t(
              key,
              enabled
                ? "Nieuwe imports worden in de database opgeslagen"
                : "Nieuwe imports worden alleen lokaal opgeslagen"
            ),
            enabled ? "info" : "warning"
          );
        }
        const key = enabled ? "admin_status_auto_bathy_on" : "admin_status_auto_bathy_off";
        const fallback = enabled
          ? "Bathymetrie wordt nu standaard opgeslagen in de database"
          : "Bathymetrie wordt niet meer automatisch opgeslagen in de database";
        setPanelMessage(key, fallback, enabled ? "ok" : "warning");
      });
    }

    loadConfig();
  }

  if (versionForm) {
    versionForm.addEventListener("submit", e => {
      e.preventDefault();
      const { payload } = buildVersionPayload();
      setVersionMessage("admin_version_saving", "Versie opslaan...", "info");
      fetch("api/save_version.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(response => {
          if (!response.ok) return response.json().then(err => Promise.reject(err));
          return response.json();
        })
        .then(() => loadVersionInfo(true))
        .then(() => {
          refreshVersionForm();
          setVersionMessage("admin_version_saved", "Versiedetails opgeslagen", "ok");
        })
        .catch(err => {
          console.error("Versiegegevens opslaan mislukt", err);
          const msg = err?.error || err?.message || "Onbekende fout";
          setVersionMessage("admin_version_error", msg, "error");
        });
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

function triggerSync() {
  const syncFn = window.VisLokData?.forceServerSync;
  if (typeof syncFn === "function") {
    return syncFn(true);
  }
  return Promise.resolve();
}

document.addEventListener("DOMContentLoaded", initAdmin);

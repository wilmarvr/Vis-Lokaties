/* =======================================================
   Vis Lokaties — ui.js
   Gebruikersinterface, tabellen, taal, changelog
   Versie: 0.1.0
   ======================================================= */

import { setStatus, log, state, saveState, setToolbarWidth, TOOLBAR_MIN_WIDTH } from "./core.js?v=20250715";
import { populateTables } from "./data.js?v=20250715";
import { setDictionary, t, getLanguage } from "./i18n.js?v=20250715";
import { escapeHtml } from "./helpers.js?v=20250715";

let dragContainer = null;
let panelOrderApplied = false;
let draggingPanel = null;
let widthDragActive = false;
let lastWidth = null;

export function applyFeatureVisibility() {
  const container = document.getElementById("uiControls");
  if (!container) return;

  const features = state.settings || {};
  const visibilityMap = {
    map: true,
    data: features.showData !== false,
    weather: features.showWeather !== false,
    contours: features.showContours !== false,
    manage: features.showManage !== false,
    overview: features.showOverview !== false,
    about: features.showChangelog !== false
  };

  container.querySelectorAll("details[data-panel]").forEach(panel => {
    const key = panel.dataset.panel;
    const visible = visibilityMap[key] !== false;
    panel.classList.toggle("is-hidden", !visible);
    panel.style.display = visible ? "" : "none";
  });

  const manualGroup = container.querySelector(".group-water-draw");
  if (manualGroup) {
    const allowManual = features.allowManualWater !== false;
    manualGroup.classList.toggle("is-hidden", !allowManual);
    manualGroup.style.display = allowManual ? "" : "none";
    manualGroup.querySelectorAll("button").forEach(btn => {
      btn.disabled = !allowManual;
    });
  }

  ensurePanelDragSetup();
}

function initToolbarResizeHandle() {
  const handle = document.getElementById("toolbarResizeHandle");
  const main = document.querySelector("main");
  if (!handle || !main) return;

  const stopDrag = () => {
    if (!widthDragActive) return;
    widthDragActive = false;
    handle.classList.remove("is-dragging");
    window.removeEventListener("pointermove", applyDrag);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    if (lastWidth !== null) {
      setToolbarWidth(lastWidth, true);
    }
  };

  const applyDrag = event => {
    if (!widthDragActive) return;
    const point = event.touches?.[0] || event;
    if (!point || typeof point.clientX !== "number") return;
    const rect = main.getBoundingClientRect();
    const desired = rect.right - point.clientX;
    lastWidth = setToolbarWidth(desired, false);
    event.preventDefault();
  };

  handle.addEventListener("pointerdown", event => {
    widthDragActive = true;
    handle.classList.add("is-dragging");
    lastWidth = state.settings?.toolbarWidth ?? TOOLBAR_MIN_WIDTH;
    applyDrag(event);
    window.addEventListener("pointermove", applyDrag);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  });
}

function ensurePanelDragSetup() {
  if (!dragContainer) {
    dragContainer = document.getElementById("uiControls");
    if (!dragContainer) return;
    dragContainer.addEventListener("dragover", handlePanelDragOver);
    dragContainer.addEventListener("drop", handlePanelDrop);
  }

  const saved = Array.isArray(state.settings?.panelOrder) ? state.settings.panelOrder : [];
  if (panelOrderApplied && saved.length) {
    const current = Array.from(dragContainer.querySelectorAll("details[data-panel]") || [])
      .map(panel => panel.dataset.panel)
      .filter(Boolean);
    const differs = current.length !== saved.length || saved.some((id, index) => id !== current[index]);
    if (differs) {
      panelOrderApplied = false;
    }
  }

  if (!panelOrderApplied) {
    applySavedPanelOrder();
    applySavedPanelOpenStates();
    panelOrderApplied = true;
  }

  attachPanelDragHandlers();
  updatePanelDragState();
}

function applySavedPanelOrder() {
  if (!dragContainer) return;
  const saved = Array.isArray(state.settings?.panelOrder) ? state.settings.panelOrder : [];
  if (!saved.length) return;

  const panelMap = new Map();
  dragContainer.querySelectorAll("details[data-panel]").forEach(panel => {
    if (panel?.dataset?.panel) {
      panelMap.set(panel.dataset.panel, panel);
    }
  });

  saved.forEach(id => {
    const panel = panelMap.get(id);
    if (panel) {
      dragContainer.appendChild(panel);
      panelMap.delete(id);
    }
  });

  panelMap.forEach(panel => dragContainer.appendChild(panel));
}

function attachPanelDragHandlers() {
  if (!dragContainer) return;
  const panels = dragContainer.querySelectorAll("details[data-panel]");
  panels.forEach(panel => {
    panel.removeEventListener("dragstart", handlePanelDragStart);
    panel.removeEventListener("dragend", handlePanelDragEnd);
    panel.removeEventListener("toggle", handlePanelToggle);
    panel.addEventListener("dragstart", handlePanelDragStart);
    panel.addEventListener("dragend", handlePanelDragEnd);
    panel.addEventListener("toggle", handlePanelToggle);
  });
}

function applySavedPanelOpenStates() {
  if (!dragContainer) return;
  const saved = state.settings?.panelOpen || {};
  dragContainer.querySelectorAll("details[data-panel]").forEach(panel => {
    const id = panel.dataset.panel;
    if (!id) return;
    if (saved[id] === true) {
      panel.setAttribute("open", "open");
    } else if (saved[id] === false) {
      panel.removeAttribute("open");
    }
  });
}

function updatePanelDragState() {
  if (!dragContainer) return;
  const allow = state.settings?.toolbarDrag !== false;
  dragContainer.classList.toggle("panel-drag-disabled", !allow);
  dragContainer.querySelectorAll("details[data-panel]").forEach(panel => {
    if (allow) {
      panel.setAttribute("draggable", "true");
      panel.classList.add("panel-draggable");
    } else {
      panel.removeAttribute("draggable");
      panel.classList.remove("panel-draggable");
    }
  });
}

function handlePanelDragStart(event) {
  if (state.settings?.toolbarDrag === false) {
    event.preventDefault();
    return;
  }
  draggingPanel = event.currentTarget;
  draggingPanel.classList.add("dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggingPanel.dataset.panel || "panel");
  }
}

function handlePanelDragEnd() {
  if (!draggingPanel) return;
  draggingPanel.classList.remove("dragging");
  draggingPanel = null;
  persistPanelOrder();
}

function handlePanelDragOver(event) {
  if (!draggingPanel || state.settings?.toolbarDrag === false) return;
  event.preventDefault();
  const afterElement = getPanelAfterElement(event.clientY);
  if (!afterElement) {
    dragContainer.appendChild(draggingPanel);
  } else if (afterElement !== draggingPanel) {
    dragContainer.insertBefore(draggingPanel, afterElement);
  }
}

function handlePanelDrop(event) {
  if (!draggingPanel || state.settings?.toolbarDrag === false) return;
  event.preventDefault();
  persistPanelOrder();
}

function handlePanelToggle(event) {
  const panel = event.currentTarget;
  const id = panel?.dataset?.panel;
  if (!id) return;
  if (!state.settings || typeof state.settings !== "object") {
    state.settings = {};
  }
  if (!state.settings.panelOpen || typeof state.settings.panelOpen !== "object") {
    state.settings.panelOpen = {};
  }
  const isOpen = !!panel.open;
  if (state.settings.panelOpen[id] === isOpen) return;
  state.settings.panelOpen[id] = isOpen;
  saveState();
}

function getPanelAfterElement(cursorY) {
  if (!dragContainer) return null;
  const panels = Array.from(dragContainer.querySelectorAll("details[data-panel]:not(.dragging)"))
    .filter(panel => panel.offsetParent !== null);

  return panels.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = cursorY - (box.top + box.height / 2);
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function persistPanelOrder() {
  if (!dragContainer) return;
  const order = Array.from(dragContainer.querySelectorAll("details[data-panel]"))
    .map(panel => panel.dataset.panel)
    .filter(Boolean);
  state.settings.panelOrder = order;
  saveState();
}

/* ---------- INITIALISATIE ---------- */
export function initUI() {
  log("UI gestart");

  initToolbarResizeHandle();

  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.value = state.language;
    langSelect.addEventListener("change", () => {
      const lang = langSelect.value;
      state.language = lang;
      saveState();
      loadLanguage(lang);
    });
  }

  loadLanguage(state.language || getLanguage());
  loadChangelog();
  attachStatusHelpers();
  populateTables();
  updateOverview();
  applyFeatureVisibility();

  setStatus(t("status_ui_ready", "UI gereed"), "ok");
}

function attachStatusHelpers() {
  const mapButtons = ["btnShowHeat", "btnMakeContours", "btnClearContours"];
  mapButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", () => setStatus(t("status_map_updated", "Kaart bijgewerkt"), "ok"));
    }
  });
}

/* ---------- TAAL ---------- */
export function loadLanguage(lang = "nl") {
  fetch(`lang/${lang}.json`)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(dict => {
      setDictionary(lang, dict);
      applyTranslations(dict);
      state.language = lang;
      saveState();

      const langSelect = document.getElementById("langSelect");
      if (langSelect) langSelect.value = lang;

      const manage = document.getElementById("manageTabs");
      if (manage) {
        delete manage.dataset.initialized;
        manage.innerHTML = "";
      }
      populateTables();
      updateOverview();
      updateFooterTranslation();
      const detection = window.VisLokMap?.getCurrentDetection?.();
      if (detection) {
        document.dispatchEvent(new CustomEvent("vislok:detection", { detail: detection }));
      } else {
        document.dispatchEvent(new Event("vislok:detection-clear"));
      }
      applyFeatureVisibility();

      setStatus(
        lang === "nl" ? t("status_lang_nl", "Taal gewijzigd naar Nederlands") : t("status_lang_en", "Language set to English"),
        "ok"
      );
    })
    .catch(err => {
      console.error(err);
      setStatus(t("status_lang_error", "Fout bij laden van taalbestand"), "error");
    });
}

function applyTranslations(dict) {
  document.title = dict.title || document.title;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.getAttribute("data-i18n-title");
    if (dict[key]) {
      el.setAttribute("title", dict[key]);
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) {
      el.setAttribute("placeholder", dict[key]);
    }
  });
}

function updateFooterTranslation() {
  const status = document.getElementById("statusLine");
  if (status && status.textContent.startsWith("Status:")) {
    status.textContent = `${t("status_label", "Status")}: ${t("status_ready", "Gereed")}`;
  }
}

/* ---------- CHANGELOG ---------- */
export function loadChangelog() {
  const el = document.getElementById("tab-changelog");
  if (!el) return;
  fetch("data/changelog.json")
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(logs => {
      el.innerHTML = "";
      logs.forEach(item => {
        const div = document.createElement("div");
        div.className = "log-item";
        div.innerHTML = `
          <h4>${t("label_version", "Versie")} ${item.version} – ${item.date}</h4>
          <ul>${item.changes.map(ch => `<li>${ch}</li>`).join("")}</ul>
        `;
        el.appendChild(div);
      });
    })
    .catch(err => {
      console.error(err);
      setStatus(t("status_changelog_error", "Fout bij laden changelog"), "error");
    });
}

/* ---------- OVERZICHT ---------- */
export function updateOverview() {
  const tbody = document.querySelector("#overviewTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const allItems = [
    ...(state.waters || []),
    ...(state.stekken || []),
    ...(state.rigs || [])
  ];
  const recent = allItems.slice(-50).reverse();

  for (const item of recent) {
    const tr = document.createElement("tr");
    const typeLabel = escapeHtml(t(`label_${item.type}`, item.type || "-"));
    const name = escapeHtml(item.name || "-");
    const lat = Number.isFinite(item.lat) ? item.lat.toFixed(5) : "-";
    const lng = Number.isFinite(item.lng) ? item.lng.toFixed(5) : "-";
    const rawValue = item.val ?? item.note ?? "";
    const value = escapeHtml(rawValue !== undefined && rawValue !== null ? `${rawValue}` : "");
    tr.innerHTML = `
      <td>${typeLabel}</td>
      <td>${name}</td>
      <td>${lat}</td>
      <td>${lng}</td>
      <td>${value}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initUI);

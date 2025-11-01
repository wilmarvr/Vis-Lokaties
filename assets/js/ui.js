/* =======================================================
   Vis Lokaties — ui.js
   Gebruikersinterface, tabellen, taal, changelog
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log, state, saveState } from "./core.js";
import { populateTables } from "./data.js";

/* ---------- INITIALISATIE ---------- */
export function initUI() {
  log("UI gestart");

  // Taalkeuze laden
  const langSelect = document.getElementById("langSelect");
  langSelect.value = state.language;
  langSelect.addEventListener("change", () => {
    state.language = langSelect.value;
    saveState();
    loadLanguage(state.language);
  });

  // Laad standaardtaal en changelog
  loadLanguage(state.language);
  loadChangelog();

  // Tabs en tabellen aanmaken
  buildTabs();

  // Knoppen koppelen
  const btnHeat = document.getElementById("btnShowHeat");
  const btnContours = document.getElementById("btnMakeContours");
  const btnClear = document.getElementById("btnClearContours");
  [btnHeat, btnContours, btnClear].forEach(b => b && b.addEventListener("click", () => setStatus("Kaart bijgewerkt", "ok")));

  setStatus("UI gereed", "ok");
}

/* ---------- DYNAMISCHE TABS (waters, steks, rigs) ---------- */
export function buildTabs() {
  const container = document.createElement("section");
  container.id = "dataTabs";
  container.innerHTML = `
    <details open>
      <summary>🏞️ Wateren</summary>
      <table id="tab-waters"><thead><tr><th>ID</th><th>Naam</th><th>Lat</th><th>Lon</th></tr></thead><tbody></tbody></table>
    </details>
    <details>
      <summary>🎣 Stekken</summary>
      <table id="tab-steks"><thead><tr><th>ID</th><th>Naam</th><th>Lat</th><th>Lon</th></tr></thead><tbody></tbody></table>
    </details>
    <details>
      <summary>🪝 Rigs</summary>
      <table id="tab-rigs"><thead><tr><th>ID</th><th>Naam</th><th>Lat</th><th>Lon</th></tr></thead><tbody></tbody></table>
    </details>
  `;
  document.querySelector("#uiControls").appendChild(container);
  populateTables();
}

/* ---------- TAAL ---------- */
export async function loadLanguage(lang = "nl") {
  try {
    const response = await fetch(`lang/${lang}.json`);
    const dict = await response.json();

    document.title = dict.title;
    document.querySelector("summary:nth-of-type(1)").textContent = dict.tab_map;
    document.querySelector("summary:nth-of-type(2)").textContent = dict.tab_data;
    document.querySelector("summary:nth-of-type(3)").textContent = dict.tab_weather;
    document.querySelector("summary:nth-of-type(4)").textContent = dict.tab_about;

    setStatus(lang === "nl" ? "Taal gewijzigd naar Nederlands" : "Language set to English", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Fout bij laden van taalbestand", "error");
  }
}

/* ---------- CHANGELOG ---------- */
export async function loadChangelog() {
  try {
    const el = document.getElementById("tab-changelog");
    const response = await fetch("data/changelog.json");
    const logs = await response.json();
    el.innerHTML = "";
    logs.forEach(item => {
      const div = document.createElement("div");
      div.className = "log-item";
      div.innerHTML = `
        <h4>Versie ${item.version} – ${item.date}</h4>
        <ul>${item.changes.map(ch => `<li>${ch}</li>`).join("")}</ul>
      `;
      el.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    setStatus("Fout bij laden changelog", "error");
  }
}

/* ---------- OVERZICHT ---------- */
export function updateOverview() {
  const tbody = document.querySelector("#overviewTable tbody");
  tbody.innerHTML = "";

  const allItems = [...(state.waters || []), ...(state.stekken || []), ...(state.spots || [])];
  const recent = allItems.slice(-50);

  for (const item of recent) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.type || "-"}</td>
      <td>${item.name || "-"}</td>
      <td>${item.lat ? item.lat.toFixed(5) : "-"}</td>
      <td>${item.lng ? item.lng.toFixed(5) : "-"}</td>
      <td>${item.val || ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initUI);

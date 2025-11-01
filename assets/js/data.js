/* =======================================================
   Vis Lokaties — data.js
   Dataopslag, import/export, CSV, local save/load/reset
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log, state, saveState, loadState } from "./core.js";
import { updateOverview } from "./ui.js";

/* ---------- INITIALISATIE ---------- */
export function initData() {
  if (!state.imports) state.imports = [];
  if (!state.waters) state.waters = [];
  if (!state.stekken) state.stekken = [];
  if (!state.spots) state.spots = [];
  log("Data-init voltooid");
}

/* ---------- LOCAL STORAGE FUNCTIES ---------- */
export function localSave() {
  try {
    localStorage.setItem("vislokaties_local_backup", JSON.stringify(state));
    setStatus("Project lokaal opgeslagen", "ok");
  } catch (err) {
    setStatus("Fout bij lokaal opslaan", "error");
    console.error(err);
  }
}

export function localLoad() {
  try {
    const data = localStorage.getItem("vislokaties_local_backup");
    if (!data) return setStatus("Geen lokale back-up gevonden", "error");
    const parsed = JSON.parse(data);
    Object.assign(state, parsed);
    saveState();
    setStatus("Lokaal project geladen", "ok");
    updateOverview();
  } catch (err) {
    setStatus("Fout bij lokaal laden", "error");
    console.error(err);
  }
}

export function localReset() {
  if (confirm("Weet je zeker dat je alle lokale data wilt wissen?")) {
    localStorage.removeItem("vislokaties_local_backup");
    localStorage.removeItem("vislokaties_state");
    setStatus("Lokale opslag gewist", "ok");
  }
}

/* ---------- CSV-INVOER ---------- */
export async function importCSV(file) {
  setStatus("CSV-bestand verwerken...");
  try {
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(","));
    const header = rows.shift();

    const latIndex = header.findIndex(h => /lat/i.test(h));
    const lonIndex = header.findIndex(h => /lon/i.test(h));
    const depthIndex = header.findIndex(h => /depth|diepte/i.test(h));

    const imported = [];

    for (const row of rows) {
      if (!row[latIndex] || !row[lonIndex]) continue;
      const lat = parseFloat(row[latIndex]);
      const lng = parseFloat(row[lonIndex]);
      const val = depthIndex >= 0 ? parseFloat(row[depthIndex]) : 0;
      if (!isNaN(lat) && !isNaN(lng)) {
        imported.push({ lat, lng, val });
      }
    }

    state.imports = imported;
    saveState();
    setStatus(`${imported.length} punten geïmporteerd`, "ok");
    updateOverview();
  } catch (err) {
    console.error(err);
    setStatus("Fout bij CSV-import", "error");
  }
}

/* ---------- EXPORT ---------- */
export function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vislokaties_data.json";
  a.click();
  setStatus("Data geëxporteerd naar JSON", "ok");
}

export function exportHTML() {
  const html = document.documentElement.outerHTML;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vislokaties_page.html";
  a.click();
  setStatus("Pagina opgeslagen als HTML", "ok");
}

/* ---------- ZIP-EXPORT ---------- */
export async function exportZIP() {
  setStatus("ZIP maken...");
  try {
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(state, null, 2));
    zip.file("readme.txt", "Vis Lokaties data-export");

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vislokaties_data.zip";
    a.click();

    setStatus("ZIP-export voltooid", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Fout bij ZIP-export", "error");
  }
}

/* ---------- TABEL UPDATES (WATERS/STEK/RIGS) ---------- */
export function populateTables() {
  const makeTable = (id, data) => {
    const tbody = document.querySelector(`#${id} tbody`);
    tbody.innerHTML = "";
    data.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.id || "-"}</td>
        <td>${item.name || "-"}</td>
        <td>${item.lat ? item.lat.toFixed(5) : "-"}</td>
        <td>${item.lng ? item.lng.toFixed(5) : "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  makeTable("tab-waters", state.waters);
  makeTable("tab-steks", state.stekken);
  makeTable("tab-rigs", state.spots);
}

/* ---------- AUTO OPSLAG ---------- */
export function autoSave() {
  saveState();
  log("Autosave uitgevoerd");
}

/* ---------- EVENTKOPPELINGEN ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initData();

  const csvInput = document.getElementById("csvFile");
  if (csvInput) csvInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importCSV(file);
  });

  const btnExportJSON = document.getElementById("btnExportGeoJSON");
  if (btnExportJSON) btnExportJSON.addEventListener("click", exportJSON);

  const btnExportZIP = document.getElementById("btnExportZIP");
  if (btnExportZIP) btnExportZIP.addEventListener("click", exportZIP);

  const btnSaveHtml = document.getElementById("btnSaveHtml");
  if (btnSaveHtml) btnSaveHtml.addEventListener("click", exportHTML);

  // Nieuwe knoppen voor local storage
  const toolbar = document.querySelector(".toolbar-right");
  const btnSaveLocal = document.createElement("button");
  btnSaveLocal.id = "btnLocalSave";
  btnSaveLocal.textContent = "💾 Opslaan";
  toolbar.appendChild(btnSaveLocal);

  const btnLoadLocal = document.createElement("button");
  btnLoadLocal.id = "btnLocalLoad";
  btnLoadLocal.textContent = "📂 Laden";
  toolbar.appendChild(btnLoadLocal);

  const btnResetLocal = document.createElement("button");
  btnResetLocal.id = "btnLocalReset";
  btnResetLocal.textContent = "🗑️ Reset";
  toolbar.appendChild(btnResetLocal);

  btnSaveLocal.addEventListener("click", localSave);
  btnLoadLocal.addEventListener("click", localLoad);
  btnResetLocal.addEventListener("click", localReset);

  // Tabellen periodiek bijwerken
  setInterval(populateTables, 10000);

  // Autosave elke 60 sec
  setInterval(autoSave, 60000);
});

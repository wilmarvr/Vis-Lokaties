/* =======================================================
   Vis Lokaties — data.js
   Dataopslag, import/export, CSV/ZIP, local save/load/reset, server sync
   Versie: 0.1.0
   ======================================================= */

import { setStatus, log, state, saveState, loadState } from "./core.js";
import { updateOverview } from "./ui.js";
import { refreshDataLayers, refreshImportLayer, requestLocationPick } from "./map.js";
import { saveSpot, fetchSpots, resetServer } from "./db.js";
import { uid } from "./helpers.js";

let rawImports = [];
let importQueue = [];
let processing = false;

/* ---------- INITIALISATIE ---------- */
export function initData() {
  loadState();
  if (!state.imports) state.imports = [];
  if (!state.waters) state.waters = [];
  if (!state.stekken) state.stekken = [];
  if (!state.rigs) state.rigs = [];
  if (!state.filters) state.filters = { depthMin: 0, depthMax: 10 };

  state.waters = state.waters.map(w => ({ type: "water", ...w }));
  state.stekken = state.stekken.map(s => ({ type: "stek", ...s }));
  state.rigs = state.rigs.map(r => ({ type: "rig", ...r }));

  rawImports = [...state.imports];
  bindEvents();
  whenMapReady(() => {
    refreshDataLayers();
    refreshImportLayer();
  });
  updateOverview();
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
  const btnLoad = document.getElementById("btnLoadCSV");
  const btnGeo = document.getElementById("btnImportGeoJSON");
  const btnSaveHtml = document.getElementById("btnSaveHtml");
  const btnSaveHtmlData = document.getElementById("btnSaveHtmlData");
  const btnExportJSON = document.getElementById("btnExportGeoJSON");
  const btnExportZIP = document.getElementById("btnExportZIP");
  const btnFilterDepth = document.getElementById("btnFilterDepth");
  const btnResetDepth = document.getElementById("btnResetDepth");
  const btnAutoRigs = document.getElementById("btnAutoRigs");
  const btnNormalize = document.getElementById("btnNormalizeDB");
  const btnSync = document.getElementById("btnSyncServer");
  const btnResetServer = document.getElementById("btnResetServer");

  csvInput?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) queueImport(file);
  });

  btnLoad?.addEventListener("click", () => csvInput?.click());
  btnGeo?.addEventListener("click", openGeoJSONDialog);
  btnSaveHtml?.addEventListener("click", exportHTML);
  btnSaveHtmlData?.addEventListener("click", exportHTMLWithData);
  btnExportJSON?.addEventListener("click", exportGeoJSON);
  btnExportZIP?.addEventListener("click", exportZIP);
  btnFilterDepth?.addEventListener("click", applyDepthFilter);
  btnResetDepth?.addEventListener("click", resetDepthFilter);
  btnAutoRigs?.addEventListener("click", generateAutoRigs);
  btnNormalize?.addEventListener("click", normalizeDatabase);
  btnSync?.addEventListener("click", () => syncWithServer(true));
  btnResetServer?.addEventListener("click", resetServerData);

  document.getElementById("btnAddWater")?.addEventListener("click", addWaterFromForm);
  document.getElementById("btnAddStek")?.addEventListener("click", addStekFromForm);
  document.getElementById("btnAddRig")?.addEventListener("click", addRigFromForm);

  document.getElementById("btnPickWater")?.addEventListener("click", () => pickToForm("water"));
  document.getElementById("btnPickStek")?.addEventListener("click", () => pickToForm("stek"));
  document.getElementById("btnPickRig")?.addEventListener("click", () => pickToForm("rig"));

  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = state.language;

  setInterval(populateTables, 10000);
  setInterval(autoSave, 60000);

  syncWithServer(false);
}

/* ---------- IMPORT QUEUE ---------- */
function queueImport(file) {
  importQueue.push(file);
  setStatus(`Bestand in importwachtrij geplaatst (${file.name})`, "info");
  updateImportMessage();
  processQueue();
}

async function processQueue() {
  if (processing) return;
  const file = importQueue.shift();
  if (!file) return;
  processing = true;
  updateImportMessage(`Bezig met ${file.name}...`);
  try {
    if (file.name.endsWith(".zip")) {
      await importZIP(file);
    } else {
      await importCSV(file);
    }
    setStatus(`Import voltooid (${file.name})`, "ok");
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij import van ${file.name}`, "error");
  } finally {
    processing = false;
    updateImportMessage();
    if (importQueue.length) processQueue();
  }
}

function updateImportMessage(message) {
  const el = document.getElementById("importQueue");
  if (!el) return;
  if (!message && !importQueue.length) {
    el.textContent = "Geen actieve import";
    el.className = "panel-note";
    return;
  }
  el.textContent = message || `${importQueue.length} bestand(en) in wachtrij`;
  el.className = "panel-note";
}

/* ---------- CSV / ZIP IMPORT ---------- */
export async function importCSV(file) {
  setStatus("CSV-bestand verwerken...");
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter(Boolean).map(r => r.split(/;|,/));
  if (!rows.length) throw new Error("Leeg CSV-bestand");
  const header = rows.shift();

  const latIndex = header.findIndex(h => /lat/i.test(h));
  const lonIndex = header.findIndex(h => /lon/i.test(h));
  const depthIndex = header.findIndex(h => /depth|diepte|val/i.test(h));

  if (latIndex < 0 || lonIndex < 0) throw new Error("CSV mist lat/lon kolommen");

  const imported = [];
  for (const row of rows) {
    const lat = parseFloat(row[latIndex]);
    const lng = parseFloat(row[lonIndex]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const val = depthIndex >= 0 ? parseFloat(row[depthIndex]) : undefined;
      imported.push({ lat, lng, val });
    }
  }

  applyImports(imported);
}

async function importZIP(file) {
  setStatus("ZIP uitpakken...");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const csvEntry = Object.keys(zip.files).find(name => name.toLowerCase().endsWith(".csv"));
  if (!csvEntry) throw new Error("ZIP bevat geen CSV");
  const csvFile = await zip.files[csvEntry].async("string");
  await importCSV(new File([csvFile], csvEntry, { type: "text/csv" }));
}

function applyImports(imported) {
  rawImports = imported;
  state.imports = [...imported];
  saveState();
  whenMapReady(() => refreshImportLayer());
  updateOverview();
  setStatus(`${imported.length} punten geïmporteerd`, "ok");
}

/* ---------- GEOJSON IMPORT ---------- */
async function openGeoJSONDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".geojson,.json";
  input.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const geojson = JSON.parse(text);
      const features = geojson.features || [];
      const points = features
        .filter(f => f.geometry?.type === "Point")
        .map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          val: f.properties?.value ?? f.properties?.depth
        }));
      applyImports(points);
    } catch (err) {
      console.error(err);
      setStatus("Ongeldig GeoJSON-bestand", "error");
    }
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
  const html = document.documentElement.outerHTML;
  downloadBlob(html, "vislokaties_page.html", "text/html");
  setStatus("Pagina opgeslagen als HTML", "ok");
}

function exportHTMLWithData() {
  const html = document.documentElement.outerHTML.replace(
    "</body>",
    `<script>window.__VISLOK_EXPORT__=${JSON.stringify(state)};</script></body>`
  );
  downloadBlob(html, "vislokaties_page_data.html", "text/html");
  setStatus("HTML + data opgeslagen", "ok");
}

export async function exportZIP() {
  setStatus("ZIP maken...");
  try {
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(state, null, 2));
    zip.file("readme.txt", "Vis Lokaties data-export");

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "vislokaties_data.zip", "application/zip");

    setStatus("ZIP-export voltooid", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Fout bij ZIP-export", "error");
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
    rawImports = [...(state.imports || [])];
    saveState();
    refreshDataLayers();
    refreshImportLayer();
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
  saveState();
  whenMapReady(() => refreshImportLayer());
  setStatus(`${filtered.length} punten binnen filter`, "ok");
}

function resetDepthFilter() {
  state.filters = { depthMin: 0, depthMax: 10 };
  state.imports = [...rawImports];
  saveState();
  whenMapReady(() => refreshImportLayer());
  setStatus("Dieptefilter hersteld", "ok");
}

/* ---------- AUTORIGS & NORMALISEREN ---------- */
function generateAutoRigs() {
  if (!rawImports.length) {
    setStatus("Geen importdata voor auto rigs", "error");
    return;
  }
  const sorted = [...rawImports].sort((a, b) => (b.val ?? 0) - (a.val ?? 0));
  const top = sorted.slice(0, 5);
  top.forEach((p, idx) => {
    state.rigs.push({ id: uid("rig"), name: `Auto rig ${idx + 1}`, lat: p.lat, lng: p.lng, val: p.val ?? null });
  });
  saveState();
  whenMapReady(() => refreshDataLayers());
  updateOverview();
  setStatus(`${top.length} auto-rigs aangemaakt`, "ok");
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
  setStatus("Database genormaliseerd", "ok");
}

/* ---------- FORMULIEREN ---------- */
async function pickToForm(type) {
  const result = await requestLocationPick(type);
  const { lat, lng } = result;
  if (type === "water") {
    document.getElementById("waterLat").value = lat.toFixed(5);
    document.getElementById("waterLon").value = lng.toFixed(5);
  }
  if (type === "stek") {
    document.getElementById("stekLat").value = lat.toFixed(5);
    document.getElementById("stekLon").value = lng.toFixed(5);
  }
  if (type === "rig") {
    document.getElementById("rigLat").value = lat.toFixed(5);
    document.getElementById("rigLon").value = lng.toFixed(5);
  }
}

async function addWaterFromForm() {
  const name = document.getElementById("waterName").value.trim();
  const lat = parseFloat(document.getElementById("waterLat").value);
  const lng = parseFloat(document.getElementById("waterLon").value);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return setStatus("Vul naam en coordinaten in voor water", "error");
  }
  const water = { id: uid("water"), name, lat, lng, type: "water" };
  state.waters.push(water);
  await persistSpot(water);
  clearWaterForm();
}

async function addStekFromForm() {
  const name = document.getElementById("stekName").value.trim();
  const lat = parseFloat(document.getElementById("stekLat").value);
  const lng = parseFloat(document.getElementById("stekLon").value);
  const depth = parseFloat(document.getElementById("stekDepth").value);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return setStatus("Vul naam en coordinaten in voor stek", "error");
  }
  const stek = { id: uid("stek"), name, lat, lng, val: Number.isFinite(depth) ? depth : null, type: "stek" };
  state.stekken.push(stek);
  await persistSpot(stek);
  clearStekForm();
}

async function addRigFromForm() {
  const name = document.getElementById("rigName").value.trim();
  const lat = parseFloat(document.getElementById("rigLat").value);
  const lng = parseFloat(document.getElementById("rigLon").value);
  const note = document.getElementById("rigNote").value.trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return setStatus("Vul naam en coordinaten in voor rig", "error");
  }
  const rig = { id: uid("rig"), name, lat, lng, note, type: "rig" };
  state.rigs.push(rig);
  await persistSpot(rig);
  clearRigForm();
}

function clearWaterForm() {
  document.getElementById("waterName").value = "";
  document.getElementById("waterLat").value = "";
  document.getElementById("waterLon").value = "";
}
function clearStekForm() {
  document.getElementById("stekName").value = "";
  document.getElementById("stekLat").value = "";
  document.getElementById("stekLon").value = "";
  document.getElementById("stekDepth").value = "";
}
function clearRigForm() {
  document.getElementById("rigName").value = "";
  document.getElementById("rigLat").value = "";
  document.getElementById("rigLon").value = "";
  document.getElementById("rigNote").value = "";
}

async function persistSpot(spot) {
  saveState();
  whenMapReady(() => refreshDataLayers());
  updateOverview();
  try {
    await saveSpot(spot);
    setStatus(`${spot.type || "spot"} opgeslagen`, "ok");
  } catch (err) {
    console.warn("Kon spot niet naar server schrijven", err);
    setStatus("Lokaal opgeslagen (server faalde)", "error");
  }
}

/* ---------- SERVER SYNC ---------- */
async function syncWithServer(pushLocal) {
  try {
    const remote = await fetchSpots();
    if (Array.isArray(remote)) {
      mergeServerData(remote);
      setStatus(`Server synchronisatie voltooid (${remote.length} records)`, "ok");
    }
    if (pushLocal) {
      const all = [...state.waters, ...state.stekken, ...state.rigs];
      for (const spot of all) {
        await saveSpot(spot);
      }
      setStatus("Lokale data naar server geschreven", "ok");
    }
    whenMapReady(() => refreshDataLayers());
    updateOverview();
  } catch (err) {
    console.warn("Server sync faalde", err);
    setStatus("Server niet bereikbaar", "error");
  }
}

function mergeServerData(records) {
  const waters = records.filter(r => r.type === "water");
  const stekken = records.filter(r => r.type === "stek");
  const rigs = records.filter(r => r.type === "rig");
  if (waters.length) state.waters = dedupe(state.waters, waters);
  if (stekken.length) state.stekken = dedupe(state.stekken, stekken);
  if (rigs.length) state.rigs = dedupe(state.rigs, rigs);
  saveState();
}

function dedupe(local, remote) {
  const map = new Map();
  local.forEach(item => map.set(item.id || item.name, item));
  remote.forEach(item => {
    map.set(item.id || item.name, item);
  });
  return Array.from(map.values());
}

async function resetServerData() {
  if (!confirm("Weet je zeker dat je de serverdata wilt resetten?")) return;
  try {
    await resetServer();
    setStatus("Serverdata gewist", "ok");
    syncWithServer(false);
  } catch (err) {
    console.error(err);
    setStatus("Server reset mislukt", "error");
  }
}

/* ---------- TABELLEN ---------- */
export function populateTables() {
  const makeTable = (id, data) => {
    const table = document.getElementById(id);
    if (!table) return;
    const tbody = table.querySelector("tbody");
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

  makeTable("tab-waters", state.waters || []);
  makeTable("tab-steks", state.stekken || []);
  makeTable("tab-rigs", state.rigs || []);
}

/* ---------- AUTOSAVE ---------- */
export function autoSave() {
  saveState();
  log("Autosave uitgevoerd");
}

/* ---------- EVENTKOPPELINGEN ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initData();

  const toolbar = document.querySelector(".toolbar-right");
  if (toolbar && !document.getElementById("btnLocalSave")) {
    const btnSaveLocal = document.createElement("button");
    btnSaveLocal.id = "btnLocalSave";
    btnSaveLocal.textContent = "💾 Opslaan";
    btnSaveLocal.addEventListener("click", localSave);

    const btnLoadLocal = document.createElement("button");
    btnLoadLocal.id = "btnLocalLoad";
    btnLoadLocal.textContent = "📂 Laden";
    btnLoadLocal.addEventListener("click", localLoad);

    const btnResetLocal = document.createElement("button");
    btnResetLocal.id = "btnLocalReset";
    btnResetLocal.textContent = "🗑️ Reset";
    btnResetLocal.addEventListener("click", localReset);

    toolbar.appendChild(btnSaveLocal);
    toolbar.appendChild(btnLoadLocal);
    toolbar.appendChild(btnResetLocal);
  }
});

/* =======================================================
   Vis Lokaties — db.js
   MySQL-backed opslag via PHP API
   ======================================================= */

const API_BASE = (typeof window !== "undefined" && window.VISLOK_API_BASE) ? window.VISLOK_API_BASE : "api";

async function callApi(path, options = {}) {
  const url = `${API_BASE}/${path}`;
  const init = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  };
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  if (!res.ok || json.error) {
    const detail = json?.detail ? ` (${json.detail})` : "";
    throw new Error(`HTTP ${res.status}: ${json.error || res.statusText}${detail}`);
  }
  return json;
}

export async function fetchSpots() {
  const data = await callApi("list_spots.php");
  return Array.isArray(data.spots) ? data.spots : [];
}

export async function saveSpot(spot) {
  const data = await callApi("save_spot.php", { method: "POST", body: spot });
  return data || spot;
}

export async function deleteSpot(id, type) {
  await callApi("delete_spot.php", { method: "POST", body: { id, type } });
}

export async function resetServer() {
  await callApi("reset_spots.php", { method: "POST", body: {} });
}

export async function saveBathyBatch(payload) {
  return callApi("save_import.php", { method: "POST", body: payload });
}

export async function fetchBathyImports() {
  const data = await callApi("list_imports.php");
  return { list: data.imports || [], summary: data.summary || { batches: 0, points: 0 } };
}

export async function clearBathyImports() {
  await callApi("clear_imports.php", { method: "POST", body: {} });
}

export async function fetchBathyPoints(bounds) {
  const params = bounds
    ? `?south=${bounds.south}&north=${bounds.north}&west=${bounds.west}&east=${bounds.east}`
    : "";
  const data = await callApi(`get_import_points.php${params}`);
  return { points: data.points || [] };
}

export async function fetchCatches() {
  const data = await callApi("list_catches.php");
  return Array.isArray(data.catches) ? data.catches : [];
}

export async function saveCatch(payload) {
  const data = await callApi("save_catch.php", { method: "POST", body: payload });
  return data?.catch || payload;
}

export async function deleteCatch(id) {
  await callApi("delete_catch.php", { method: "POST", body: { id } });
}


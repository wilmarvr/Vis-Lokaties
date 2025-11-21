/* =======================================================
   Vis Lokaties — db.js
   Clienthelpers voor PHP API (XAMPP / MySQL)
   ======================================================= */

const API_BASE = "api";

function callApi(endpoint, options = {}) {
  return fetch(`${API_BASE}/${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  })
    .then(async response => {
      const bodyText = await response.text();
      const bodyJson = bodyText ? safeJson(bodyText) : null;

      if (!response.ok) {
        const apiMessage = bodyJson?.error || bodyJson?.message;
        const statusText = `HTTP ${response.status}`;
        throw new Error(apiMessage ? `${statusText}: ${apiMessage}` : statusText);
      }

      return bodyJson;
    })
    .catch(err => {
      console.warn(`API ${endpoint} faalde`, err);
      throw err;
    });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

export function fetchSpots() {
  return callApi("list_spots.php").then(result => result?.data || []);
}

export function saveSpot(spot) {
  const payload = { ...spot };
  if (payload.waterId !== undefined) {
    payload.water_id = payload.waterId || null;
    delete payload.waterId;
  }
  if (payload.stekId !== undefined) {
    payload.stek_id = payload.stekId || null;
    delete payload.stekId;
  }
  return callApi("save_spot.php", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then(result => result?.spot || null);
}

export function deleteSpot(id) {
  return callApi("delete_spot.php", {
    method: "POST",
    body: JSON.stringify({ id })
  });
}

export function resetServer() {
  return callApi("reset_spots.php", { method: "POST" });
}

export function saveBathyBatch(payload) {
  return callApi("save_import.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchBathyImports() {
  return callApi("list_imports.php").then(result => ({
    list: result?.data || [],
    summary: result?.summary || { batches: 0, points: 0 }
  }));
}

export function clearBathyImports() {
  return callApi("clear_imports.php", { method: "POST" });
}

export function fetchBathyPoints(bounds) {
  const payload = {
    south: bounds?.south,
    west: bounds?.west,
    north: bounds?.north,
    east: bounds?.east
  };
  return callApi("get_import_points.php", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then(result => result || { points: [] });
}

export function fetchCatches(spotId) {
  const payload = spotId ? { spot_id: spotId } : {};
  return callApi("list_catches.php", {
    method: "POST",
    body: JSON.stringify(payload)
  }).then(result => result?.data || []);
}

export function saveCatch(entry) {
  return callApi("save_catch.php", {
    method: "POST",
    body: JSON.stringify(entry)
  }).then(result => result?.catch || null);
}

export function deleteCatch(id) {
  return callApi("delete_catch.php", {
    method: "POST",
    body: JSON.stringify({ id })
  });
}

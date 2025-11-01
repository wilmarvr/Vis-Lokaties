/* =======================================================
   Vis Lokaties — db.js
   Clienthelpers voor PHP API (XAMPP / MySQL)
   ======================================================= */

const API_BASE = "api";

async function callApi(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn(`API ${endpoint} faalde`, err);
    throw err;
  }
}

export async function fetchSpots() {
  const result = await callApi("list_spots.php");
  return result?.data || [];
}

export async function saveSpot(spot) {
  const payload = { ...spot };
  return callApi("save_spot.php", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteSpot(id) {
  return callApi("delete_spot.php", {
    method: "POST",
    body: JSON.stringify({ id })
  });
}

export async function resetServer() {
  return callApi("reset_spots.php", { method: "POST" });
}

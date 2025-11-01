/* =======================================================
   Vis Lokaties — weather.js
   Weerdata, windrichtingoverlay, wxDrawArrows
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log } from "./core.js";
import { randomColor } from "./helpers.js";

let map;
let windLayer = L.layerGroup();

export function initWeather() {
  map = window.L?.mapInstance || window.map;
  if (!map) map = L.map("mapContainer");
  map.addLayer(windLayer);

  const btnWeatherLoad = document.getElementById("btnWeatherLoad");
  const btnWindOverlay = document.getElementById("btnWindOverlay");

  if (btnWeatherLoad)
    btnWeatherLoad.addEventListener("click", loadWeatherData);
  if (btnWindOverlay)
    btnWindOverlay.addEventListener("click", wxDrawArrows);

  log("Weather-module klaar");
}

/* ---------- WEERDATA LADEN (Open-Meteo API) ---------- */
export async function loadWeatherData() {
  try {
    setStatus("Weerdata ophalen...");
    const center = map.getCenter();
    const lat = center.lat.toFixed(4);
    const lon = center.lng.toFixed(4);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,winddirection_10m`
    );
    const data = await res.json();
    window.currentWeather = data;
    setStatus("Weerdata geladen", "ok");
    log("Weerdata", data);
  } catch (err) {
    console.error(err);
    setStatus("Fout bij ophalen weerdata", "error");
  }
}

/* ---------- WINDPIJLEN TEKENEN ---------- */
export function wxDrawArrows() {
  try {
    if (!window.currentWeather) {
      setStatus("Geen weerdata beschikbaar", "error");
      return;
    }

    windLayer.clearLayers();

    const hours = window.currentWeather.hourly;
    const windspeed = hours.windspeed_10m;
    const winddir = hours.winddirection_10m;

    const mapBounds = map.getBounds();
    const spacing = 0.1; // graden afstand
    const density =
      parseInt(document.getElementById("wxDensity")?.value) || 5;

    for (
      let lat = mapBounds.getSouth();
      lat < mapBounds.getNorth();
      lat += spacing / density
    ) {
      for (
        let lon = mapBounds.getWest();
        lon < mapBounds.getEast();
        lon += spacing / density
      ) {
        const idx = Math.floor(Math.random() * windspeed.length);
        const speed = windspeed[idx];
        const dir = winddir[idx];
        drawArrow(lat, lon, dir, speed);
      }
    }

    setStatus("Windoverlay getekend", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Fout bij tekenen windoverlay", "error");
  }
}

/* ---------- PIJL TEKENEN ---------- */
function drawArrow(lat, lon, dir, speed) {
  const len = Math.max(0.005, speed / 200); // schaal pijl
  const color = speedColor(speed);

  const lat2 = lat + len * Math.cos((dir - 90) * (Math.PI / 180));
  const lon2 = lon + len * Math.sin((dir - 90) * (Math.PI / 180));

  const arrow = L.polyline(
    [
      [lat, lon],
      [lat2, lon2]
    ],
    { color, weight: 1.5, opacity: 0.8 }
  );

  const head = L.circleMarker([lat2, lon2], {
    radius: 1.5,
    color,
    fillColor: color,
    fillOpacity: 1
  });

  arrow.addTo(windLayer);
  head.addTo(windLayer);
}

/* ---------- KLEUR OP BASIS VAN SNELHEID ---------- */
function speedColor(speed) {
  if (speed < 5) return "#55f";
  if (speed < 10) return "#0f0";
  if (speed < 20) return "#ff0";
  if (speed < 30) return "#f80";
  return "#f00";
}

/* ---------- EXPORT ALS MODULE ---------- */
window.VisLokWeather = {
  initWeather,
  loadWeatherData,
  wxDrawArrows
};

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initWeather);

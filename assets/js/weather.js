/* =======================================================
   Vis Lokaties — weather.js
   Weerdata, windrichtingoverlay, wxDrawArrows
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log } from "./core.js";

let map;
let windLayer = L.layerGroup();
let output;

export function initWeather() {
  output = document.getElementById("weatherOutput");
  attachHandlers();
  resolveMap();
  log("Weather-module klaar");
}

function resolveMap() {
  map = window.L?.mapInstance || window.map;
  if (map) {
    map.addLayer(windLayer);
  } else {
    document.addEventListener("vislok:map-ready", resolveMap, { once: true });
  }
}

function attachHandlers() {
  const btnWeatherLoad = document.getElementById("btnWeatherLoad");
  const btnWeatherNow = document.getElementById("btnWeatherNow");
  const btnWindOverlay = document.getElementById("btnWindOverlay");

  btnWeatherLoad?.addEventListener("click", loadWeatherData);
  btnWeatherNow?.addEventListener("click", quickWeatherNow);
  btnWindOverlay?.addEventListener("click", wxDrawArrows);
}

/* ---------- WEERDATA LADEN (Open-Meteo API) ---------- */
export async function loadWeatherData() {
  try {
    setStatus("Weerdata ophalen...");
    if (!map) {
      resolveMap();
      if (!map) throw new Error("Kaart niet gereed");
    }
    const center = map.getCenter();
    const lat = center.lat.toFixed(4);
    const lon = center.lng.toFixed(4);
    const params = buildWeatherParams();
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,winddirection_10m&current_weather=true${params}`
    );
    const data = await res.json();
    window.currentWeather = data;
    setStatus("Weerdata geladen", "ok");
    log("Weerdata", data);
    renderWeatherSummary(data);
  } catch (err) {
    console.error(err);
    setStatus("Fout bij ophalen weerdata", "error");
    renderWeatherSummary();
  }
}

function buildWeatherParams() {
  const dateInput = document.getElementById("wxDate");
  const hourSelect = document.getElementById("wxHour");
  const date = dateInput?.value;
  const hour = hourSelect?.value;
  if (!date || hour === undefined) return "";
  return `&start_date=${date}&end_date=${date}`;
}

function quickWeatherNow() {
  const now = new Date();
  const dateInput = document.getElementById("wxDate");
  const hourSelect = document.getElementById("wxHour");
  if (dateInput) dateInput.value = now.toISOString().slice(0, 10);
  if (hourSelect) {
    const hour = now.getHours();
    const options = Array.from(hourSelect.options).map(opt => parseInt(opt.value, 10));
    const closest = options.reduce((prev, curr) => (Math.abs(curr - hour) < Math.abs(prev - hour) ? curr : prev));
    hourSelect.value = closest.toString();
  }
  loadWeatherData();
}

/* ---------- WINDPIJLEN TEKENEN ---------- */
export function wxDrawArrows() {
  try {
    if (!map) {
      resolveMap();
      if (!map) throw new Error("Kaart niet gereed");
    }
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

function renderWeatherSummary(data) {
  if (!output) return;
  if (!data) {
    output.textContent = "Geen weerdata geladen.";
    output.className = "panel-note";
    return;
  }
  const current = data.current_weather;
  if (current) {
    output.innerHTML = `
      <strong>Nu:</strong> ${current.temperature}°C, wind ${current.windspeed} m/s (${current.winddirection}°)
    `;
  } else {
    output.textContent = "Weerdata beschikbaar (geen actuele waarde).";
  }
}

/* ---------- EXPORT ALS MODULE ---------- */
window.VisLokWeather = {
  initWeather,
  loadWeatherData,
  wxDrawArrows
};

/* ---------- AUTO-INIT ---------- */
document.addEventListener("DOMContentLoaded", initWeather);

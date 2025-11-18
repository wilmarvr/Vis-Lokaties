/* =======================================================
   Vis Lokaties — weather.js
   Weerdata, windrichtingoverlay, wxDrawArrows
   Versie: 0.0.0
   ======================================================= */

import { setStatus, log, state, saveState } from "./core.js?v=20250611";
import { t } from "./i18n.js?v=20250611";

let map;
let windLayer = L.layerGroup();
let output;
let densityLabel;

export function initWeather() {
  state.weather = state.weather || { density: 5, overlay: false };
  output = document.getElementById("weatherOutput");
  densityLabel = document.getElementById("wxDensityLabel");
  attachHandlers();
  resolveMap();
  renderWeatherLegend();
  document.addEventListener("vislok:language", onLanguageChange);
  log("Weather-module klaar");
}

function resolveMap() {
  map = window.L?.mapInstance || window.map;
  if (map) {
    map.addLayer(windLayer);
    if (state.weather?.overlay && window.currentWeather) {
      wxDrawArrows();
    }
  } else {
    document.addEventListener("vislok:map-ready", resolveMap, { once: true });
  }
}

function attachHandlers() {
  const btnWeatherLoad = document.getElementById("btnWeatherLoad");
  const btnWeatherNow = document.getElementById("btnWeatherNow");
  const windToggle = document.getElementById("chkWindOverlay");
  const densitySlider = document.getElementById("wxDensity");

  btnWeatherLoad?.addEventListener("click", loadWeatherData);
  btnWeatherNow?.addEventListener("click", quickWeatherNow);
  if (windToggle) {
    windToggle.checked = !!state.weather?.overlay;
    windToggle.addEventListener("change", () => {
      state.weather = { ...state.weather, overlay: windToggle.checked };
      saveState();
      if (windToggle.checked) {
        wxDrawArrows();
      } else {
        windLayer.clearLayers();
        setStatus(t("status_wind_cleared", "Windoverlay verborgen"), "ok");
      }
    });
  }
  if (densitySlider) {
    const stored = state.weather?.density;
    if (Number.isFinite(stored)) {
      densitySlider.value = stored;
    }
    densitySlider.addEventListener("input", () => {
      state.weather = {
        ...state.weather,
        density: parseInt(densitySlider.value, 10) || 5
      };
      saveState();
      updateDensityLabel();
      if (windToggle?.checked && window.currentWeather) {
        wxDrawArrows();
      }
    });
  }
  updateDensityLabel();
}

/* ---------- WEERDATA LADEN (Open-Meteo API) ---------- */
export function loadWeatherData() {
  setStatus(t("status_weather_loading", "Weerdata ophalen..."));
  if (!map) {
    resolveMap();
    if (!map) {
      setStatus(t("status_map_not_ready", "Kaart niet gereed"), "error");
      renderWeatherSummary();
      return;
    }
  }

  const center = map.getCenter();
  const lat = center.lat.toFixed(4);
  const lon = center.lng.toFixed(4);
  const params = computeWeatherParams();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,winddirection_10m&current_weather=true${params}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      window.currentWeather = data;
      setStatus(t("status_weather_loaded", "Weerdata geladen"), "ok");
      log("Weerdata", data);
      renderWeatherSummary(data);
      const windToggle = document.getElementById("chkWindOverlay");
      if (windToggle?.checked) {
        wxDrawArrows();
      }
    })
    .catch(err => {
      console.error(err);
      setStatus(t("status_weather_error", "Fout bij ophalen weerdata"), "error");
      renderWeatherSummary();
    });
}

function computeWeatherParams() {
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
      if (!map) throw new Error(t("status_map_not_ready", "Kaart niet gereed"));
    }
    if (!window.currentWeather) {
      setStatus(t("status_weather_none", "Geen weerdata beschikbaar"), "error");
      return;
    }

    windLayer.clearLayers();
    if (!map.hasLayer(windLayer)) {
      windLayer.addTo(map);
    }

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

    setStatus(t("status_wind_drawn", "Windoverlay getekend"), "ok");
  } catch (err) {
    console.error(err);
    setStatus(t("status_wind_error", "Fout bij tekenen windoverlay"), "error");
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
    output.textContent = t("weather_idle", "Geen weerdata geladen.");
    output.className = "panel-note";
    return;
  }
  const current = data.current_weather;
  if (current) {
    const template = t(
      "weather_summary_template",
      "<strong>Nu</strong> {temp}°C, wind {speed} m/s ({dir}°)"
    );
    output.innerHTML = template
      .replace("{temp}", current.temperature)
      .replace("{speed}", current.windspeed)
      .replace("{dir}", current.winddirection);
  } else {
    output.textContent = t("status_weather_no_current", "Weerdata beschikbaar (geen actuele waarde).");
  }
}

function updateDensityLabel() {
  const slider = document.getElementById("wxDensity");
  if (slider && densityLabel) {
    densityLabel.textContent = t("weather_density_value", "{value}").replace("{value}", slider.value);
  }
}

function renderWeatherLegend() {
  const legend = document.getElementById("weatherLegend");
  if (!legend) return;
  legend.className = "panel-note weather-legend";
  const items = [
    { color: "#55f", key: "weather_legend_calm", fallback: "Kalm (<5 m/s)" },
    { color: "#0f0", key: "weather_legend_breeze", fallback: "Bries (5–10 m/s)" },
    { color: "#ff0", key: "weather_legend_fresh", fallback: "Stevig (10–20 m/s)" },
    { color: "#f80", key: "weather_legend_strong", fallback: "Sterk (20–30 m/s)" },
    { color: "#f00", key: "weather_legend_gale", fallback: "Storm (>30 m/s)" }
  ];
  legend.innerHTML = `
    <strong>${t("weather_legend_title", "Windlegenda")}</strong>
    <ul>
      ${items
        .map(
          item =>
            `<li><span class="legend-dot" style="background:${item.color}"></span>${t(item.key, item.fallback)}</li>`
        )
        .join("")}
    </ul>
  `;
}

function onLanguageChange() {
  updateDensityLabel();
  renderWeatherLegend();
  if (window.currentWeather) {
    renderWeatherSummary(window.currentWeather);
  }
  const windToggle = document.getElementById("chkWindOverlay");
  if (windToggle) {
    windToggle.checked = !!state.weather?.overlay;
    if (!windToggle.checked) {
      windLayer.clearLayers();
    } else if (window.currentWeather) {
      wxDrawArrows();
    }
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

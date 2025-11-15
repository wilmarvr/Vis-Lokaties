/* =======================================================
   Vis Lokaties — helpers.js
   Hulpfuncties en wiskundige hulpmiddelen
   Versie: 0.0.0
   ======================================================= */

/* ---------- UNIEKE ID ---------- */
export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/* ---------- AFSTAND (METER) ---------- */
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000; // aardstraal in meter
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ---------- POLYGON MAKEN UIT PUNTEN ---------- */
export function polygonFromPoints(points) {
  if (!points || points.length < 3) return null;
  const coords = points.map(p => [p.lng, p.lat]);
  coords.push(coords[0]); // sluit polygon
  return turf.polygon([coords]);
}

/* ---------- GEMIDDELDE DIEPTE ---------- */
export function avgDepth(points) {
  if (!points.length) return 0;
  const sum = points.reduce((a, p) => a + (p.val || 0), 0);
  return sum / points.length;
}

/* ---------- KLEURINTERPOLATIE (VOOR HEATMAP LEGENDA) ---------- */
export function colorScale(value, min = 0, max = 1) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r = Math.floor(255 * ratio);
  const g = Math.floor(255 * (1 - ratio));
  const b = 255 - Math.floor(255 * Math.abs(ratio - 0.5) * 2);
  return `rgb(${r},${g},${b})`;
}

/* ---------- BOUNDS UIT PUNTEN ---------- */
export function boundsFromPoints(points) {
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs)
  };
}

/* ---------- RANDOM KLEUR ---------- */
export function randomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
}

/* ---------- FORMATTERS ---------- */
export function formatLatLng(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function escapeHtml(value = "") {
  return `${value}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- DELAY / WACHT ---------- */
export function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/* ---------- EXPORT ALS MODULE ---------- */
window.VisLokHelpers = {
  uid,
  distanceM,
  polygonFromPoints,
  avgDepth,
  colorScale,
  boundsFromPoints,
  randomColor,
  formatLatLng,
  escapeHtml,
  sleep
};

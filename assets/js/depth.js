/* =======================================================
   Vis Lokaties — depth.js
   Diepte-interpolatie en hulpfuncties
   Versie: 0.0.0
   ======================================================= */

import { distanceM } from "./helpers.js?v=20250715";

function normalizedPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map(p => {
      const lat = Number(p?.lat ?? p?.latitude);
      const lng = Number(p?.lng ?? p?.lon ?? p?.longitude);
      const depth = Number(p?.val ?? p?.depth);
      return { lat, lng, depth };
    })
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.depth));
}

export function interpolateDepthAt(lat, lng, points, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const normalized = normalizedPoints(points);
  if (!normalized.length) return null;

  const maxNeighbors = Number.isFinite(options.maxNeighbors) ? options.maxNeighbors : 25;
  const cutoff = Number.isFinite(options.cutoff) ? options.cutoff : 1200;
  const power = Number.isFinite(options.power) ? options.power : 2;

  const candidates = [];
  let nearest = Infinity;

  for (const p of normalized) {
    const distance = distanceM(lat, lng, p.lat, p.lng);
    if (!Number.isFinite(distance)) continue;
    if (distance < nearest) nearest = distance;
    if (distance <= cutoff) {
      candidates.push({ depth: p.depth, distance });
    }
  }

  if (!candidates.length) {
    const sorted = normalized
      .map(p => ({ depth: p.depth, distance: distanceM(lat, lng, p.lat, p.lng) }))
      .filter(entry => Number.isFinite(entry.distance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxNeighbors);
    candidates.push(...sorted);
  }

  if (!candidates.length) return null;

  let numerator = 0;
  let denominator = 0;
  let count = 0;

  for (const { depth, distance } of candidates.slice(0, maxNeighbors)) {
    if (distance === 0) {
      return { value: depth, distance: 0, count: 1 };
    }
    const weight = 1 / Math.pow(distance, power);
    numerator += weight * depth;
    denominator += weight;
    count += 1;
  }

  if (!denominator) return null;
  return { value: numerator / denominator, distance: nearest, count };
}

export function depthSummary(points) {
  const normalized = normalizedPoints(points);
  if (!normalized.length) return { min: null, max: null, avg: null };
  const values = normalized.map(p => p.depth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, avg };
}

window.VisLokDepth = { interpolateDepthAt, depthSummary };

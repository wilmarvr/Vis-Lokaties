/* =======================================================
   Vis Lokaties — db.js
   Lokale opslaghelpers (localStorage) voor spots, vangsten en bathy-imports
   ======================================================= */

const DB_KEY = "vislok_local_db_v1";

function loadDb() {
  const empty = { spots: [], catches: [], imports: [], importPoints: [] };
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { ...empty };
    const parsed = JSON.parse(raw);
    return {
      ...empty,
      ...parsed,
      spots: Array.isArray(parsed?.spots) ? parsed.spots : [],
      catches: Array.isArray(parsed?.catches) ? parsed.catches : [],
      imports: Array.isArray(parsed?.imports) ? parsed.imports : [],
      importPoints: Array.isArray(parsed?.importPoints) ? parsed.importPoints : []
    };
  } catch (err) {
    console.warn("Kon lokale database niet laden, resetten", err);
    return { ...empty };
  }
}

function saveDb(db) {
  const normalized = {
    spots: Array.isArray(db?.spots) ? db.spots : [],
    catches: Array.isArray(db?.catches) ? db.catches : [],
    imports: Array.isArray(db?.imports) ? db.imports : [],
    importPoints: Array.isArray(db?.importPoints) ? db.importPoints : []
  };
  localStorage.setItem(DB_KEY, JSON.stringify(normalized));
  return normalized;
}

function nextId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function normalizeSpot(spot) {
  if (!spot) return null;
  const base = { ...spot };
  base.id = base.id || nextId(spot.type || "spot");
  base.type = base.type || "water";
  base.lat = Number(base.lat) || 0;
  base.lng = Number(base.lng) || 0;
  if (base.water_id !== undefined && base.waterId === undefined) base.waterId = base.water_id;
  if (base.stek_id !== undefined && base.stekId === undefined) base.stekId = base.stek_id;
  delete base.water_id;
  delete base.stek_id;
  return base;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

export function fetchSpots() {
  const db = loadDb();
  return Promise.resolve(db.spots.map(normalizeSpot).filter(Boolean));
}

export function saveSpot(spot) {
  const db = loadDb();
  const record = normalizeSpot(spot);
  const list = db.spots || [];
  const idx = list.findIndex(item => item.id === record.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.push(record);
  }
  db.spots = list;
  saveDb(db);
  return Promise.resolve(record);
}

export function deleteSpot(id) {
  const db = loadDb();
  db.spots = (db.spots || []).filter(item => item.id !== id);
  saveDb(db);
  return Promise.resolve();
}

export function resetServer() {
  saveDb({ spots: [], catches: [], imports: [], importPoints: [] });
  return Promise.resolve();
}

export function saveBathyBatch(payload) {
  const db = loadDb();
  const id = payload?.batchId || nextId("import");
  const points = Array.isArray(payload?.points)
    ? payload.points.map(p => ({ lat: Number(p.lat) || 0, lng: Number(p.lng) || 0, val: p.val ?? null }))
    : [];
  const entry = {
    id,
    source: payload?.source || "csv",
    file: payload?.file || null,
    created: new Date().toISOString(),
    count: points.length
  };
  db.imports = [...(db.imports || []).filter(item => item.id !== id), entry];
  db.importPoints = [...(db.importPoints || []), ...points];
  saveDb(db);
  return Promise.resolve({ stored: points.length, entry });
}

export function fetchBathyImports() {
  const db = loadDb();
  const list = db.imports || [];
  const summary = {
    batches: list.length,
    points: (db.importPoints || []).length
  };
  return Promise.resolve({ list, summary });
}

export function clearBathyImports() {
  const db = loadDb();
  db.imports = [];
  db.importPoints = [];
  saveDb(db);
  return Promise.resolve();
}

export function fetchBathyPoints(bounds) {
  const db = loadDb();
  let points = db.importPoints || [];
  if (bounds && Object.values(bounds).every(v => typeof v === "number")) {
    points = points.filter(p =>
      p.lat >= bounds.south &&
      p.lat <= bounds.north &&
      p.lng >= bounds.west &&
      p.lng <= bounds.east
    );
  }
  return Promise.resolve({ points });
}

export function fetchCatches(spotId) {
  const db = loadDb();
  const list = db.catches || [];
  const filtered = spotId ? list.filter(item => item.spot_id === spotId || item.spotId === spotId) : list;
  return Promise.resolve(filtered.map(item => ({ ...item, spotId: item.spotId ?? item.spot_id }))); 
}

export function saveCatch(entry) {
  const db = loadDb();
  const record = { ...entry };
  record.id = record.id || nextId("catch");
  if (record.spot_id !== undefined && record.spotId === undefined) record.spotId = record.spot_id;
  delete record.spot_id;
  db.catches = [...(db.catches || []).filter(c => c.id !== record.id), record];
  saveDb(db);
  return Promise.resolve(record);
}

export function deleteCatch(id) {
  const db = loadDb();
  db.catches = (db.catches || []).filter(item => item.id !== id);
  saveDb(db);
  return Promise.resolve();
}

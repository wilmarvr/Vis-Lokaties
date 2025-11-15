-- =======================================================
-- Vis Lokaties – database.sql
-- SQL-structuur voor toekomstige opslag
-- Versie 0.0.0
-- =======================================================

CREATE TABLE IF NOT EXISTS waters (
  id TEXT PRIMARY KEY,
  name TEXT,
  geojson TEXT
);

CREATE TABLE IF NOT EXISTS steks (
  id TEXT PRIMARY KEY,
  name TEXT,
  lat REAL,
  lng REAL,
  waterId TEXT
);

CREATE TABLE IF NOT EXISTS rigs (
  id TEXT PRIMARY KEY,
  name TEXT,
  lat REAL,
  lng REAL,
  stekId TEXT,
  waterId TEXT
);

CREATE TABLE IF NOT EXISTS bathy (
  lat REAL,
  lon REAL,
  dep REAL
);

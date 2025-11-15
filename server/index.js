const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const DB_KEY = 'lv_db_main';

const DEFAULT_DB = {
  waters: [],
  steks: [],
  rigs: [],
  bathy: { points: [], datasets: [] },
  settings: { waterColor: '#33a1ff' }
};

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.run('INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)', [DB_KEY, JSON.stringify(DEFAULT_DB)]);
});

function readStore() {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM kv WHERE key = ?', [DB_KEY], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(DEFAULT_DB);
      try {
        const parsed = JSON.parse(row.value);
        resolve(parsed || DEFAULT_DB);
      } catch (error) {
        console.warn('Kon databasewaarde niet parseren, reset naar default', error);
        resolve(DEFAULT_DB);
      }
    });
  });
}

function writeStore(value) {
  return new Promise((resolve, reject) => {
    db.run('REPLACE INTO kv (key, value) VALUES (?, ?)', [DB_KEY, JSON.stringify(value)], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

app.get('/api/db', async (req, res) => {
  try {
    const payload = await readStore();
    res.json(payload);
  } catch (error) {
    console.error('GET /api/db mislukt', error);
    res.status(500).json({ error: 'Kon database niet lezen' });
  }
});

app.post('/api/db', async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Ongeldige payload' });
  }
  try {
    await writeStore(incoming);
    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/db mislukt', error);
    res.status(500).json({ error: 'Kon database niet opslaan' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Vis Lokaties server gestart op http://localhost:${PORT}`);
});

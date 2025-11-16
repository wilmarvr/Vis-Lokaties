const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 3000;
const DB_KEY = 'lv_db_main';
const DB_DEFAULT_NAME = 'vis_lokaties';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || DB_DEFAULT_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTIONS || 5),
  namedPlaceholders: true,
  charset: 'utf8mb4_general_ci'
};

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

let pool;

async function initDatabase() {
  const adminConnection = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    multipleStatements: true
  });

  await adminConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await adminConnection.end();

  pool = mysql.createPool(DB_CONFIG);

  await pool.execute(
    'CREATE TABLE IF NOT EXISTS kv (id VARCHAR(64) NOT NULL PRIMARY KEY, value LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
  );

  const [rows] = await pool.query('SELECT id FROM kv WHERE id = ?', [DB_KEY]);
  if (!rows.length) {
    await pool.execute('INSERT INTO kv (id, value) VALUES (?, ?)', [DB_KEY, JSON.stringify(DEFAULT_DB)]);
  }
}

async function readStore() {
  const [rows] = await pool.query('SELECT value FROM kv WHERE id = ?', [DB_KEY]);
  if (!rows.length) {
    return DEFAULT_DB;
  }
  try {
    return JSON.parse(rows[0].value) || DEFAULT_DB;
  } catch (error) {
    console.warn('Kon databasewaarde niet parseren, reset naar default', error);
    return DEFAULT_DB;
  }
}

async function writeStore(value) {
  await pool.execute(
    'INSERT INTO kv (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [DB_KEY, JSON.stringify(value)]
  );
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

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Vis Lokaties server gestart op http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Kon MySQL niet initialiseren. Controleer je instellingen.', error);
    process.exit(1);
  });

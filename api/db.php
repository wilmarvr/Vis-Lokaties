<?php
require_once __DIR__ . '/config.php';

/**
 * Run an API action with consistent JSON error handling.
 * Any PHP warnings/notices are converted to exceptions so we can surface
 * the underlying message back to the client instead of a blank 500 page.
 */
function vislok_api(callable $handler): void {
    $prevHandler = set_error_handler(static function ($severity, $message, $file, $line) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    });

    try {
        $result = $handler();
        if ($result !== null) {
            vislok_json_response($result);
        }
    } catch (Throwable $e) {
        vislok_json_response(['error' => $e->getMessage()], 500);
    } finally {
        if ($prevHandler !== null) {
            set_error_handler($prevHandler);
        } else {
            restore_error_handler();
        }
    }
}

function vislok_get_connection(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        throw new RuntimeException('SQLite driver ontbreekt. Installeer pdo_sqlite.');
    }

    $path = vislok_sqlite_path(DB_PATH);
    [$path, $dir] = vislok_prepare_sqlite_path($path);

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $pdo = new PDO('sqlite:' . $path, null, null, $options);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');

    vislok_ensure_schema($pdo);
    return $pdo;
}

function vislok_sqlite_path(string $path): string {
    $path = trim($path);
    if ($path === '') {
        $path = __DIR__ . '/../data/vislok.sqlite';
    }
    if (!preg_match('~^(/|[A-Za-z]:[\\/])~', $path)) {
        $base = realpath(__DIR__ . '/..') ?: dirname(__DIR__);
        $path = rtrim($base, '/\\') . '/' . ltrim($path, '/\\');
    }
    return $path;
}

/**
 * Ensure the target SQLite directory exists and the file is present.
 * Falls back to the default data path if the custom path cannot be created.
 */
function vislok_prepare_sqlite_path(string $path): array {
    $path = vislok_sqlite_path($path);
    $dir = dirname($path);

    $ensureDir = static function (string $candidate): void {
        if (is_dir($candidate)) {
            return;
        }
        if (!@mkdir($candidate, 0775, true) && !is_dir($candidate)) {
            throw new RuntimeException('Kan databasepad niet aanmaken: ' . $candidate);
        }
    };

    try {
        $ensureDir($dir);
    } catch (Throwable $e) {
        $fallback = vislok_sqlite_path(__DIR__ . '/../data/vislok.sqlite');
        $fallbackDir = dirname($fallback);
        $ensureDir($fallbackDir);
        $path = $fallback;
        $dir = $fallbackDir;
    }

    if (!file_exists($path)) {
        $handle = @fopen($path, 'c');
        if ($handle === false) {
            throw new RuntimeException('Kon SQLite-bestand niet aanmaken: ' . $path);
        }
        fclose($handle);
    }

    return [$path, $dir];
}

function vislok_ensure_schema(PDO $pdo): void {
    vislok_create_waters_table($pdo);
    vislok_create_stekken_table($pdo);
    vislok_create_rigs_table($pdo);
    vislok_create_bathy_tables($pdo);
    vislok_create_catches_table($pdo);
    vislok_migrate_legacy_spots($pdo);
}

function vislok_create_waters_table(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS waters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        val REAL NULL,
        note TEXT NULL,
        polygon TEXT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_waters_coords ON waters(lat, lng)');
}

function vislok_create_stekken_table(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS stekken (
        id TEXT PRIMARY KEY,
        water_id TEXT NULL,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        val REAL NULL,
        note TEXT NULL,
        polygon TEXT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (water_id) REFERENCES waters(id) ON DELETE SET NULL
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_stek_water ON stekken(water_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_stek_coords ON stekken(lat, lng)');
}

function vislok_create_rigs_table(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS rigs (
        id TEXT PRIMARY KEY,
        stek_id TEXT NULL,
        water_id TEXT NULL,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        val REAL NULL,
        note TEXT NULL,
        polygon TEXT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stek_id) REFERENCES stekken(id) ON DELETE CASCADE,
        FOREIGN KEY (water_id) REFERENCES waters(id) ON DELETE SET NULL
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rig_stek ON rigs(stek_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rig_water ON rigs(water_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rig_coords ON rigs(lat, lng)');
}

function vislok_create_bathy_tables(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS bathy_imports (
        id TEXT PRIMARY KEY,
        source TEXT NULL,
        file_name TEXT NULL,
        total_points INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS bathy_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        depth REAL NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (import_id) REFERENCES bathy_imports(id) ON DELETE CASCADE
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_import ON bathy_points(import_id)');
}

function vislok_create_catches_table(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS catches (
        id TEXT PRIMARY KEY,
        spot_id TEXT NOT NULL,
        rig_id TEXT NULL,
        title TEXT NULL,
        species TEXT NULL,
        weight_kg REAL NULL,
        length_cm REAL NULL,
        bait TEXT NULL,
        note TEXT NULL,
        photo_path TEXT NULL,
        water_temp REAL NULL,
        air_temp REAL NULL,
        wind_dir TEXT NULL,
        wind_speed REAL NULL,
        pressure_hpa REAL NULL,
        moon_phase TEXT NULL,
        caught_at TEXT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NULL,
        FOREIGN KEY (spot_id) REFERENCES stekken(id) ON DELETE CASCADE,
        FOREIGN KEY (rig_id) REFERENCES rigs(id) ON DELETE SET NULL
    )');

    vislok_ensure_catch_alters($pdo);
}

function vislok_ensure_catch_alters(PDO $pdo): void {
    // Aanvullende kolommen/indexen toevoegen zonder data te verliezen.
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN rig_id TEXT NULL');
    } catch (Throwable $e) {
    }
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN water_temp REAL NULL');
    } catch (Throwable $e) {
    }
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN air_temp REAL NULL');
    } catch (Throwable $e) {
    }
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN wind_dir TEXT NULL');
    } catch (Throwable $e) {
    }
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN wind_speed REAL NULL');
    } catch (Throwable $e) {
    }
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN pressure_hpa REAL NULL');
    } catch (Throwable $e) {
    }
    try {
        $pdo->exec('ALTER TABLE catches ADD COLUMN moon_phase TEXT NULL');
    } catch (Throwable $e) {
    }

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_spot ON catches(spot_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rig ON catches(rig_id)');
}

function vislok_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = :name LIMIT 1");
    $stmt->execute([':name' => $table]);
    return (bool)$stmt->fetchColumn();
}

function vislok_migrate_legacy_spots(PDO $pdo): void {
    if (!vislok_table_exists($pdo, 'spots')) {
        return;
    }

    $count = (int)$pdo->query('SELECT COUNT(*) FROM spots')->fetchColumn();
    if ($count === 0) {
        $pdo->exec('DROP TABLE spots');
        return;
    }

    $existing = (int)$pdo->query('SELECT COUNT(*) FROM waters')->fetchColumn()
        + (int)$pdo->query('SELECT COUNT(*) FROM stekken')->fetchColumn()
        + (int)$pdo->query('SELECT COUNT(*) FROM rigs')->fetchColumn();
    if ($existing > 0) {
        return;
    }

    $stmt = $pdo->query('SELECT id, type, name, lat, lng, val, note, polygon, water_id, stek_id, created_at FROM spots ORDER BY created_at ASC');
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $polygon = $row['polygon'] ?? null;
        $waterId = $row['water_id'] ?? null;
        $stekId = $row['stek_id'] ?? null;
        switch ($row['type']) {
            case 'water':
                $insert = $pdo->prepare('INSERT OR IGNORE INTO waters (id, name, lat, lng, val, note, polygon, created_at) VALUES (:id, :name, :lat, :lng, :val, :note, :polygon, :created_at)');
                $insert->execute([
                    ':id' => $row['id'],
                    ':name' => $row['name'],
                    ':lat' => $row['lat'],
                    ':lng' => $row['lng'],
                    ':val' => $row['val'],
                    ':note' => $row['note'],
                    ':polygon' => $polygon,
                    ':created_at' => $row['created_at'],
                ]);
                break;
            case 'stek':
                $insert = $pdo->prepare('INSERT OR IGNORE INTO stekken (id, water_id, name, lat, lng, val, note, polygon, created_at) VALUES (:id, :water_id, :name, :lat, :lng, :val, :note, :polygon, :created_at)');
                $insert->execute([
                    ':id' => $row['id'],
                    ':water_id' => $waterId,
                    ':name' => $row['name'],
                    ':lat' => $row['lat'],
                    ':lng' => $row['lng'],
                    ':val' => $row['val'],
                    ':note' => $row['note'],
                    ':polygon' => $polygon,
                    ':created_at' => $row['created_at'],
                ]);
                break;
            case 'rig':
                $insert = $pdo->prepare('INSERT OR IGNORE INTO rigs (id, stek_id, water_id, name, lat, lng, val, note, polygon, created_at) VALUES (:id, :stek_id, :water_id, :name, :lat, :lng, :val, :note, :polygon, :created_at)');
                $insert->execute([
                    ':id' => $row['id'],
                    ':stek_id' => $stekId,
                    ':water_id' => $waterId,
                    ':name' => $row['name'],
                    ':lat' => $row['lat'],
                    ':lng' => $row['lng'],
                    ':val' => $row['val'],
                    ':note' => $row['note'],
                    ':polygon' => $polygon,
                    ':created_at' => $row['created_at'],
                ]);
                break;
        }
    }

    $pdo->exec('DROP TABLE spots');
}

function vislok_read_json(): array {
    $payload = file_get_contents('php://input');
    if (!$payload) {
        return [];
    }
    $data = json_decode($payload, true);
    return is_array($data) ? $data : [];
}

function vislok_json_response(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function vislok_fetch_water(PDO $pdo, string $id): ?array {
    if (!$id) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM waters WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function vislok_fetch_stek(PDO $pdo, string $id): ?array {
    if (!$id) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM stekken WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function vislok_fetch_rig(PDO $pdo, string $id): ?array {
    if (!$id) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM rigs WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function vislok_find_spot(PDO $pdo, string $id): ?array {
    if (!$id) {
        return null;
    }
    $queries = [
        'SELECT id, "water" AS type, name, lat, lng, val, note, polygon, NULL AS water_id, NULL AS stek_id, created_at FROM waters WHERE id = :id LIMIT 1',
        'SELECT id, "stek" AS type, name, lat, lng, val, note, polygon, water_id, NULL AS stek_id, created_at FROM stekken WHERE id = :id LIMIT 1',
        'SELECT id, "rig" AS type, name, lat, lng, val, note, polygon, water_id, stek_id, created_at FROM rigs WHERE id = :id LIMIT 1',
    ];
    foreach ($queries as $sql) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            if (isset($row['polygon'])) {
                $decoded = json_decode($row['polygon'], true);
                $row['polygon'] = $decoded ?: null;
            }
            return $row;
        }
    }
    return null;
}

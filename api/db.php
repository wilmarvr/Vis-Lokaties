<?php
require_once __DIR__ . '/config.php';

function vislok_get_connection(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    // Probeer eerst MySQL/MariaDB; val daarna terug op SQLite zodat lokale demo's
    // en tests geen 500-fouten geven wanneer er geen MySQL draait.
    try {
        $baseDsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', DB_HOST, DB_PORT);
        $adminPdo = new PDO($baseDsn, DB_USER, DB_PASS, $options);
        $adminPdo->exec(sprintf('CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', DB_NAME));

        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        $sqlitePath = dirname(__DIR__) . '/data/vislok.sqlite';
        if (!is_dir(dirname($sqlitePath))) {
            mkdir(dirname($sqlitePath), 0775, true);
        }
        $pdo = new PDO('sqlite:' . $sqlitePath, null, null, $options);
    }

    vislok_ensure_schema($pdo);
    return $pdo;
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
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
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
        return;
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS waters (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        val DOUBLE NULL,
        note TEXT NULL,
        polygon LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_waters_coords (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function vislok_create_stekken_table(PDO $pdo): void {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
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
        return;
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS stekken (
        id VARCHAR(64) PRIMARY KEY,
        water_id VARCHAR(64) NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        val DOUBLE NULL,
        note TEXT NULL,
        polygon LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_stek_water (water_id),
        INDEX idx_stek_coords (lat, lng),
        CONSTRAINT fk_stek_water FOREIGN KEY (water_id) REFERENCES waters(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function vislok_create_rigs_table(PDO $pdo): void {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
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
        return;
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS rigs (
        id VARCHAR(64) PRIMARY KEY,
        stek_id VARCHAR(64) NULL,
        water_id VARCHAR(64) NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        val DOUBLE NULL,
        note TEXT NULL,
        polygon LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rig_stek (stek_id),
        INDEX idx_rig_water (water_id),
        INDEX idx_rig_coords (lat, lng),
        CONSTRAINT fk_rig_stek FOREIGN KEY (stek_id) REFERENCES stekken(id) ON DELETE CASCADE,
        CONSTRAINT fk_rig_water FOREIGN KEY (water_id) REFERENCES waters(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function vislok_create_bathy_tables(PDO $pdo): void {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
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
        return;
    }

function vislok_create_bathy_tables(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS bathy_imports (
        id VARCHAR(64) PRIMARY KEY,
        source VARCHAR(255) NULL,
        file_name VARCHAR(255) NULL,
        total_points INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

    $pdo->exec('CREATE TABLE IF NOT EXISTS bathy_points (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        import_id VARCHAR(64) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        depth DOUBLE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_import (import_id),
        CONSTRAINT fk_bathy_import FOREIGN KEY (import_id) REFERENCES bathy_imports(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

}

function vislok_create_catches_table(PDO $pdo): void {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
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
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_spot ON catches(spot_id)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rig ON catches(rig_id)');
        return;
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS catches (
        id VARCHAR(64) PRIMARY KEY,
        spot_id VARCHAR(64) NOT NULL,
        rig_id VARCHAR(64) NULL,
        title VARCHAR(255) NULL,
        species VARCHAR(255) NULL,
        weight_kg DOUBLE NULL,
        length_cm DOUBLE NULL,
        bait VARCHAR(255) NULL,
        note TEXT NULL,
        photo_path VARCHAR(255) NULL,
        water_temp DOUBLE NULL,
        air_temp DOUBLE NULL,
        wind_dir VARCHAR(12) NULL,
        wind_speed DOUBLE NULL,
        pressure_hpa DOUBLE NULL,
        moon_phase VARCHAR(64) NULL,
        caught_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL,
        INDEX idx_spot (spot_id),
        INDEX idx_rig (rig_id),
        CONSTRAINT fk_catch_stek FOREIGN KEY (spot_id) REFERENCES stekken(id) ON DELETE CASCADE,
        CONSTRAINT fk_catch_rig FOREIGN KEY (rig_id) REFERENCES rigs(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

    vislok_ensure_catch_alters($pdo);
}

function vislok_ensure_catch_alters(PDO $pdo): void {
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        return; // SQLite ondersteunt ALTER-table varianten hieronder niet, maar heeft al het juiste schema.
    }
    $statements = [
        'ALTER TABLE catches ADD COLUMN rig_id VARCHAR(64) NULL',
        'ALTER TABLE catches ADD INDEX idx_rig (rig_id)',
        'ALTER TABLE catches DROP FOREIGN KEY fk_catch_spot',
        'ALTER TABLE catches DROP FOREIGN KEY fk_catch_rig',
        'ALTER TABLE catches ADD CONSTRAINT fk_catch_stek FOREIGN KEY (spot_id) REFERENCES stekken(id) ON DELETE CASCADE',
        'ALTER TABLE catches ADD CONSTRAINT fk_catch_rig FOREIGN KEY (rig_id) REFERENCES rigs(id) ON DELETE SET NULL'
    ];

    foreach ($statements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $e) {
            // kolom, index of constraint bestaat al
        }
    }
}

function vislok_table_exists(PDO $pdo, string $table): bool {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        $stmt = $pdo->prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = :name LIMIT 1");
        $stmt->execute([':name' => $table]);
        return (bool)$stmt->fetchColumn();
    }

    $stmt = $pdo->prepare('SHOW TABLES LIKE :name');
    $stmt->execute([':name' => $table]);
    return (bool)$stmt->fetchColumn();
}

function vislok_migrate_legacy_spots(PDO $pdo): void {
    if (!vislok_table_exists($pdo, 'spots')) {
        return;
    }

    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $insertIgnore = $driver === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE';

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
                $insert = $pdo->prepare("$insertIgnore INTO waters (id, name, lat, lng, val, note, polygon, created_at) VALUES (:id, :name, :lat, :lng, :val, :note, :polygon, :created_at)");
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
                $insert = $pdo->prepare("$insertIgnore INTO stekken (id, water_id, name, lat, lng, val, note, polygon, created_at) VALUES (:id, :water_id, :name, :lat, :lng, :val, :note, :polygon, :created_at)");
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
                $insert = $pdo->prepare("$insertIgnore INTO rigs (id, stek_id, water_id, name, lat, lng, val, note, polygon, created_at) VALUES (:id, :stek_id, :water_id, :name, :lat, :lng, :val, :note, :polygon, :created_at)");
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

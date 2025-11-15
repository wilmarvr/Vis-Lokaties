<?php
require_once __DIR__ . '/config.php';

function vislok_get_connection(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $baseDsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', DB_HOST, DB_PORT);
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $adminPdo = new PDO($baseDsn, DB_USER, DB_PASS, $options);
    $adminPdo->exec(sprintf('CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', DB_NAME));

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    vislok_ensure_schema($pdo);
    return $pdo;
}

function vislok_ensure_schema(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS spots (
        id VARCHAR(64) PRIMARY KEY,
        type ENUM("water","stek","rig") NOT NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        val DOUBLE NULL,
        note TEXT NULL,
        polygon LONGTEXT NULL,
        water_id VARCHAR(64) NULL,
        stek_id VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_water (water_id),
        INDEX idx_stek (stek_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

    $alterStatements = [
        'ALTER TABLE spots ADD COLUMN polygon LONGTEXT NULL',
        'ALTER TABLE spots ADD COLUMN note TEXT NULL',
        'ALTER TABLE spots ADD COLUMN water_id VARCHAR(64) NULL',
        'ALTER TABLE spots ADD COLUMN stek_id VARCHAR(64) NULL',
        'ALTER TABLE spots ADD INDEX idx_type (type)',
        'ALTER TABLE spots ADD INDEX idx_water (water_id)',
        'ALTER TABLE spots ADD INDEX idx_stek (stek_id)'
    ];

    foreach ($alterStatements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $e) {
            // kolom of index bestaat al
        }
    }

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

    $pdo->exec('CREATE TABLE IF NOT EXISTS catches (
        id VARCHAR(64) PRIMARY KEY,
        spot_id VARCHAR(64) NOT NULL,
        rig_id VARCHAR(64) NULL,
        title VARCHAR(255) NULL,
        species VARCHAR(255) NULL,
        weight_kg DOUBLE NULL,
        length_cm DOUBLE NULL,
        notes TEXT NULL,
        photo_path VARCHAR(255) NULL,
        caught_at DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_spot (spot_id),
        INDEX idx_rig (rig_id),
        CONSTRAINT fk_catch_spot FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
        CONSTRAINT fk_catch_rig FOREIGN KEY (rig_id) REFERENCES spots(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

    $catchAlterStatements = [
        'ALTER TABLE catches ADD COLUMN rig_id VARCHAR(64) NULL',
        'ALTER TABLE catches ADD INDEX idx_rig (rig_id)',
        'ALTER TABLE catches ADD CONSTRAINT fk_catch_rig FOREIGN KEY (rig_id) REFERENCES spots(id) ON DELETE SET NULL'
    ];

    foreach ($catchAlterStatements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $e) {
            // kolom, index of constraint bestaat al
        }
    }
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

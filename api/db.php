<?php
// Shared MySQL helpers

function vislok_load_config(?array $overrides = null): array
{
    static $config = null;
    if ($config === null) {
        $base = require __DIR__ . '/config.php';
        $config = $base['db'];

        $localPath = __DIR__ . '/../data/config.local.json';
        if (is_file($localPath)) {
            $json = file_get_contents($localPath);
            $data = json_decode($json, true);
            if (is_array($data)) {
                $config = array_merge($config, array_intersect_key($data, $config));
            }
        }
    }

    if ($overrides && is_array($overrides)) {
        $config = array_merge($config, array_intersect_key($overrides, $config));
    }

    $config['host'] = $config['host'] ?: '127.0.0.1';
    $config['port'] = (int)($config['port'] ?: 3306);
    $config['database'] = $config['database'] ?: 'vislok';
    $config['user'] = $config['user'] ?: 'vislok_app';
    $config['pass'] = $config['pass'] ?? '';
    $config['admin_user'] = $config['admin_user'] ?: 'root';
    $config['admin_pass'] = $config['admin_pass'] ?? '';

    return $config;
}

function vislok_json_response($payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function vislok_error(string $message, int $status = 500, array $extra = []): void
{
    $payload = array_merge(['error' => $message], $extra);
    vislok_json_response($payload, $status);
}

function vislok_connect_app(?array $cfg = null): PDO
{
    $cfg = $cfg ?: vislok_load_config();
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $cfg['host'],
        $cfg['port'],
        $cfg['database']
    );
    return new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function vislok_connect_admin(?array $cfg = null): PDO
{
    $cfg = $cfg ?: vislok_load_config();
    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $cfg['host'], $cfg['port']);
    return new PDO($dsn, $cfg['admin_user'], $cfg['admin_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function vislok_bootstrap(?array $overrides = null): PDO
{
    $cfg = vislok_load_config($overrides);
    try {
        $pdo = vislok_connect_app($cfg);
        vislok_ensure_schema($pdo);
        return $pdo;
    } catch (PDOException $e) {
        $code = (int)$e->getCode();
        if ($code !== 1049 && $code !== 1044 && $code !== 1045) {
            throw $e;
        }
    }

    $admin = vislok_connect_admin($cfg);
    $dbName = $cfg['database'];
    $appUser = $cfg['user'];
    $appPass = $cfg['pass'];

    $admin->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $admin->exec("CREATE USER IF NOT EXISTS '{$appUser}'@'%' IDENTIFIED BY '{$appPass}'");
    $admin->exec("GRANT ALL PRIVILEGES ON `{$dbName}`.* TO '{$appUser}'@'%'");
    $admin->exec("FLUSH PRIVILEGES");

    $pdo = vislok_connect_app($cfg);
    vislok_ensure_schema($pdo);
    return $pdo;
}

function vislok_ensure_schema(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS waters (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        polygon LONGTEXT NULL,
        val DOUBLE NULL,
        depth_stats JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS stekken (
        id VARCHAR(64) PRIMARY KEY,
        water_id VARCHAR(64) NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_stek_water FOREIGN KEY (water_id) REFERENCES waters(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS rigs (
        id VARCHAR(64) PRIMARY KEY,
        stek_id VARCHAR(64) NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_rig_stek FOREIGN KEY (stek_id) REFERENCES stekken(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS catches (
        id VARCHAR(64) PRIMARY KEY,
        water_id VARCHAR(64) NULL,
        stek_id VARCHAR(64) NULL,
        rig_id VARCHAR(64) NULL,
        weight_kg DOUBLE NULL,
        weight_lbs DOUBLE NULL,
        length_cm DOUBLE NULL,
        notes TEXT NULL,
        photo VARCHAR(255) NULL,
        caught_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_catch_water FOREIGN KEY (water_id) REFERENCES waters(id) ON DELETE SET NULL,
        CONSTRAINT fk_catch_stek FOREIGN KEY (stek_id) REFERENCES stekken(id) ON DELETE SET NULL,
        CONSTRAINT fk_catch_rig FOREIGN KEY (rig_id) REFERENCES rigs(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS bathy_imports (
        id VARCHAR(64) PRIMARY KEY,
        source VARCHAR(50) NULL,
        file VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS bathy_points (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        import_id VARCHAR(64) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        val DOUBLE NULL,
        CONSTRAINT fk_bathy_import FOREIGN KEY (import_id) REFERENCES bathy_imports(id) ON DELETE CASCADE,
        INDEX idx_bathy_latlng (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function vislok_json_input(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        vislok_error('Invalid JSON payload', 400);
    }
    return $data ?: [];
}

function vislok_sanitize_id(?string $id, string $prefix): string
{
    if ($id && strlen($id) <= 64) return $id;
    return sprintf('%s_%s', $prefix, bin2hex(random_bytes(6)));
}

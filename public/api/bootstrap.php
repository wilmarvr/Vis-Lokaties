<?php
declare(strict_types=1);

/**
 * Laadt de configuratie uit environment of config.php
 */
function loadAppConfig(): array
{
    $config = [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('DB_PORT') ?: 3306),
        'user' => getenv('DB_USER') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '',
        'database' => getenv('DB_NAME') ?: 'vis_lokaties',
    ];

    $configFile = __DIR__ . '/config.php';
    if (is_file($configFile)) {
        $fileConfig = include $configFile;
        if (is_array($fileConfig)) {
            $config = array_merge($config, array_intersect_key($fileConfig, $config));
        }
    }

    return $config;
}

/**
 * Zorgt dat de kv-tabel bestaat en juiste structuur heeft
 */
function ensureStorageTable(mysqli $db): void
{
    $db->query("CREATE TABLE IF NOT EXISTS kv (id VARCHAR(64) NOT NULL, value LONGTEXT NOT NULL, PRIMARY KEY (id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $result = $db->query('SHOW COLUMNS FROM kv');
    $columns = [];
    while ($row = $result->fetch_assoc()) {
        $columns[$row['Field']] = $row;
    }

    if (!isset($columns['id'])) {
        $db->query('ALTER TABLE kv ADD COLUMN id VARCHAR(64) NOT NULL FIRST');
    } else {
        $db->query('ALTER TABLE kv MODIFY COLUMN id VARCHAR(64) NOT NULL');
    }

    if (!isset($columns['value'])) {
        $db->query('ALTER TABLE kv ADD COLUMN value LONGTEXT NOT NULL AFTER id');
    } else {
        $db->query('ALTER TABLE kv MODIFY COLUMN value LONGTEXT NOT NULL');
    }

    $pkRes = $db->query('SHOW INDEX FROM kv WHERE Key_name = "PRIMARY"');
    if ($pkRes->num_rows === 0) {
        $db->query('ALTER TABLE kv ADD PRIMARY KEY (id)');
    }
}

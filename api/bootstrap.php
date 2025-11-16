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
 * Bouwt een verbinding op, maakt de database indien nodig aan en zorgt dat de volledige schema aanwezig is.
 */
function connectAppDatabase(array $config): mysqli
{
    $db = new mysqli($config['host'], $config['user'], $config['password'], '', $config['port']);
    $db->set_charset('utf8mb4');

    $safeDb = sprintf('`%s`', str_replace('`', '``', (string) $config['database']));
    $db->query("CREATE DATABASE IF NOT EXISTS {$safeDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $db->select_db($config['database']);

    ensureAppSchema($db);

    return $db;
}

/**
 * Zorgt dat alle tabellen bestaan en de juiste structuur hebben.
 */
function ensureAppSchema(mysqli $db): void
{
    ensureLegacyKvTable($db);

    $db->query("CREATE TABLE IF NOT EXISTS waters (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        geojson LONGTEXT NOT NULL,
        PRIMARY KEY (id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS steks (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        note LONGTEXT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        water_id VARCHAR(64) NULL,
        PRIMARY KEY (id),
        KEY idx_steks_water (water_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS spots (
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        note LONGTEXT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        water_id VARCHAR(64) NULL,
        stek_id VARCHAR(64) NULL,
        PRIMARY KEY (id),
        KEY idx_spots_water (water_id),
        KEY idx_spots_stek (stek_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS bathy_datasets (
        id VARCHAR(64) NOT NULL,
        payload LONGTEXT NOT NULL,
        PRIMARY KEY (id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS bathy_points (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        dataset_id VARCHAR(64) NULL,
        lat DOUBLE NOT NULL,
        lon DOUBLE NOT NULL,
        dep DOUBLE NOT NULL,
        PRIMARY KEY (id),
        KEY idx_bathy_dataset (dataset_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS settings (
        name VARCHAR(64) NOT NULL,
        value LONGTEXT NOT NULL,
        PRIMARY KEY (name)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $defaults = ['waterColor' => '#33a1ff'];
    $stmt = $db->prepare('INSERT IGNORE INTO settings (name, value) VALUES (?, ?)');
    foreach ($defaults as $name => $value) {
        $stmt->bind_param('ss', $name, $value);
        $stmt->execute();
    }
    $stmt->close();
}

function ensureLegacyKvTable(mysqli $db): void
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

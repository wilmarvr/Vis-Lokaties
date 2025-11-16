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
        user_id VARCHAR(64) NOT NULL DEFAULT 'default',
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        geojson LONGTEXT NOT NULL,
        PRIMARY KEY (user_id, id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS steks (
        user_id VARCHAR(64) NOT NULL DEFAULT 'default',
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        note LONGTEXT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        water_id VARCHAR(64) NULL,
        PRIMARY KEY (user_id, id),
        KEY idx_steks_user (user_id),
        KEY idx_steks_water (water_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS spots (
        user_id VARCHAR(64) NOT NULL DEFAULT 'default',
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL DEFAULT '',
        note LONGTEXT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        water_id VARCHAR(64) NULL,
        stek_id VARCHAR(64) NULL,
        PRIMARY KEY (user_id, id),
        KEY idx_spots_user (user_id),
        KEY idx_spots_water (water_id),
        KEY idx_spots_stek (stek_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS bathy_datasets (
        user_id VARCHAR(64) NOT NULL DEFAULT 'default',
        id VARCHAR(64) NOT NULL,
        payload LONGTEXT NOT NULL,
        PRIMARY KEY (user_id, id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS bathy_points (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id VARCHAR(64) NOT NULL DEFAULT 'default',
        dataset_id VARCHAR(64) NULL,
        lat DOUBLE NOT NULL,
        lon DOUBLE NOT NULL,
        dep DOUBLE NOT NULL,
        PRIMARY KEY (id),
        KEY idx_bathy_user (user_id),
        KEY idx_bathy_dataset (dataset_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $db->query("CREATE TABLE IF NOT EXISTS settings (
        user_id VARCHAR(64) NOT NULL DEFAULT 'default',
        name VARCHAR(64) NOT NULL,
        value LONGTEXT NOT NULL,
        PRIMARY KEY (user_id, name)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    $defaults = ['waterColor' => '#33a1ff'];
    $stmt = $db->prepare('INSERT IGNORE INTO settings (user_id, name, value) VALUES (?, ?, ?)');
    $defaultUser = 'default';
    foreach ($defaults as $name => $value) {
        $stmt->bind_param('sss', $defaultUser, $name, $value);
        $stmt->execute();
    }
    $stmt->close();

    ensureUserAwareTable($db, 'waters', ['id'], ['idx_waters_user' => ['user_id']]);
    ensureUserAwareTable($db, 'steks', ['id'], ['idx_steks_user' => ['user_id']]);
    ensureUserAwareTable($db, 'spots', ['id'], ['idx_spots_user' => ['user_id']]);
    ensureUserAwareTable($db, 'bathy_datasets', ['id'], ['idx_bathy_dataset_user' => ['user_id']]);
    ensureUserColumnOnly($db, 'bathy_points', [
        'idx_bathy_user' => ['user_id'],
        'idx_bathy_dataset_user' => ['user_id', 'dataset_id']
    ]);
    ensureUserAwareTable($db, 'settings', ['name'], ['idx_settings_user' => ['user_id']]);
}

function escapeIdentifier(mysqli $db, string $identifier): string
{
    return '`' . str_replace('`', '``', $identifier) . '`';
}

function ensureUserColumnBase(mysqli $db, string $table): void
{
    $tableName = escapeIdentifier($db, $table);
    $result = $db->query("SHOW COLUMNS FROM {$tableName} LIKE 'user_id'");
    if ($result->num_rows === 0) {
        $db->query("ALTER TABLE {$tableName} ADD COLUMN user_id VARCHAR(64) NOT NULL DEFAULT 'default'");
    } else {
        $db->query("ALTER TABLE {$tableName} MODIFY COLUMN user_id VARCHAR(64) NOT NULL DEFAULT 'default'");
    }
    $db->query("UPDATE {$tableName} SET user_id = 'default' WHERE user_id IS NULL OR user_id = ''");
}

function ensurePrimaryKey(mysqli $db, string $table, array $columns): void
{
    $tableName = escapeIdentifier($db, $table);
    $result = $db->query("SHOW INDEX FROM {$tableName} WHERE Key_name = 'PRIMARY'");
    $current = [];
    while ($row = $result->fetch_assoc()) {
        $current[] = $row['Column_name'];
    }
    $matches = count($current) === count($columns);
    if ($matches) {
        foreach ($columns as $idx => $col) {
            if (!isset($current[$idx]) || strcasecmp($current[$idx], $col) !== 0) {
                $matches = false;
                break;
            }
        }
    }
    if ($matches) {
        return;
    }
    if ($current) {
        $db->query("ALTER TABLE {$tableName} DROP PRIMARY KEY");
    }
    $cols = array_map(static function ($col) {
        return '`' . $col . '`';
    }, $columns);
    $db->query("ALTER TABLE {$tableName} ADD PRIMARY KEY (" . implode(', ', $cols) . ")");
}

function ensureIndexes(mysqli $db, string $table, array $indexes): void
{
    if (!$indexes) {
        return;
    }
    $tableName = escapeIdentifier($db, $table);
    foreach ($indexes as $name => $columns) {
        $safeName = preg_replace('/[^a-zA-Z0-9_]+/', '_', $name);
        $stmt = $db->prepare("SHOW INDEX FROM {$tableName} WHERE Key_name = ?");
        $stmt->bind_param('s', $safeName);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res->num_rows > 0;
        $stmt->close();
        if ($exists) {
            continue;
        }
        $cols = array_map(static function ($col) {
            return '`' . $col . '`';
        }, $columns);
        $db->query("ALTER TABLE {$tableName} ADD INDEX `{$safeName}` (" . implode(', ', $cols) . ")");
    }
}

function ensureUserAwareTable(mysqli $db, string $table, array $pkColumns, array $extraIndexes = []): void
{
    ensureUserColumnBase($db, $table);
    ensurePrimaryKey($db, $table, array_merge(['user_id'], $pkColumns));
    ensureIndexes($db, $table, $extraIndexes);
}

function ensureUserColumnOnly(mysqli $db, string $table, array $extraIndexes = []): void
{
    ensureUserColumnBase($db, $table);
    ensureIndexes($db, $table, $extraIndexes);
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

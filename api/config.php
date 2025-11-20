<?php
// =======================================================
// Vis Lokaties — config.php
// Dynamische databaseconfiguratie voor XAMPP (MySQL/MariaDB)
// Deze configuratie laadt standaardwaarden en optionele overrides
// uit config.local.json zodat de waarden via de admin-interface
// aangepast kunnen worden.
// =======================================================

const VISLOK_CONFIG_DEFAULT = [
    // Gebruik 127.0.0.1 als standaard zodat MySQL via TCP wordt aangesproken
    // en niet via een ontbrekende socket op "localhost".
    'host' => '127.0.0.1',
    'port' => '3306',
    'name' => 'vis_lokaties',
    'user' => 'root',
    'pass' => '',
    'socket' => '',
    'options' => []
];

// Sta overrides via omgeving variabelen toe zodat hosting-configuraties
// zonder schrijfrechten op bestanden toch de database kunnen instellen.
// Gebruik dezelfde keys als de admin-configuratie.
const VISLOK_ENV_KEYS = [
    'host'   => 'VISLOK_DB_HOST',
    'port'   => 'VISLOK_DB_PORT',
    'name'   => 'VISLOK_DB_NAME',
    'user'   => 'VISLOK_DB_USER',
    'pass'   => 'VISLOK_DB_PASS',
    'socket' => 'VISLOK_DB_SOCKET',
];

const VISLOK_OPTION_DEFAULTS = [
    'showData' => true,
    'showWeather' => true,
    'showContours' => true,
    'showCatches' => true,
    'showManage' => true,
    'showOverview' => true,
    'showChangelog' => true,
    'allowManualWater' => true,
    'autoLink' => true,
    'toolbarDrag' => true
];

function vislok_sanitise_options($options): array
{
    $clean = [];
    if (!is_array($options)) {
        $options = [];
    }
    foreach (VISLOK_OPTION_DEFAULTS as $key => $default) {
        $clean[$key] = array_key_exists($key, $options) ? (bool)$options[$key] : $default;
    }
    return $clean;
}

function vislok_config_path(): string
{
    return __DIR__ . '/config.local.json';
}

function vislok_sanitise_config(array $config): array
{
    $clean = [
        'host' => trim((string)($config['host'] ?? VISLOK_CONFIG_DEFAULT['host'])),
        'port' => (string)($config['port'] ?? VISLOK_CONFIG_DEFAULT['port']),
        'name' => trim((string)($config['name'] ?? VISLOK_CONFIG_DEFAULT['name'])),
        'user' => trim((string)($config['user'] ?? VISLOK_CONFIG_DEFAULT['user'])),
        'pass' => (string)($config['pass'] ?? VISLOK_CONFIG_DEFAULT['pass']),
        'socket' => trim((string)($config['socket'] ?? VISLOK_CONFIG_DEFAULT['socket'])),
        'options' => vislok_sanitise_options($config['options'] ?? [])
    ];

    if ($clean['host'] === '') {
        $clean['host'] = VISLOK_CONFIG_DEFAULT['host'];
    }
    // Vermijd impliciete socket-connecties: forceer TCP bij "localhost" zonder socket
    if ($clean['socket'] === '' && strcasecmp($clean['host'], 'localhost') === 0) {
        $clean['host'] = '127.0.0.1';
    }
    if (!preg_match('/^[0-9]+$/', $clean['port'])) {
        $clean['port'] = VISLOK_CONFIG_DEFAULT['port'];
    }
    if ($clean['name'] === '') {
        $clean['name'] = VISLOK_CONFIG_DEFAULT['name'];
    }
    if ($clean['user'] === '') {
        $clean['user'] = VISLOK_CONFIG_DEFAULT['user'];
    }
    if ($clean['socket'] === null) {
        $clean['socket'] = '';
    }

    return $clean;
}

function vislok_load_config(bool $refresh = false): array
{
    static $cached = null;
    if ($cached !== null && !$refresh) {
        return $cached;
    }

    $config = VISLOK_CONFIG_DEFAULT;

    // Omgevingsoverrides eerst toepassen (bijv. via .env of hostingpaneel)
    // zodat platforminstellingen de basis vormen.
    foreach (VISLOK_ENV_KEYS as $key => $envKey) {
        $value = getenv($envKey);
        if ($value !== false && $value !== null && $value !== '') {
            $config[$key] = $value;
        }
    }

    $path = vislok_config_path();
    if (is_readable($path)) {
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (is_array($data)) {
            $config = array_merge($config, vislok_sanitise_config($data));
        }
    }

    $cached = vislok_sanitise_config($config);
    return $cached;
}

function vislok_save_config(array $config): array
{
    $clean = vislok_sanitise_config($config);
    $path = vislok_config_path();
    $json = json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Kon configuratie niet serialiseren');
    }
    if (file_put_contents($path, $json) === false) {
        throw new RuntimeException('Kon configuratie niet wegschrijven');
    }
    vislok_load_config(true);
    return $clean;
}

function vislok_current_config(): array
{
    return vislok_load_config();
}

$config = vislok_current_config();
define('DB_HOST', $config['host']);
define('DB_PORT', $config['port']);
define('DB_NAME', $config['name']);
define('DB_USER', $config['user']);
define('DB_PASS', $config['pass']);
define('DB_SOCKET', $config['socket']);

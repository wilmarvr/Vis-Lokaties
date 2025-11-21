<?php
// =======================================================
// Vis Lokaties — config.php
// Eenvoudige configuratie voor SQLite.
// Laadt standaardwaarden en optionele overrides uit config.local.json
// zodat de waarden via de admin-interface aangepast kunnen worden.
// =======================================================

const VISLOK_CONFIG_DEFAULT = [
    // Standaard SQLite-bestand in de data-map
    'path' => __DIR__ . '/../data/vislok.sqlite',
    'options' => []
];

// Sta overrides via omgeving variabelen toe zodat hosting-configuraties
// zonder schrijfrechten op bestanden toch de database kunnen instellen.
const VISLOK_ENV_KEYS = [
    'path'   => 'VISLOK_DB_PATH',
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
    $path = trim((string)($config['path'] ?? VISLOK_CONFIG_DEFAULT['path']));
    if ($path === '') {
        $path = VISLOK_CONFIG_DEFAULT['path'];
    }

    // Relative pad -> baseer op project root
    if (!preg_match('~^(/|[A-Za-z]:[\\/])~', $path)) {
        $base = realpath(__DIR__ . '/..') ?: dirname(__DIR__);
        $path = rtrim($base, '/\\') . '/' . ltrim($path, '/\\');
    }
    if ($clean['adminUser'] === '') {
        $clean['adminUser'] = VISLOK_CONFIG_DEFAULT['adminUser'];
    }
    if ($clean['socket'] === null) {
        $clean['socket'] = '';
    }

    return [
        'path' => $path,
        'options' => vislok_sanitise_options($config['options'] ?? [])
    ];
}

function vislok_load_config(bool $refresh = false): array
{
    static $cached = null;
    if ($cached !== null && !$refresh) {
        return $cached;
    }

    $config = VISLOK_CONFIG_DEFAULT;

    // Omgevingsoverrides eerst toepassen (bijv. via .env of hostingpaneel)
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
define('DB_PATH', $config['path']);

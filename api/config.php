<?php
// =======================================================
// Vis Lokaties — config.php
// Eenvoudige configuratie voor SQLite.
// De database draait altijd op het ingebouwde pad; alleen UI-opties zijn instelbaar.
// =======================================================

const VISLOK_DEFAULT_PATH = __DIR__ . '/../data/vislok.sqlite';

const VISLOK_CONFIG_DEFAULT = [
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

function vislok_normalise_path(string $path): string
{
    $path = trim($path);
    if ($path === '') {
        return VISLOK_DEFAULT_PATH;
    }

    // Relative pad -> baseer op project root
    if (!preg_match('~^(/|[A-Za-z]:[\\/])~', $path)) {
        $base = realpath(__DIR__ . '/..') ?: dirname(__DIR__);
        $path = rtrim($base, '/\\') . '/' . ltrim($path, '/\\');
    }

    return $path;
}

function vislok_sanitise_config(array $config): array
{
    return [
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
define('DB_PATH', VISLOK_DEFAULT_PATH);

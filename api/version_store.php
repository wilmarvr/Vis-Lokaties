<?php
// =======================================================
// Vis Lokaties — version_store.php
// Helpers om versie-informatie te laden en op te slaan
// =======================================================

const VISLOK_VERSION_DEFAULT = [
    'current' => '0.0.0',
    'releases' => []
];

function vislok_default_release(string $version = '0.0.0'): array
{
    return [
        'version' => $version,
        'date' => date('Y-m-d'),
        'notes' => 'Initial project version.'
    ];
}

function vislok_version_path(): string
{
    return dirname(__DIR__) . '/data/version.json';
}

function vislok_load_version(): array
{
    $path = vislok_version_path();
    if (!is_readable($path)) {
        $default = vislok_default_release();
        return [
            'current' => $default['version'],
            'releases' => [$default]
        ];
    }
    $json = file_get_contents($path);
    if ($json === false) {
        $default = vislok_default_release();
        return [
            'current' => $default['version'],
            'releases' => [$default]
        ];
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        $default = vislok_default_release();
        return [
            'current' => $default['version'],
            'releases' => [$default]
        ];
    }

    $current = isset($data['current']) ? (string)$data['current'] : '0.0.0';
    if ($current === '') {
        $current = '0.0.0';
    }

    $releases = [];
    if (isset($data['releases']) && is_array($data['releases'])) {
        foreach ($data['releases'] as $release) {
            if (!is_array($release)) {
                continue;
            }
            $releases[] = [
                'version' => isset($release['version']) ? (string)$release['version'] : $current,
                'date' => isset($release['date']) ? (string)$release['date'] : date('Y-m-d'),
                'notes' => isset($release['notes']) ? (string)$release['notes'] : ''
            ];
        }
    }

    if (!$releases) {
        $releases[] = vislok_default_release($current);
    }

    return [
        'current' => $current,
        'releases' => $releases
    ];
}

function vislok_save_version(array $data): array
{
    $current = isset($data['current']) ? trim((string)$data['current']) : '0.0.0';
    if ($current === '') {
        $current = '0.0.0';
    }

    $releases = [];
    if (isset($data['releases']) && is_array($data['releases'])) {
        foreach ($data['releases'] as $release) {
            if (!is_array($release)) {
                continue;
            }
            $version = isset($release['version']) ? trim((string)$release['version']) : '';
            if ($version === '') {
                $version = $current;
            }
            $date = isset($release['date']) ? trim((string)$release['date']) : '';
            if ($date === '') {
                $date = date('Y-m-d');
            }
            $notes = isset($release['notes']) ? (string)$release['notes'] : '';
            $releases[] = [
                'version' => $version,
                'date' => $date,
                'notes' => $notes
            ];
        }
    }

    if (!$releases) {
        $releases[] = vislok_default_release($current);
    }

    $payload = [
        'current' => $current,
        'releases' => $releases
    ];

    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Kon versiegegevens niet serialiseren');
    }
    $path = vislok_version_path();
    if (file_put_contents($path, $json) === false) {
        throw new RuntimeException('Kon versiegegevens niet opslaan');
    }

    return $payload;
}

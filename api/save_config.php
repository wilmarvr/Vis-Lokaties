<?php
require __DIR__ . '/db.php';

try {
    $payload = vislok_json_input();
    $allowed = ['host', 'port', 'database', 'user', 'pass', 'admin_user', 'admin_pass'];
    $cfg = [];
    foreach ($allowed as $key) {
        if (array_key_exists($key, $payload)) {
            $cfg[$key] = $payload[$key];
        }
    }
    $cfg['host'] = isset($cfg['host']) ? trim((string)$cfg['host']) : '127.0.0.1';
    $cfg['port'] = isset($cfg['port']) ? (int)$cfg['port'] : 3306;
    $cfg['database'] = isset($cfg['database']) ? trim((string)$cfg['database']) : 'vislok';
    $cfg['user'] = isset($cfg['user']) ? trim((string)$cfg['user']) : 'vislok_app';
    $cfg['pass'] = isset($cfg['pass']) ? (string)$cfg['pass'] : '';
    $cfg['admin_user'] = isset($cfg['admin_user']) ? trim((string)$cfg['admin_user']) : 'root';
    $cfg['admin_pass'] = isset($cfg['admin_pass']) ? (string)$cfg['admin_pass'] : '';

    $dir = __DIR__ . '/../data';
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    $path = $dir . '/config.local.json';
    file_put_contents($path, json_encode($cfg, JSON_PRETTY_PRINT));

    // Test and create schema with new config
    vislok_bootstrap($cfg);

    vislok_json_response(['ok' => true, 'config' => $cfg]);
} catch (Throwable $e) {
    vislok_error('Config opslaan mislukt', 500, ['detail' => $e->getMessage()]);
}

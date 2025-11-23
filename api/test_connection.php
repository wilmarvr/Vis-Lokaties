<?php
require __DIR__ . '/db.php';

try {
    $payload = vislok_json_input();
    $cfg = vislok_load_config($payload['config'] ?? null);
    $pdo = vislok_bootstrap($cfg);
    $pdo->query('SELECT 1');
    vislok_json_response(['ok' => true, 'config' => $cfg]);
} catch (Throwable $e) {
    vislok_error('Verbinding mislukt', 500, ['detail' => $e->getMessage()]);
}

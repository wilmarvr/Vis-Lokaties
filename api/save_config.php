<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!$data) {
        vislok_json_response(['error' => 'Geen configuratie ontvangen'], 400);
    }

    $config = [
        // Pad is optioneel: lege waarde betekent standaardpad.
        'path' => $data['path'] ?? '',
        'options' => $data['options'] ?? []
    ];

    $saved = vislok_save_config($config);
    vislok_json_response(['status' => 'ok', 'config' => $saved]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!$data) {
        vislok_json_response(['error' => 'Geen configuratie ontvangen'], 400);
    }

    $required = ['path'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            vislok_json_response(['error' => sprintf('Veld %s ontbreekt', $field)], 422);
        }
    }

    $config = [
        'path' => $data['path'],
        'options' => $data['options'] ?? []
    ];

    $saved = vislok_save_config($config);
    vislok_json_response(['status' => 'ok', 'config' => $saved]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

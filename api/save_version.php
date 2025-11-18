<?php
require_once __DIR__ . '/version_store.php';
require_once __DIR__ . '/db.php';

try {
    $payload = vislok_read_json();
    if (!$payload) {
        vislok_json_response(['error' => 'Geen versiegegevens ontvangen'], 400);
    }

    $version = vislok_save_version($payload);
    vislok_json_response(['status' => 'ok', 'version' => $version]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

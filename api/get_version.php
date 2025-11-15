<?php
require_once __DIR__ . '/version_store.php';
require_once __DIR__ . '/db.php';

try {
    $version = vislok_load_version();
    vislok_json_response(['version' => $version]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

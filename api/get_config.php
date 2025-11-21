<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $config = vislok_current_config();
    vislok_json_response(['config' => $config]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

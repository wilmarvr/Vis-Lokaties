<?php
require __DIR__ . '/db.php';

try {
    $cfg = vislok_load_config();
    vislok_json_response(['config' => $cfg]);
} catch (Throwable $e) {
    vislok_error('Config ophalen mislukt', 500, ['detail' => $e->getMessage()]);
}

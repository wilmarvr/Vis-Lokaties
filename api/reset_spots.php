<?php
require_once __DIR__ . '/db.php';

try {
    $pdo = vislok_get_connection();
    $pdo->exec('TRUNCATE TABLE spots');
    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

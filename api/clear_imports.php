<?php
require_once __DIR__ . '/db.php';

try {
    $pdo = vislok_get_connection();
    $pdo->exec('DELETE FROM bathy_points');
    $pdo->exec('DELETE FROM bathy_imports');
    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

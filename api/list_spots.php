<?php
require_once __DIR__ . '/db.php';

try {
    $pdo = vislok_get_connection();
    $stmt = $pdo->query('SELECT id, type, name, lat, lng, val, note, created_at FROM spots ORDER BY created_at DESC');
    $rows = $stmt->fetchAll();
    vislok_json_response(['data' => $rows]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

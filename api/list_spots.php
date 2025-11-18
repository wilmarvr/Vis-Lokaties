<?php
require_once __DIR__ . '/db.php';

try {
    $pdo = vislok_get_connection();
    $stmt = $pdo->query('(
        SELECT id, "water" AS type, name, lat, lng, val, note, polygon, NULL AS water_id, NULL AS stek_id, created_at
        FROM waters
    ) UNION ALL (
        SELECT id, "stek" AS type, name, lat, lng, val, note, polygon, water_id, NULL AS stek_id, created_at
        FROM stekken
    ) UNION ALL (
        SELECT id, "rig" AS type, name, lat, lng, val, note, polygon, water_id, stek_id, created_at
        FROM rigs
    ) ORDER BY created_at DESC');
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        if (isset($row['polygon'])) {
            $decoded = json_decode($row['polygon'], true);
            $row['polygon'] = $decoded ?: null;
        }
    }
    vislok_json_response(['data' => $rows]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

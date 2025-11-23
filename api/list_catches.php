<?php
require __DIR__ . '/db.php';

try {
    $pdo = vislok_bootstrap();
    $sql = 'SELECT c.*, s.name AS stek_name, r.name AS rig_name
            FROM catches c
            LEFT JOIN stekken s ON c.stek_id = s.id
            LEFT JOIN rigs r ON c.rig_id = r.id
            ORDER BY c.caught_at DESC, c.created_at DESC';
    $rows = $pdo->query($sql)->fetchAll();
    vislok_json_response(['catches' => $rows]);
} catch (Throwable $e) {
    vislok_error('Catch list failed', 500, ['detail' => $e->getMessage()]);
}

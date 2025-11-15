<?php
require_once __DIR__ . '/db.php';

try {
    $payload = vislok_read_json();
    $spotId = $payload['spot_id'] ?? ($_GET['spot_id'] ?? null);

    $pdo = vislok_get_connection();
    if ($spotId) {
        $stmt = $pdo->prepare('SELECT * FROM catches WHERE spot_id = :spot ORDER BY caught_at DESC, created_at DESC');
        $stmt->execute([':spot' => $spotId]);
    } else {
        $stmt = $pdo->query('SELECT * FROM catches ORDER BY caught_at DESC, created_at DESC');
    }

    $rows = $stmt->fetchAll();
    vislok_json_response(['data' => $rows]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

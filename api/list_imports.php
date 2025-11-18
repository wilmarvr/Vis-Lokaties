<?php
require_once __DIR__ . '/db.php';

try {
    $pdo = vislok_get_connection();
    $stmt = $pdo->query('SELECT id, source, file_name, total_points, created_at FROM bathy_imports ORDER BY created_at DESC');
    $imports = $stmt->fetchAll();

    $countStmt = $pdo->query('SELECT COUNT(*) AS total_records FROM bathy_points');
    $pointsTotal = (int)$countStmt->fetch()['total_records'];

    vislok_json_response([
        'data' => $imports,
        'summary' => [
            'batches' => count($imports),
            'points' => $pointsTotal,
        ],
    ]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

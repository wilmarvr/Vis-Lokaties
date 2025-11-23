<?php
require __DIR__ . '/db.php';

try {
    $pdo = vislok_bootstrap();
    $imports = $pdo->query('SELECT id, source, file, created_at FROM bathy_imports ORDER BY created_at DESC')->fetchAll();
    $countsStmt = $pdo->query('SELECT import_id, COUNT(*) AS cnt FROM bathy_points GROUP BY import_id');
    $counts = [];
    foreach ($countsStmt as $row) {
        $counts[$row['import_id']] = (int)$row['cnt'];
    }
    $list = array_map(function ($row) use ($counts) {
        return [
            'id' => $row['id'],
            'source' => $row['source'],
            'file' => $row['file'],
            'created' => $row['created_at'],
            'count' => $counts[$row['id']] ?? 0,
        ];
    }, $imports);

    $totalPoints = array_sum($counts);
    vislok_json_response(['imports' => $list, 'summary' => ['batches' => count($list), 'points' => $totalPoints]]);
} catch (Throwable $e) {
    vislok_error('Imports ophalen mislukt', 500, ['detail' => $e->getMessage()]);
}

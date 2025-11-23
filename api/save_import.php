<?php
require __DIR__ . '/db.php';

$input = vislok_json_input();
$points = $input['points'] ?? [];
if (!is_array($points) || !$points) {
    vislok_error('Geen punten aangeleverd', 400);
}

try {
    $pdo = vislok_bootstrap();
    $pdo->beginTransaction();
    $batchId = vislok_sanitize_id($input['batchId'] ?? null, 'imp');
    $stmt = $pdo->prepare('INSERT INTO bathy_imports (id, source, file) VALUES (:id, :source, :file)
        ON DUPLICATE KEY UPDATE source=VALUES(source), file=VALUES(file)');
    $stmt->execute([
        ':id' => $batchId,
        ':source' => $input['source'] ?? 'csv',
        ':file' => $input['file'] ?? null,
    ]);

    $insert = $pdo->prepare('INSERT INTO bathy_points (import_id, lat, lng, val) VALUES (:import_id, :lat, :lng, :val)');
    $count = 0;
    foreach ($points as $p) {
        $lat = isset($p['lat']) ? (float)$p['lat'] : null;
        $lng = isset($p['lng']) ? (float)$p['lng'] : null;
        if (!is_finite($lat) || !is_finite($lng)) continue;
        $insert->execute([
            ':import_id' => $batchId,
            ':lat' => $lat,
            ':lng' => $lng,
            ':val' => isset($p['val']) ? $p['val'] : null,
        ]);
        $count++;
    }
    $pdo->commit();
    vislok_json_response(['stored' => $count]);
} catch (Throwable $e) {
    if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
    vislok_error('Import opslaan mislukt', 500, ['detail' => $e->getMessage()]);
}

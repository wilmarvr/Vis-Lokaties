<?php
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    $points = $data['points'] ?? [];
    if (!is_array($points) || !count($points)) {
        vislok_json_response(['error' => 'Geen punten ontvangen'], 400);
    }

    $batchId = $data['batchId'] ?? uniqid('import_', true);
    $source = $data['source'] ?? null;
    $file = $data['file'] ?? null;

    $valid = [];
    foreach ($points as $point) {
        $lat = isset($point['lat']) ? (float)$point['lat'] : null;
        $lng = isset($point['lng']) ? (float)$point['lng'] : null;
        if (!is_finite($lat) || !is_finite($lng)) {
            continue;
        }
        $depth = isset($point['val']) ? (float)$point['val'] : (isset($point['depth']) ? (float)$point['depth'] : null);
        $valid[] = [
            'lat' => $lat,
            'lng' => $lng,
            'depth' => $depth,
        ];
    }

    if (!count($valid)) {
        vislok_json_response(['error' => 'Geen geldige punten ontvangen'], 400);
    }

    $pdo = vislok_get_connection();
    $pdo->beginTransaction();

    $meta = $pdo->prepare('INSERT INTO bathy_imports (id, source, file_name, total_points)
        VALUES (:id, :source, :file, :total)
        ON CONFLICT(id) DO UPDATE SET source=excluded.source, file_name=excluded.file_name, total_points=excluded.total_points');
    $meta->execute([
        ':id' => $batchId,
        ':source' => $source,
        ':file' => $file,
        ':total' => count($valid),
    ]);

    $delete = $pdo->prepare('DELETE FROM bathy_points WHERE import_id = :import');
    $delete->execute([':import' => $batchId]);

    $insert = $pdo->prepare('INSERT INTO bathy_points (import_id, lat, lng, depth) VALUES (:import, :lat, :lng, :depth)');
    $stored = 0;
    foreach ($valid as $point) {
        $insert->execute([
            ':import' => $batchId,
            ':lat' => $point['lat'],
            ':lng' => $point['lng'],
            ':depth' => $point['depth'],
        ]);
        $stored++;
    }

    $pdo->commit();
    vislok_json_response(['status' => 'ok', 'id' => $batchId, 'stored' => $stored]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    vislok_json_response(['error' => $e->getMessage()], 500);
}

<?php
require __DIR__ . '/db.php';

$input = vislok_json_input();
$type = $input['type'] ?? null;
if (!$type) {
    vislok_error('Spot type ontbreekt', 400);
}

try {
    $pdo = vislok_bootstrap();
    switch ($type) {
        case 'water':
            $id = vislok_sanitize_id($input['id'] ?? null, 'water');
            $stmt = $pdo->prepare('INSERT INTO waters (id, name, lat, lng, polygon, val, depth_stats)
                VALUES (:id, :name, :lat, :lng, :polygon, :val, :depth_stats)
                ON DUPLICATE KEY UPDATE name=VALUES(name), lat=VALUES(lat), lng=VALUES(lng), polygon=VALUES(polygon), val=VALUES(val), depth_stats=VALUES(depth_stats)');
            $stmt->execute([
                ':id' => $id,
                ':name' => $input['name'] ?? 'Water',
                ':lat' => (float)($input['lat'] ?? 0),
                ':lng' => (float)($input['lng'] ?? 0),
                ':polygon' => isset($input['polygon']) ? json_encode($input['polygon']) : null,
                ':val' => isset($input['val']) ? $input['val'] : null,
                ':depth_stats' => isset($input['depthStats']) ? json_encode($input['depthStats']) : null,
            ]);
            $response = [
                'id' => $id,
                'type' => 'water',
                'name' => $input['name'] ?? 'Water',
                'lat' => (float)($input['lat'] ?? 0),
                'lng' => (float)($input['lng'] ?? 0),
                'polygon' => $input['polygon'] ?? null,
                'val' => isset($input['val']) ? (float)$input['val'] : null,
                'depthStats' => $input['depthStats'] ?? null,
            ];
            break;
        case 'stek':
            $id = vislok_sanitize_id($input['id'] ?? null, 'stek');
            $stmt = $pdo->prepare('INSERT INTO stekken (id, water_id, name, lat, lng)
                VALUES (:id, :water_id, :name, :lat, :lng)
                ON DUPLICATE KEY UPDATE water_id=VALUES(water_id), name=VALUES(name), lat=VALUES(lat), lng=VALUES(lng)');
            $stmt->execute([
                ':id' => $id,
                ':water_id' => $input['waterId'] ?? null,
                ':name' => $input['name'] ?? 'Stek',
                ':lat' => (float)($input['lat'] ?? 0),
                ':lng' => (float)($input['lng'] ?? 0),
            ]);
            $response = [
                'id' => $id,
                'type' => 'stek',
                'waterId' => $input['waterId'] ?? null,
                'name' => $input['name'] ?? 'Stek',
                'lat' => (float)($input['lat'] ?? 0),
                'lng' => (float)($input['lng'] ?? 0),
            ];
            break;
        case 'rig':
            $id = vislok_sanitize_id($input['id'] ?? null, 'rig');
            $stmt = $pdo->prepare('INSERT INTO rigs (id, stek_id, name, lat, lng)
                VALUES (:id, :stek_id, :name, :lat, :lng)
                ON DUPLICATE KEY UPDATE stek_id=VALUES(stek_id), name=VALUES(name), lat=VALUES(lat), lng=VALUES(lng)');
            $stmt->execute([
                ':id' => $id,
                ':stek_id' => $input['stekId'] ?? null,
                ':name' => $input['name'] ?? 'Rig',
                ':lat' => (float)($input['lat'] ?? 0),
                ':lng' => (float)($input['lng'] ?? 0),
            ]);
            $response = [
                'id' => $id,
                'type' => 'rig',
                'stekId' => $input['stekId'] ?? null,
                'name' => $input['name'] ?? 'Rig',
                'lat' => (float)($input['lat'] ?? 0),
                'lng' => (float)($input['lng'] ?? 0),
            ];
            break;
        default:
            vislok_error('Onbekend spottype', 400);
    }

    vislok_json_response($response);
} catch (Throwable $e) {
    vislok_error('Spot opslaan mislukt', 500, ['detail' => $e->getMessage()]);
}

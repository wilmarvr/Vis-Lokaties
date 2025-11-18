<?php
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!isset($data['id'])) {
        $data['id'] = uniqid('spot_', true);
    }
    $id = $data['id'];
    $type = $data['type'] ?? 'stek';
    $name = trim($data['name'] ?? '');
    $lat = (float)($data['lat'] ?? 0);
    $lng = (float)($data['lng'] ?? 0);
    $val = isset($data['val']) ? (float)$data['val'] : null;
    $note = isset($data['note']) ? trim((string)$data['note']) : null;
    $note = $note === '' ? null : $note;
    $polygon = array_key_exists('polygon', $data) ? json_encode($data['polygon']) : null;
    $waterId = isset($data['water_id']) ? trim((string)$data['water_id']) : null;
    $stekId = isset($data['stek_id']) ? trim((string)$data['stek_id']) : null;
    if ($waterId === '') {
        $waterId = null;
    }
    if ($stekId === '') {
        $stekId = null;
    }

    if (!$name || !is_finite($lat) || !is_finite($lng)) {
        vislok_json_response(['error' => 'Ongeldige invoer'], 400);
    }

    $pdo = vislok_get_connection();

    switch ($type) {
        case 'water':
            $stmt = $pdo->prepare('INSERT INTO waters (id, name, lat, lng, val, note, polygon) VALUES (:id, :name, :lat, :lng, :val, :note, :polygon)
                ON DUPLICATE KEY UPDATE name = VALUES(name), lat = VALUES(lat), lng = VALUES(lng), val = VALUES(val), note = VALUES(note), polygon = VALUES(polygon)');
            $stmt->execute([
                ':id' => $id,
                ':name' => $name,
                ':lat' => $lat,
                ':lng' => $lng,
                ':val' => $val,
                ':note' => $note,
                ':polygon' => $polygon,
            ]);
            break;
        case 'stek':
            if ($waterId) {
                $water = vislok_fetch_water($pdo, $waterId);
                if (!$water) {
                    vislok_json_response(['error' => 'Water niet gevonden'], 404);
                }
            }
            $stmt = $pdo->prepare('INSERT INTO stekken (id, water_id, name, lat, lng, val, note, polygon) VALUES (:id, :water_id, :name, :lat, :lng, :val, :note, :polygon)
                ON DUPLICATE KEY UPDATE water_id = VALUES(water_id), name = VALUES(name), lat = VALUES(lat), lng = VALUES(lng), val = VALUES(val), note = VALUES(note), polygon = VALUES(polygon)');
            $stmt->execute([
                ':id' => $id,
                ':water_id' => $waterId,
                ':name' => $name,
                ':lat' => $lat,
                ':lng' => $lng,
                ':val' => $val,
                ':note' => $note,
                ':polygon' => $polygon,
            ]);
            break;
        case 'rig':
            $stek = null;
            if ($stekId) {
                $stek = vislok_fetch_stek($pdo, $stekId);
                if (!$stek) {
                    vislok_json_response(['error' => 'Stek niet gevonden'], 404);
                }
                if (!$waterId && !empty($stek['water_id'])) {
                    $waterId = $stek['water_id'];
                }
            }
            if ($waterId) {
                $water = vislok_fetch_water($pdo, $waterId);
                if (!$water) {
                    vislok_json_response(['error' => 'Water niet gevonden'], 404);
                }
            }
            $stmt = $pdo->prepare('INSERT INTO rigs (id, stek_id, water_id, name, lat, lng, val, note, polygon) VALUES (:id, :stek_id, :water_id, :name, :lat, :lng, :val, :note, :polygon)
                ON DUPLICATE KEY UPDATE stek_id = VALUES(stek_id), water_id = VALUES(water_id), name = VALUES(name), lat = VALUES(lat), lng = VALUES(lng), val = VALUES(val), note = VALUES(note), polygon = VALUES(polygon)');
            $stmt->execute([
                ':id' => $id,
                ':stek_id' => $stekId,
                ':water_id' => $waterId,
                ':name' => $name,
                ':lat' => $lat,
                ':lng' => $lng,
                ':val' => $val,
                ':note' => $note,
                ':polygon' => $polygon,
            ]);
            break;
        default:
            vislok_json_response(['error' => 'Onbekend type'], 400);
    }

    $saved = vislok_find_spot($pdo, $id);
    vislok_json_response(['status' => 'ok', 'spot' => $saved ?: null]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

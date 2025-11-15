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
    $note = $data['note'] ?? null;
    $polygon = isset($data['polygon']) ? json_encode($data['polygon']) : null;
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
    $stmt = $pdo->prepare('REPLACE INTO spots (id, type, name, lat, lng, val, note, polygon, water_id, stek_id) VALUES (:id, :type, :name, :lat, :lng, :val, :note, :polygon, :water_id, :stek_id)');
    $stmt->execute([
        ':id' => $id,
        ':type' => $type,
        ':name' => $name,
        ':lat' => $lat,
        ':lng' => $lng,
        ':val' => $val,
        ':note' => $note,
        ':polygon' => $polygon,
        ':water_id' => $waterId,
        ':stek_id' => $stekId,
    ]);

    $fetch = $pdo->prepare('SELECT id, type, name, lat, lng, val, note, polygon, water_id, stek_id, created_at FROM spots WHERE id = :id LIMIT 1');
    $fetch->execute([':id' => $id]);
    $saved = $fetch->fetch();
    if ($saved && isset($saved['polygon'])) {
        $decoded = json_decode($saved['polygon'], true);
        $saved['polygon'] = $decoded ?: null;
    }

    vislok_json_response(['status' => 'ok', 'spot' => $saved ?: null]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

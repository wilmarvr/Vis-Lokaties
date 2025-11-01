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

    if (!$name || !$lat || !$lng) {
        vislok_json_response(['error' => 'Ongeldige invoer'], 400);
    }

    $pdo = vislok_get_connection();
    $stmt = $pdo->prepare('REPLACE INTO spots (id, type, name, lat, lng, val, note) VALUES (:id, :type, :name, :lat, :lng, :val, :note)');
    $stmt->execute([
        ':id' => $id,
        ':type' => $type,
        ':name' => $name,
        ':lat' => $lat,
        ':lng' => $lng,
        ':val' => $val,
        ':note' => $note,
    ]);

    vislok_json_response(['status' => 'ok', 'id' => $id]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

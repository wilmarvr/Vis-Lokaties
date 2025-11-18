<?php
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    $id = $data['id'] ?? '';
    if (!$id) {
        vislok_json_response(['error' => 'ID vereist'], 400);
    }
    $pdo = vislok_get_connection();
    $type = $data['type'] ?? null;
    if (!$type) {
        $spot = vislok_find_spot($pdo, $id);
        $type = $spot['type'] ?? null;
    }

    $tableMap = [
        'water' => 'waters',
        'stek' => 'stekken',
        'rig' => 'rigs',
    ];
    if (!isset($tableMap[$type])) {
        vislok_json_response(['error' => 'Spot niet gevonden'], 404);
    }

    $stmt = $pdo->prepare(sprintf('DELETE FROM %s WHERE id = :id', $tableMap[$type]));
    $stmt->execute([':id' => $id]);
    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

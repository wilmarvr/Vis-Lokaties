<?php
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (empty($data['id'])) {
        vislok_json_response(['error' => 'ID vereist'], 400);
    }
    $pdo = vislok_get_connection();
    $stmt = $pdo->prepare('DELETE FROM spots WHERE id = :id');
    $stmt->execute([':id' => $data['id']]);
    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

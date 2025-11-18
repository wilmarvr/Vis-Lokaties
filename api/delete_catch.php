<?php
require_once __DIR__ . '/db.php';

try {
    $payload = vislok_read_json();
    $id = $payload['id'] ?? null;
    if (!$id) {
        vislok_json_response(['error' => 'id vereist'], 400);
    }

    $pdo = vislok_get_connection();
    $stmt = $pdo->prepare('SELECT photo_path FROM catches WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $existing = $stmt->fetch();
    if (!$existing) {
        vislok_json_response(['status' => 'ok']);
    }

    $pdo->prepare('DELETE FROM catches WHERE id = :id')->execute([':id' => $id]);

    if (!empty($existing['photo_path'])) {
        $file = realpath(__DIR__ . '/../' . $existing['photo_path']);
        if ($file && strpos($file, realpath(__DIR__ . '/..')) === 0) {
            @unlink($file);
        }
    }

    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

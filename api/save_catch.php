<?php
require __DIR__ . '/db.php';

$input = vislok_json_input();

try {
    $pdo = vislok_bootstrap();
    $pdo->beginTransaction();
    $id = vislok_sanitize_id($input['id'] ?? null, 'catch');
    $photoPath = vislok_store_photo($input['photo'] ?? null, $id);

    $stmt = $pdo->prepare('INSERT INTO catches (id, spot_id, rig_id, title, species, weight_kg, length_cm, caught_at, notes, photo_path)
        VALUES (:id, :spot_id, :rig_id, :title, :species, :weight_kg, :length_cm, :caught_at, :notes, :photo_path)
        ON DUPLICATE KEY UPDATE spot_id=VALUES(spot_id), rig_id=VALUES(rig_id), title=VALUES(title), species=VALUES(species), weight_kg=VALUES(weight_kg), length_cm=VALUES(length_cm), caught_at=VALUES(caught_at), notes=VALUES(notes), photo_path=VALUES(photo_path)');
    $stmt->execute([
        ':id' => $id,
        ':spot_id' => $input['spot_id'] ?? $input['spotId'] ?? null,
        ':rig_id' => $input['rig_id'] ?? $input['rigId'] ?? null,
        ':title' => $input['title'] ?? null,
        ':species' => $input['species'] ?? null,
        ':weight_kg' => isset($input['weight_kg']) ? $input['weight_kg'] : null,
        ':length_cm' => isset($input['length_cm']) ? $input['length_cm'] : null,
        ':caught_at' => $input['caught_at'] ?? null,
        ':notes' => $input['notes'] ?? null,
        ':photo_path' => $photoPath,
    ]);
    $pdo->commit();

    vislok_json_response([
        'id' => $id,
        'spotId' => $input['spot_id'] ?? $input['spotId'] ?? null,
        'rigId' => $input['rig_id'] ?? $input['rigId'] ?? null,
        'title' => $input['title'] ?? null,
        'species' => $input['species'] ?? null,
        'weight_kg' => isset($input['weight_kg']) ? (float)$input['weight_kg'] : null,
        'length_cm' => isset($input['length_cm']) ? (float)$input['length_cm'] : null,
        'caught_at' => $input['caught_at'] ?? null,
        'notes' => $input['notes'] ?? null,
        'photo' => $photoPath,
    ]);
} catch (Throwable $e) {
    if ($pdo && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    vislok_error('Vangst opslaan mislukt', 500, ['detail' => $e->getMessage()]);
}

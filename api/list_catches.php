<?php
require __DIR__ . '/db.php';

try {
    $pdo = vislok_bootstrap();
    $input = vislok_json_input();
    if (!empty($input['spotId'])) {
        $stmt = $pdo->prepare('SELECT id, spot_id, rig_id, title, species, weight_kg, weight_lbs, length_cm, caught_at, notes, photo_path FROM catches WHERE spot_id = :spot');
        $stmt->execute([':spot' => $input['spotId']]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query('SELECT id, spot_id, rig_id, title, species, weight_kg, weight_lbs, length_cm, caught_at, notes, photo_path FROM catches')->fetchAll();
    }
    $list = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'spotId' => $row['spot_id'],
            'rigId' => $row['rig_id'],
            'title' => $row['title'],
            'species' => $row['species'],
            'weight_kg' => $row['weight_kg'] !== null ? (float)$row['weight_kg'] : null,
            'weight_lbs' => $row['weight_lbs'] !== null ? (float)$row['weight_lbs'] : null,
            'length_cm' => $row['length_cm'] !== null ? (float)$row['length_cm'] : null,
            'caught_at' => $row['caught_at'],
            'notes' => $row['notes'],
            'photo' => $row['photo_path'],
        ];
    }, $rows);
    vislok_json_response(['catches' => $list]);
} catch (Throwable $e) {
    vislok_error('Vangsten ophalen mislukt', 500, ['detail' => $e->getMessage()]);
}

<?php
require __DIR__ . '/db.php';

try {
    $pdo = vislok_bootstrap();
    $waters = $pdo->query('SELECT id, name, lat, lng, polygon, val, depth_stats FROM waters')->fetchAll();
    $stekken = $pdo->query('SELECT id, water_id, name, lat, lng FROM stekken')->fetchAll();
    $rigs = $pdo->query('SELECT id, stek_id, name, lat, lng FROM rigs')->fetchAll();

    $result = [];
    foreach ($waters as $row) {
        $result[] = [
            'id' => $row['id'],
            'type' => 'water',
            'name' => $row['name'],
            'lat' => (float)$row['lat'],
            'lng' => (float)$row['lng'],
            'polygon' => $row['polygon'] ? json_decode($row['polygon'], true) : null,
            'val' => $row['val'] !== null ? (float)$row['val'] : null,
            'depthStats' => $row['depth_stats'] ? json_decode($row['depth_stats'], true) : null,
        ];
    }
    foreach ($stekken as $row) {
        $result[] = [
            'id' => $row['id'],
            'type' => 'stek',
            'waterId' => $row['water_id'],
            'name' => $row['name'],
            'lat' => (float)$row['lat'],
            'lng' => (float)$row['lng'],
        ];
    }
    foreach ($rigs as $row) {
        $result[] = [
            'id' => $row['id'],
            'type' => 'rig',
            'stekId' => $row['stek_id'],
            'name' => $row['name'],
            'lat' => (float)$row['lat'],
            'lng' => (float)$row['lng'],
        ];
    }

    vislok_json_response(['spots' => $result]);
} catch (Throwable $e) {
    vislok_error('Spots ophalen mislukt', 500, ['detail' => $e->getMessage()]);
}

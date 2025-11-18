<?php
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    $south = isset($data['south']) ? (float)$data['south'] : null;
    $west = isset($data['west']) ? (float)$data['west'] : null;
    $north = isset($data['north']) ? (float)$data['north'] : null;
    $east = isset($data['east']) ? (float)$data['east'] : null;

    if (!is_finite($south) || !is_finite($west) || !is_finite($north) || !is_finite($east)) {
        vislok_json_response(['error' => 'Ongeldige grenzen'], 400);
    }

    if ($south > $north) {
        [$south, $north] = [$north, $south];
    }
    if ($west > $east) {
        [$west, $east] = [$east, $west];
    }

    $pdo = vislok_get_connection();
    $sql = 'SELECT lat, lng, depth FROM bathy_points WHERE lat BETWEEN :south AND :north AND lng BETWEEN :west AND :east';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':south' => $south,
        ':north' => $north,
        ':west' => $west,
        ':east' => $east,
    ]);

    $points = [];
    while ($row = $stmt->fetch()) {
        $points[] = [
            'lat' => isset($row['lat']) ? (float)$row['lat'] : null,
            'lng' => isset($row['lng']) ? (float)$row['lng'] : null,
            'depth' => isset($row['depth']) ? (float)$row['depth'] : null,
        ];
    }

    vislok_json_response([
        'points' => $points,
        'count' => count($points),
        'bounds' => [
            'south' => $south,
            'west' => $west,
            'north' => $north,
            'east' => $east,
        ],
    ]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

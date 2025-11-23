<?php
require __DIR__ . '/db.php';

$bounds = [
    'south' => isset($_GET['south']) ? (float)$_GET['south'] : null,
    'north' => isset($_GET['north']) ? (float)$_GET['north'] : null,
    'west' => isset($_GET['west']) ? (float)$_GET['west'] : null,
    'east' => isset($_GET['east']) ? (float)$_GET['east'] : null,
];

try {
    $pdo = vislok_bootstrap();
    $hasBounds = $bounds['south'] !== null && $bounds['north'] !== null && $bounds['west'] !== null && $bounds['east'] !== null;
    if ($hasBounds) {
        $stmt = $pdo->prepare('SELECT lat, lng, val FROM bathy_points WHERE lat BETWEEN :south AND :north AND lng BETWEEN :west AND :east');
        $stmt->execute([
            ':south' => $bounds['south'],
            ':north' => $bounds['north'],
            ':west' => $bounds['west'],
            ':east' => $bounds['east'],
        ]);
    } else {
        $stmt = $pdo->query('SELECT lat, lng, val FROM bathy_points LIMIT 5000');
    }
    $points = array_map(function ($row) {
        return [
            'lat' => (float)$row['lat'],
            'lng' => (float)$row['lng'],
            'val' => $row['val'] !== null ? (float)$row['val'] : null,
        ];
    }, $stmt->fetchAll());

    vislok_json_response(['points' => $points]);
} catch (Throwable $e) {
    vislok_error('Importpunten ophalen mislukt', 500, ['detail' => $e->getMessage()]);
}

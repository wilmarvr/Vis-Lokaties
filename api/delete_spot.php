<?php
require __DIR__ . '/db.php';

$input = vislok_json_input();
$id = $input['id'] ?? null;
$type = $input['type'] ?? null;
if (!$id || !$type) {
    vislok_error('ID of type ontbreekt', 400);
}

try {
    $pdo = vislok_bootstrap();
    switch ($type) {
        case 'water':
            $stmt = $pdo->prepare('DELETE FROM waters WHERE id = :id');
            break;
        case 'stek':
            $stmt = $pdo->prepare('DELETE FROM stekken WHERE id = :id');
            break;
        case 'rig':
            $stmt = $pdo->prepare('DELETE FROM rigs WHERE id = :id');
            break;
        default:
            vislok_error('Onbekend spottype', 400);
    }
    $stmt->execute([':id' => $id]);
    vislok_json_response(['ok' => true]);
} catch (Throwable $e) {
    vislok_error('Spot verwijderen mislukt', 500, ['detail' => $e->getMessage()]);
}

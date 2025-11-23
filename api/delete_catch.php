<?php
require __DIR__ . '/db.php';

$input = vislok_json_input();
$id = $input['id'] ?? null;
if (!$id) vislok_error('ID ontbreekt', 400);

try {
    $pdo = vislok_bootstrap();
    $stmt = $pdo->prepare('DELETE FROM catches WHERE id = :id');
    $stmt->execute([':id' => $id]);
    vislok_json_response(['ok' => true]);
} catch (Throwable $e) {
    vislok_error('Vangst verwijderen mislukt', 500, ['detail' => $e->getMessage()]);
}

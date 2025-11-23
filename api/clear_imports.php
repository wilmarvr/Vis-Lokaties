<?php
require __DIR__ . '/db.php';

try {
    $pdo = vislok_bootstrap();
    $pdo->exec('DELETE FROM bathy_points');
    $pdo->exec('DELETE FROM bathy_imports');
    vislok_json_response(['ok' => true]);
} catch (Throwable $e) {
    vislok_error('Imports wissen mislukt', 500, ['detail' => $e->getMessage()]);
}

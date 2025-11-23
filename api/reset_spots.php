<?php
require __DIR__ . '/db.php';

try {
    $pdo = vislok_bootstrap();
    $pdo->exec('DELETE FROM rigs');
    $pdo->exec('DELETE FROM stekken');
    $pdo->exec('DELETE FROM waters');
    vislok_json_response(['ok' => true]);
} catch (Throwable $e) {
    vislok_error('Reset mislukt', 500, ['detail' => $e->getMessage()]);
}

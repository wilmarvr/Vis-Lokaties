<?php
require __DIR__ . '/db.php';

try {
    $input = vislok_json_input();
    if (empty($input['id'])) {
        vislok_error('Catch ID ontbreekt', 400);
    }
    $pdo = vislok_bootstrap();
    $stmt = $pdo->prepare('DELETE FROM catches WHERE id = ?');
    $stmt->execute([$input['id']]);
    vislok_json_response(['ok' => true]);
} catch (Throwable $e) {
    vislok_error('Catch delete failed', 500, ['detail' => $e->getMessage()]);
}

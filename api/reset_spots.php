<?php
require_once __DIR__ . '/db.php';

try {
    $pdo = vislok_get_connection();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $pdo->exec('TRUNCATE TABLE catches');
    $pdo->exec('TRUNCATE TABLE rigs');
    $pdo->exec('TRUNCATE TABLE stekken');
    $pdo->exec('TRUNCATE TABLE waters');
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

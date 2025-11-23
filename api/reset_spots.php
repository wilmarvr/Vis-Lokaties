<?php
require_once __DIR__ . '/db.php';

vislok_api(static function () {
    $pdo = vislok_get_connection();
    $pdo->beginTransaction();
    $pdo->exec('PRAGMA foreign_keys = OFF');
    $pdo->exec('DELETE FROM catches');
    $pdo->exec('DELETE FROM rigs');
    $pdo->exec('DELETE FROM stekken');
    $pdo->exec('DELETE FROM waters');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->commit();
    return ['status' => 'ok'];
});

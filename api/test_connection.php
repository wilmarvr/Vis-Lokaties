<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!$data) {
        $data = vislok_current_config();
    }

    $config = vislok_sanitise_config($data);
    $path = vislok_sqlite_path($config['path']);
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Kan databasepad niet aanmaken: ' . $dir);
    }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->query('SELECT 1');

    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

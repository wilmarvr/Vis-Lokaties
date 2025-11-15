<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!$data) {
        $data = vislok_current_config();
    }

    $config = vislok_sanitise_config($data);

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $config['host'], $config['port'], $config['name']);
    $pdo = new PDO($dsn, $config['user'], $config['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5
    ]);
    $pdo->query('SELECT 1');

    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

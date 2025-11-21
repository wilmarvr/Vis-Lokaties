<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!$data) {
        $data = vislok_current_config();
    }

    $config = vislok_sanitise_config($data);

    $dsn = vislok_build_dsn($config['host'], $config['port'], $config['socket'], $config['name']);
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5
    ];

    try {
        $pdo = new PDO($dsn['db'], $config['user'], $config['pass'], $options);
    } catch (PDOException $e) {
        $errorCode = $e->errorInfo[1] ?? null;

        if ($errorCode === 1049) {
            // Database ontbreekt: maak aan met admin en probeer opnieuw
            $adminUser = $config['adminUser'] ?? $config['user'];
            $adminPass = $config['adminPass'] ?? $config['pass'];
            $adminPdo = new PDO($dsn['base'], $adminUser, $adminPass, $options);

            $dbName = vislok_escape_identifier($config['name']);
            $adminPdo->exec(sprintf('CREATE DATABASE IF NOT EXISTS %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', $dbName));

            if ($config['user'] !== '' && $config['user'] !== $adminUser) {
                vislok_ensure_app_user($adminPdo, $config['user'], $config['pass'], $config['name']);
            }

            $pdo = new PDO($dsn['db'], $config['user'], $config['pass'], $options);
        } else {
            $hint = sprintf('MySQL connectie mislukt voor %s@%s: %s', $config['user'], $dsn['desc'], $e->getMessage());
            throw new RuntimeException($hint, 0, $e);
        }
    }

    $pdo->query('SELECT 1');

    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

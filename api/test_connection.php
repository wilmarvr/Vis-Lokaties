<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = vislok_read_json();
    if (!$data) {
        $data = vislok_current_config();
    }

    $config = vislok_sanitise_config($data);

    // Hergebruik dezelfde socket-detectie als de hoofdverbinding
    $socket = trim((string)($config['socket'] ?? ''));
    $candidates = vislok_socket_candidates($socket);

    $dsnTargets = [
        [
            'base' => sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $config['host'], $config['port']),
            'db' => sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $config['host'], $config['port'], $config['name'])
        ]
    ];
    foreach ($candidates as $candidate) {
        if (!file_exists($candidate)) {
            continue;
        }
        $dsnTargets[] = [
            'base' => sprintf('mysql:unix_socket=%s;charset=utf8mb4', $candidate),
            'db' => sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', $candidate, $config['name'])
        ];
    }

    $pdo = null;
    $errors = [];
    $adminUser = $config['adminUser'] ?? $config['user'];
    $adminPass = $config['adminPass'] ?? $config['pass'];

    foreach ($dsnTargets as $target) {
        try {
            $pdo = new PDO($target['db'], $config['user'], $config['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5
            ]);
            break;
        } catch (PDOException $e) {
            $errorCode = $e->errorInfo[1] ?? null;

            if (in_array($errorCode, [1049, 1045], true)) {
                try {
                    $adminPdo = new PDO($target['base'], $adminUser, $adminPass, [
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_TIMEOUT => 5
                    ]);

                    $dbName = vislok_escape_identifier($config['name']);
                    $adminPdo->exec(sprintf('CREATE DATABASE IF NOT EXISTS %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', $dbName));

                    if ($config['user'] !== '' && $config['user'] !== $adminUser) {
                        vislok_ensure_app_user($adminPdo, $config['user'], $config['pass'], $config['name']);
                    }

                    $pdo = new PDO($target['db'], $config['user'], $config['pass'], [
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_TIMEOUT => 5
                    ]);
                    break;
                } catch (Throwable $inner) {
                    $errors[] = $inner->getMessage();
                    continue;
                }
            }

            if (in_array($errorCode, [2002, 2003], true)) {
                $errors[] = $e->getMessage();
                continue;
            }

            $errors[] = $e->getMessage();
        }
    }

    if (!$pdo instanceof PDO) {
        throw new RuntimeException('Kon geen MySQL-verbinding maken: ' . implode('; ', $errors));
    }

    $pdo->query('SELECT 1');

    vislok_json_response(['status' => 'ok']);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

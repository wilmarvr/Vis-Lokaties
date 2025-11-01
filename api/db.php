<?php
require_once __DIR__ . '/config.php';

function vislok_get_connection(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    vislok_ensure_schema($pdo);
    return $pdo;
}

function vislok_ensure_schema(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS spots (
        id VARCHAR(64) PRIMARY KEY,
        type ENUM("water","stek","rig") NOT NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        val DOUBLE NULL,
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

function vislok_read_json(): array {
    $payload = file_get_contents('php://input');
    if (!$payload) {
        return [];
    }
    $data = json_decode($payload, true);
    return is_array($data) ? $data : [];
}

function vislok_json_response(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

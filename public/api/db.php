<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(['error' => 'Alleen GET en POST zijn toegestaan.']);
    exit;
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$config = [
    'host' => getenv('DB_HOST') ?: '127.0.0.1',
    'port' => (int) (getenv('DB_PORT') ?: 3306),
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    'database' => getenv('DB_NAME') ?: 'vis_lokaties',
];

$configFile = __DIR__ . '/config.php';
if (is_file($configFile)) {
    $fileConfig = include $configFile;
    if (is_array($fileConfig)) {
        $config = array_merge($config, array_intersect_key($fileConfig, $config));
    }
}

const DB_KEY = 'lv_db_main';
$DEFAULT_DB = [
    'waters' => [],
    'steks' => [],
    'rigs' => [],
    'bathy' => ['points' => [], 'datasets' => []],
    'settings' => ['waterColor' => '#33a1ff'],
];

try {
    $db = new mysqli($config['host'], $config['user'], $config['password'], $config['database'], $config['port']);
    $db->set_charset('utf8mb4');
    ensureStorageTable($db);
} catch (mysqli_sql_exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Kon geen verbinding maken met MySQL', 'details' => $e->getMessage()]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $payload = readPayload($db, DB_KEY, $DEFAULT_DB);
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    } catch (mysqli_sql_exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Kon data niet ophalen', 'details' => $e->getMessage()]);
    }
    exit;
}

$rawInput = file_get_contents('php://input') ?: '';
$decoded = json_decode($rawInput, true);
if (!is_array($decoded)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ongeldige JSON payload.']);
    exit;
}

try {
    writePayload($db, DB_KEY, $decoded);
    echo json_encode(['ok' => true]);
} catch (mysqli_sql_exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Kon data niet opslaan', 'details' => $e->getMessage()]);
}

function ensureStorageTable(mysqli $db): void
{
    $db->query("CREATE TABLE IF NOT EXISTS kv (id VARCHAR(64) PRIMARY KEY, value LONGTEXT NOT NULL) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
}

function readPayload(mysqli $db, string $key, array $default): array
{
    $stmt = $db->prepare('SELECT value FROM kv WHERE id = ? LIMIT 1');
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($row = $result->fetch_assoc()) {
        $value = json_decode((string) $row['value'], true);
        if (is_array($value)) {
            return $value;
        }
    }
    $stmt->close();

    writePayload($db, $key, $default);
    return $default;
}

function writePayload(mysqli $db, string $key, array $payload): void
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('JSON encoding mislukt');
    }
    $stmt = $db->prepare('INSERT INTO kv (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)');
    $stmt->bind_param('ss', $key, $json);
    $stmt->execute();
    $stmt->close();
}

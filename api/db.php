<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

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

$config = loadAppConfig();
$action = isset($_GET['action']) ? trim((string) $_GET['action']) : '';

const DB_KEY = 'lv_db_main';
$DEFAULT_DB = [
    'waters' => [],
    'steks' => [],
    'rigs' => [],
    'bathy' => ['points' => [], 'datasets' => []],
    'settings' => ['waterColor' => '#33a1ff'],
];

function sanitize_id(?string $value): string
{
    $value = trim((string) ($value ?? ''));
    if ($value === '') {
        return '';
    }
    if (strlen($value) > 64) {
        $value = substr($value, 0, 64);
    }
    return $value;
}

function sanitize_nullable_id($value): ?string
{
    $clean = sanitize_id(is_scalar($value) ? (string) $value : '');
    return $clean === '' ? null : $clean;
}

try {
    $db = connectAppDatabase($config);
    maybeHydrateFromLegacy($db, DB_KEY, $DEFAULT_DB);
} catch (mysqli_sql_exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Kon geen verbinding maken met MySQL', 'details' => $e->getMessage()]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $payload = fetchCurrentState($db, $DEFAULT_DB);
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
    if ($action === 'bathy_append') {
        $stats = appendBathy($db, $decoded);
        echo json_encode(['ok' => true, 'points' => $stats['points'], 'datasets' => $stats['datasets']]);
        exit;
    }
    if ($action === 'bathy_clear') {
        clearBathy($db);
        echo json_encode(['ok' => true]);
        exit;
    }

    persistState($db, $decoded, $DEFAULT_DB);
    echo json_encode(['ok' => true]);
} catch (mysqli_sql_exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Kon data niet opslaan', 'details' => $e->getMessage()]);
}

function fetchCurrentState(mysqli $db, array $defaults): array
{
    return [
        'waters' => fetchWaters($db),
        'steks' => fetchSteks($db),
        'rigs' => fetchSpots($db),
        'bathy' => fetchBathy($db),
        'settings' => fetchSettings($db, $defaults['settings']),
    ];
}

function persistState(mysqli $db, array $payload, array $defaults): void
{
    $normalized = normalizePayload($payload, $defaults);

    $db->begin_transaction();
    try {
        replaceWaters($db, $normalized['waters']);
        replaceSteks($db, $normalized['steks']);
        replaceSpots($db, $normalized['rigs']);
        replaceBathy($db, $normalized['bathy']);
        storeSettings($db, $normalized['settings']);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }
}

function normalizePayload(array $payload, array $defaults): array
{
    $normalized = $payload;
    $normalized['waters'] = array_values(array_filter(array_map(function ($item) {
        if (!is_array($item)) {
            return null;
        }
        return [
            'id' => sanitize_id($item['id'] ?? ''),
            'name' => (string) ($item['name'] ?? ''),
            'geojson' => $item['geojson'] ?? null,
        ];
    }, $payload['waters'] ?? []), function ($row) {
        return $row['id'] !== '';
    }));

    $normalized['steks'] = array_values(array_filter(array_map(function ($item) {
        if (!is_array($item)) {
            return null;
        }
        return [
            'id' => sanitize_id($item['id'] ?? ''),
            'name' => (string) ($item['name'] ?? ''),
            'note' => (string) ($item['note'] ?? ''),
            'lat' => (float) ($item['lat'] ?? 0.0),
            'lng' => (float) ($item['lng'] ?? 0.0),
            'water_id' => array_key_exists('waterId', $item) ? sanitize_nullable_id($item['waterId']) : null,
        ];
    }, $payload['steks'] ?? []), function ($row) {
        return $row['id'] !== '';
    }));

    $normalized['rigs'] = array_values(array_filter(array_map(function ($item) {
        if (!is_array($item)) {
            return null;
        }
        return [
            'id' => sanitize_id($item['id'] ?? ''),
            'name' => (string) ($item['name'] ?? ''),
            'note' => (string) ($item['note'] ?? ''),
            'lat' => (float) ($item['lat'] ?? 0.0),
            'lng' => (float) ($item['lng'] ?? 0.0),
            'water_id' => array_key_exists('waterId', $item) ? sanitize_nullable_id($item['waterId']) : null,
            'stek_id' => array_key_exists('stekId', $item) ? sanitize_nullable_id($item['stekId']) : null,
        ];
    }, $payload['rigs'] ?? []), function ($row) {
        return $row['id'] !== '';
    }));

    $bathy = $payload['bathy'] ?? [];
    $points = [];
    foreach ($bathy['points'] ?? [] as $item) {
        if (!is_array($item)) {
            continue;
        }
        $points[] = [
            'lat' => (float) ($item['lat'] ?? 0.0),
            'lon' => (float) ($item['lon'] ?? 0.0),
            'dep' => (float) ($item['dep'] ?? 0.0),
            'dataset_id' => array_key_exists('dataset_id', $item) ? sanitize_nullable_id($item['dataset_id']) : null,
        ];
    }

    $datasets = [];
    $datasetIndex = 0;
    foreach ($bathy['datasets'] ?? [] as $dataset) {
        if (!is_array($dataset)) {
            continue;
        }
        $datasetIndex++;
        $identifier = sanitize_id($dataset['id'] ?? ('dataset_' . $datasetIndex));
        if ($identifier === '') {
            $identifier = sanitize_id('dataset_' . $datasetIndex);
        }
        $datasets[] = ['id' => $identifier, 'payload' => $dataset];
    }

    [$points, $datasets] = ensureBathyDatasetIntegrity($points, $datasets);

    $normalized['bathy'] = [
        'points' => $points,
        'datasets' => $datasets,
    ];

    $settingsPayload = is_array($payload['settings'] ?? null) ? $payload['settings'] : [];
    $normalized['settings'] = [];
    foreach (array_merge($defaults, $settingsPayload) as $key => $value) {
        $normalized['settings'][$key] = is_scalar($value) ? (string) $value : json_encode($value, JSON_UNESCAPED_UNICODE);
    }

    return $normalized;
}

function ensureBathyDatasetIntegrity(array $points, array $datasets): array
{
    $now = (new DateTimeImmutable('now'))->format('c');
    $datasetMap = [];
    $generateDatasetId = static function () {
        try {
            return 'dataset_' . substr(bin2hex(random_bytes(6)), 0, 12);
        } catch (Throwable $e) {
            return 'dataset_' . substr(hash('sha256', (string) microtime(true)), 0, 12);
        }
    };
    foreach ($datasets as &$dataset) {
        $dataset['id'] = sanitize_id($dataset['id'] ?? '');
        if ($dataset['id'] === '') {
            $dataset['id'] = sanitize_id($generateDatasetId());
        }
        if (!isset($dataset['payload']) || !is_array($dataset['payload'])) {
            $dataset['payload'] = [];
        }
        if (empty($dataset['payload']['id'])) {
            $dataset['payload']['id'] = $dataset['id'];
        } else {
            $dataset['payload']['id'] = sanitize_id((string) $dataset['payload']['id']);
        }
        if (empty($dataset['payload']['importedAt'])) {
            $dataset['payload']['importedAt'] = $now;
        }
        $datasetMap[$dataset['id']] = &$dataset;
    }
    unset($dataset);

    $counts = [];
    $fallbackId = null;
    foreach ($points as &$point) {
        $datasetId = sanitize_id($point['dataset_id'] ?? '');
        if ($datasetId === '') {
            if ($fallbackId === null) {
                $fallbackId = sanitize_id($generateDatasetId());
            }
            $datasetId = $fallbackId;
            $point['dataset_id'] = $datasetId;
        }
        $counts[$datasetId] = ($counts[$datasetId] ?? 0) + 1;
    }
    unset($point);

    foreach ($counts as $datasetId => $count) {
        if (isset($datasetMap[$datasetId])) {
            if (!isset($datasetMap[$datasetId]['payload']['pointCount'])) {
                $datasetMap[$datasetId]['payload']['pointCount'] = $count;
            }
            continue;
        }
        $datasets[] = [
            'id' => $datasetId,
            'payload' => [
                'id' => $datasetId,
                'label' => 'Dataset ' . $datasetId,
                'pointCount' => $count,
                'generated' => true,
                'importedAt' => $now,
            ],
        ];
    }

    return [$points, $datasets];
}

function fetchWaters(mysqli $db): array
{
    $waters = [];
    $result = $db->query('SELECT id, name, geojson FROM waters ORDER BY name');
    while ($row = $result->fetch_assoc()) {
        $geojson = json_decode((string) $row['geojson'], true);
        $waters[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'geojson' => $geojson,
        ];
    }
    return $waters;
}

function fetchSteks(mysqli $db): array
{
    $list = [];
    $result = $db->query('SELECT id, name, note, lat, lng, water_id FROM steks ORDER BY name');
    while ($row = $result->fetch_assoc()) {
        $list[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'note' => $row['note'] ?? '',
            'lat' => (float) $row['lat'],
            'lng' => (float) $row['lng'],
            'waterId' => $row['water_id'] ?? null,
        ];
    }
    return $list;
}

function fetchSpots(mysqli $db): array
{
    $list = [];
    $result = $db->query('SELECT id, name, note, lat, lng, water_id, stek_id FROM spots ORDER BY name');
    while ($row = $result->fetch_assoc()) {
        $list[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'note' => $row['note'] ?? '',
            'lat' => (float) $row['lat'],
            'lng' => (float) $row['lng'],
            'waterId' => $row['water_id'] ?? null,
            'stekId' => $row['stek_id'] ?? null,
        ];
    }
    return $list;
}

function fetchBathy(mysqli $db): array
{
    $points = [];
    $result = $db->query('SELECT dataset_id, lat, lon, dep FROM bathy_points ORDER BY id');
    while ($row = $result->fetch_assoc()) {
        $points[] = [
            'lat' => (float) $row['lat'],
            'lon' => (float) $row['lon'],
            'dep' => (float) $row['dep'],
            'dataset_id' => $row['dataset_id'] ?? null,
        ];
    }

    $datasets = [];
    $dsResult = $db->query('SELECT id, payload FROM bathy_datasets ORDER BY id');
    while ($row = $dsResult->fetch_assoc()) {
        $decoded = json_decode((string) $row['payload'], true);
        if (is_array($decoded)) {
            if (!isset($decoded['id'])) {
                $decoded['id'] = $row['id'];
            }
            $datasets[] = $decoded;
        }
    }

    return ['points' => $points, 'datasets' => $datasets];
}

function fetchSettings(mysqli $db, array $defaults): array
{
    $settings = $defaults;
    $result = $db->query('SELECT name, value FROM settings');
    while ($row = $result->fetch_assoc()) {
        $settings[$row['name']] = $row['value'];
    }
    return $settings;
}

function replaceWaters(mysqli $db, array $waters): void
{
    $db->query('DELETE FROM waters');
    if (!$waters) {
        return;
    }
    $stmt = $db->prepare('INSERT INTO waters (id, name, geojson) VALUES (?, ?, ?)');
    foreach ($waters as $water) {
        $geojsonData = $water['geojson'];
        if ($geojsonData === null) {
            $geojsonData = ['type' => 'FeatureCollection', 'features' => []];
        }
        $geojson = json_encode($geojsonData, JSON_UNESCAPED_UNICODE);
        $stmt->bind_param('sss', $water['id'], $water['name'], $geojson);
        $stmt->execute();
    }
    $stmt->close();
}

function replaceSteks(mysqli $db, array $steks): void
{
    $db->query('DELETE FROM steks');
    if (!$steks) {
        return;
    }
    $stmt = $db->prepare('INSERT INTO steks (id, name, note, lat, lng, water_id) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($steks as $stek) {
        $waterId = $stek['water_id'] ?? null;
        $stmt->bind_param('sssdds', $stek['id'], $stek['name'], $stek['note'], $stek['lat'], $stek['lng'], $waterId);
        $stmt->execute();
    }
    $stmt->close();
}

function replaceSpots(mysqli $db, array $spots): void
{
    $db->query('DELETE FROM spots');
    if (!$spots) {
        return;
    }
    $stmt = $db->prepare('INSERT INTO spots (id, name, note, lat, lng, water_id, stek_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    foreach ($spots as $spot) {
        $waterId = $spot['water_id'] ?? null;
        $stekId = $spot['stek_id'] ?? null;
        $stmt->bind_param('sssddss', $spot['id'], $spot['name'], $spot['note'], $spot['lat'], $spot['lng'], $waterId, $stekId);
        $stmt->execute();
    }
    $stmt->close();
}

function normalizeBathyPoints(array $points): array
{
    $normalized = [];
    foreach ($points as $point) {
        if (!is_array($point)) {
            continue;
        }
        $lat = $point['lat'] ?? ($point['latitude'] ?? null);
        $lon = $point['lon'] ?? ($point['lng'] ?? null);
        $dep = $point['dep'] ?? ($point['depth'] ?? null);
        if (!is_numeric($lat) || !is_numeric($lon) || !is_numeric($dep)) {
            continue;
        }
        $datasetId = sanitize_nullable_id($point['dataset_id'] ?? ($point['datasetId'] ?? null));
        $normalized[] = [
            'dataset_id' => $datasetId ?? '',
            'lat' => (float) $lat,
            'lon' => (float) $lon,
            'dep' => (float) $dep,
        ];
    }
    return $normalized;
}

function normalizeBathyDatasets(array $datasets): array
{
    $normalized = [];
    foreach ($datasets as $dataset) {
        if (!is_array($dataset)) {
            continue;
        }
        $payload = $dataset['payload'] ?? $dataset;
        if (!is_array($payload)) {
            $payload = [];
        }
        $id = sanitize_id($dataset['id'] ?? ($payload['id'] ?? ''));
        if ($id === '') {
            continue;
        }
        if (!isset($payload['id'])) {
            $payload['id'] = $id;
        }
        $normalized[] = ['id' => $id, 'payload' => $payload];
    }
    return $normalized;
}

function replaceBathy(mysqli $db, array $bathy): void
{
    $db->query('DELETE FROM bathy_points');
    $db->query('DELETE FROM bathy_datasets');

    $points = $bathy['points'] ?? [];
    if ($points) {
        $stmt = $db->prepare("INSERT INTO bathy_points (dataset_id, lat, lon, dep) VALUES (NULLIF(?, ''), ?, ?, ?)");
        foreach ($points as $point) {
            $datasetId = $point['dataset_id'] ?? '';
            $stmt->bind_param('sddd', $datasetId, $point['lat'], $point['lon'], $point['dep']);
            $stmt->execute();
        }
        $stmt->close();
    }

    $datasets = $bathy['datasets'] ?? [];
    if ($datasets) {
        $stmt = $db->prepare('INSERT INTO bathy_datasets (id, payload) VALUES (?, ?)');
        foreach ($datasets as $dataset) {
            $payload = $dataset['payload'] ?? [];
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $stmt->bind_param('ss', $dataset['id'], $json);
            $stmt->execute();
        }
        $stmt->close();
    }
}

function appendBathy(mysqli $db, array $payload): array
{
    $points = normalizeBathyPoints($payload['points'] ?? []);
    $datasets = normalizeBathyDatasets($payload['datasets'] ?? []);
    if (!$points && !$datasets) {
        return ['points' => 0, 'datasets' => 0];
    }

    $db->begin_transaction();
    try {
        if ($datasets) {
            $stmt = $db->prepare('INSERT INTO bathy_datasets (id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)');
            foreach ($datasets as $dataset) {
                $json = json_encode($dataset['payload'], JSON_UNESCAPED_UNICODE);
                $stmt->bind_param('ss', $dataset['id'], $json);
                $stmt->execute();
            }
            $stmt->close();
        }

        if ($points) {
            $stmt = $db->prepare("INSERT INTO bathy_points (dataset_id, lat, lon, dep) VALUES (NULLIF(?, ''), ?, ?, ?)");
            foreach ($points as $point) {
                $datasetId = $point['dataset_id'] ?? '';
                $stmt->bind_param('sddd', $datasetId, $point['lat'], $point['lon'], $point['dep']);
                $stmt->execute();
            }
            $stmt->close();
        }

        $db->commit();
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }

    return ['points' => count($points), 'datasets' => count($datasets)];
}

function clearBathy(mysqli $db): void
{
    $db->begin_transaction();
    try {
        $db->query('DELETE FROM bathy_points');
        $db->query('DELETE FROM bathy_datasets');
        $db->commit();
    } catch (Throwable $e) {
        $db->rollback();
        throw $e;
    }
}

function storeSettings(mysqli $db, array $settings): void
{
    $db->query('DELETE FROM settings');
    if (!$settings) {
        return;
    }
    $stmt = $db->prepare('INSERT INTO settings (name, value) VALUES (?, ?)');
    foreach ($settings as $name => $value) {
        $stmt->bind_param('ss', $name, $value);
        $stmt->execute();
    }
    $stmt->close();
}

function maybeHydrateFromLegacy(mysqli $db, string $legacyKey, array $defaults): void
{
    if (!schemaIsEmpty($db)) {
        return;
    }

    $legacy = readLegacySnapshot($db, $legacyKey);
    if (is_array($legacy)) {
        persistState($db, $legacy, $defaults);
        return;
    }

    persistState($db, $defaults, $defaults);
}

function schemaIsEmpty(mysqli $db): bool
{
    foreach (['waters', 'steks', 'spots', 'bathy_points'] as $table) {
        $result = $db->query("SELECT 1 FROM {$table} LIMIT 1");
        if ($result && $result->num_rows > 0) {
            return false;
        }
    }
    return true;
}

function readLegacySnapshot(mysqli $db, string $key): ?array
{
    $tableCheck = $db->query("SHOW TABLES LIKE 'kv'");
    if (!$tableCheck || $tableCheck->num_rows === 0) {
        return null;
    }

    $stmt = $db->prepare('SELECT value FROM kv WHERE id = ? LIMIT 1');
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $result = $stmt->get_result();
    $value = null;
    if ($row = $result->fetch_assoc()) {
        $decoded = json_decode((string) $row['value'], true);
        if (is_array($decoded)) {
            $value = $decoded;
        }
    }
    $stmt->close();

    return $value;
}

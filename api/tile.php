<?php
declare(strict_types=1);

$layer = strtolower((string) ($_GET['layer'] ?? 'osm'));
$z = (int) ($_GET['z'] ?? 0);
$x = (int) ($_GET['x'] ?? 0);
$y = (int) ($_GET['y'] ?? 0);
$retinaToken = isset($_GET['r']) ? (string) $_GET['r'] : '';

if ($z < 0) {
    $z = 0;
}
if ($z > 20) {
    $z = 20;
}

$layers = [
    'osm' => [
        'urls' => [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        'maxZoom' => 20,
        'ext' => 'png',
        'contentType' => 'image/png',
        'supportsRetina' => false,
    ],
    'toner' => [
        'urls' => [
            'https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
            'https://stamen-tiles-b.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
        ],
        'maxZoom' => 20,
        'ext' => 'png',
        'contentType' => 'image/png',
        'supportsRetina' => false,
    ],
    'terrain' => [
        'urls' => [
            'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
            'https://stamen-tiles-b.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
        ],
        'maxZoom' => 18,
        'ext' => 'jpg',
        'contentType' => 'image/jpeg',
        'supportsRetina' => false,
    ],
    'dark' => [
        'urls' => [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        ],
        'maxZoom' => 20,
        'ext' => 'png',
        'contentType' => 'image/png',
        'supportsRetina' => true,
    ],
];

if (!isset($layers[$layer])) {
    http_response_code(404);
    exit;
}

$layerCfg = $layers[$layer];
if ($z > $layerCfg['maxZoom']) {
    $z = $layerCfg['maxZoom'];
}

$tileDir = __DIR__ . '/cache/tiles/' . $layer . '/' . $z;
$cacheEnabled = true;
if (!is_dir($tileDir)) {
    $cacheEnabled = @mkdir($tileDir, 0775, true);
}
$cacheEnabled = $cacheEnabled && is_dir($tileDir) && is_writable($tileDir);
$retinaSuffix = '';
if ($layerCfg['supportsRetina']) {
    $retinaSuffix = ($retinaToken === '@2x' || $retinaToken === '2x') ? '@2x' : '';
}
$cacheFile = $cacheEnabled ? sprintf('%s/%d-%d%s.%s', $tileDir, $x, $y, $retinaSuffix, $layerCfg['ext']) : null;
$cacheTtl = 86400; // 1 day

if ($cacheFile && is_file($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    header('Content-Type: ' . $layerCfg['contentType']);
    header('Cache-Control: public, max-age=' . $cacheTtl);
    readfile($cacheFile);
    exit;
}

$template = $layerCfg['urls'][array_rand($layerCfg['urls'])];
$url = strtr($template, [
    '{z}' => (string) $z,
    '{x}' => (string) $x,
    '{y}' => (string) $y,
    '{r}' => $retinaSuffix,
]);

$tileData = fetchRemoteTile($url);
if ($tileData === null) {
    http_response_code(204);
    exit;
}

if ($cacheFile) {
    @file_put_contents($cacheFile, $tileData);
}
header('Content-Type: ' . $layerCfg['contentType']);
header('Cache-Control: public, max-age=' . $cacheTtl);
echo $tileData;

function fetchRemoteTile(string $url): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'VisLokatiesTileProxy/1.0',
        ]);
        $data = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($status >= 200 && $status < 300 && $data !== false) {
            return $data;
        }
        return null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: VisLokatiesTileProxy/1.0\r\n",
        ],
    ]);
    $data = @file_get_contents($url, false, $context);
    if ($data === false) {
        return null;
    }
    return $data;
}

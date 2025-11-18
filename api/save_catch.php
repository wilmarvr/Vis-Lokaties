<?php
require_once __DIR__ . '/db.php';

function vislok_store_photo(?string $dataUrl, ?string $existingPath = null): ?string {
    if (!$dataUrl) {
        return $existingPath;
    }

    if (!preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/', $dataUrl, $matches)) {
        throw new InvalidArgumentException('Ongeldig fotobestand');
    }

    $mime = strtolower($matches[1]);
    $binary = base64_decode(str_replace(' ', '+', $matches[2]), true);
    if ($binary === false) {
        throw new InvalidArgumentException('Kon foto niet decoderen');
    }

    $extension = 'jpg';
    switch ($mime) {
        case 'image/png':
            $extension = 'png';
            break;
        case 'image/gif':
            $extension = 'gif';
            break;
        case 'image/webp':
            $extension = 'webp';
            break;
        case 'image/jpeg':
        case 'image/jpg':
            $extension = 'jpg';
            break;
        default:
            throw new InvalidArgumentException('Niet-ondersteund beeldformaat');
    }

    $targetDir = __DIR__ . '/../uploads/catches';
    if (!is_dir($targetDir) && !mkdir($targetDir, 0775, true) && !is_dir($targetDir)) {
        throw new RuntimeException('Kan uploadmap niet aanmaken');
    }

    if ($existingPath) {
        $existingFile = realpath(__DIR__ . '/../' . $existingPath);
        if ($existingFile && strpos($existingFile, realpath(__DIR__ . '/..')) === 0) {
            @unlink($existingFile);
        }
    }

    $fileName = sprintf('catch_%s.%s', uniqid(), $extension);
    $filePath = $targetDir . '/' . $fileName;
    if (file_put_contents($filePath, $binary) === false) {
        throw new RuntimeException('Foto kon niet worden opgeslagen');
    }

    return 'uploads/catches/' . $fileName;
}

try {
    $payload = vislok_read_json();
    $spotId = $payload['spot_id'] ?? '';
    if (!$spotId) {
        vislok_json_response(['error' => 'spot_id vereist'], 400);
    }

    $pdo = vislok_get_connection();
    $stmt = $pdo->prepare('SELECT id, type FROM spots WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $spotId]);
    $spot = $stmt->fetch();
    if (!$spot) {
        vislok_json_response(['error' => 'Stek niet gevonden'], 404);
    }
    if ($spot['type'] !== 'stek') {
        vislok_json_response(['error' => 'Vangsten kunnen alleen aan stekken gekoppeld worden'], 400);
    }

    $rigId = $payload['rig_id'] ?? null;
    $rigIdValue = null;
    if ($rigId) {
        $rigStmt = $pdo->prepare('SELECT id, type, stek_id FROM spots WHERE id = :id LIMIT 1');
        $rigStmt->execute([':id' => $rigId]);
        $rig = $rigStmt->fetch();
        if (!$rig) {
            vislok_json_response(['error' => 'Rig niet gevonden'], 404);
        }
        if ($rig['type'] !== 'rig') {
            vislok_json_response(['error' => 'Ongeldig rig-type voor vangst'], 400);
        }
        $rigIdValue = $rig['id'];
        if (($rig['stek_id'] ?? null) !== $spotId) {
            $assignStmt = $pdo->prepare('UPDATE spots SET stek_id = :stek WHERE id = :id');
            $assignStmt->execute([':stek' => $spotId, ':id' => $rigIdValue]);
        }
    }

    $id = $payload['id'] ?? uniqid('catch_', true);
    $title = trim($payload['title'] ?? '');
    $species = trim($payload['species'] ?? '');
    $weight = isset($payload['weight_kg']) ? (float)$payload['weight_kg'] : null;
    $length = isset($payload['length_cm']) ? (float)$payload['length_cm'] : null;
    $notes = $payload['notes'] ?? null;
    $caughtAt = $payload['caught_at'] ?? null;
    $photoData = $payload['photo'] ?? null;

    $existingPath = null;
    if (!empty($payload['id'])) {
        $currentStmt = $pdo->prepare('SELECT photo_path FROM catches WHERE id = :id LIMIT 1');
        $currentStmt->execute([':id' => $id]);
        $existing = $currentStmt->fetch();
        $existingPath = $existing['photo_path'] ?? null;
    }

    $photoPath = $photoData ? vislok_store_photo($photoData, $existingPath) : $existingPath;

    $stmt = $pdo->prepare('REPLACE INTO catches (id, spot_id, rig_id, title, species, weight_kg, length_cm, notes, photo_path, caught_at)
        VALUES (:id, :spot_id, :rig_id, :title, :species, :weight, :length, :notes, :photo, :caught_at)');
    $stmt->execute([
        ':id' => $id,
        ':spot_id' => $spotId,
        ':rig_id' => $rigIdValue,
        ':title' => $title ?: null,
        ':species' => $species ?: null,
        ':weight' => $weight,
        ':length' => $length,
        ':notes' => $notes ?: null,
        ':photo' => $photoPath,
        ':caught_at' => $caughtAt ?: null,
    ]);

    vislok_json_response([
        'status' => 'ok',
        'catch' => [
            'id' => $id,
            'spot_id' => $spotId,
            'rig_id' => $rigIdValue,
            'title' => $title,
            'species' => $species,
            'weight_kg' => $weight,
            'length_cm' => $length,
            'notes' => $notes,
            'photo_path' => $photoPath,
            'caught_at' => $caughtAt,
        ],
    ]);
} catch (Throwable $e) {
    vislok_json_response(['error' => $e->getMessage()], 500);
}

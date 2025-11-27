<?php
require __DIR__ . '/db.php';

function vislok_store_photo(?string $data): ?string
{
    if (!$data) return null;
    if (!preg_match('/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i', $data, $m)) {
        return null;
    }
    $ext = $m[1] === 'image/png' ? 'png' : ($m[1] === 'image/webp' ? 'webp' : 'jpg');
    $bytes = base64_decode($m[2]);
    if ($bytes === false) return null;
    $dir = __DIR__ . '/../uploads/catches';
    if (!is_dir($dir) && !mkdir($dir, 0777, true)) {
        vislok_error('Upload pad niet beschikbaar', 500);
    }
    $name = 'catch_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $path = $dir . '/' . $name;
    if (file_put_contents($path, $bytes) === false) {
        vislok_error('Upload opslaan mislukt', 500);
    }
    return 'uploads/catches/' . $name;
}

try {
    $input = vislok_json_input();
    $pdo = vislok_bootstrap();

    $stekId = $input['stekId'] ?? null;
    $rigId = $input['rigId'] ?? null;
    $waterId = $input['waterId'] ?? null;
    if ($rigId && !$stekId) {
        $stmt = $pdo->prepare('SELECT stek_id FROM rigs WHERE id = ?');
        $stmt->execute([$rigId]);
        $stekId = $stmt->fetchColumn() ?: null;
    }
    if ($stekId && !$waterId) {
        $stmt = $pdo->prepare('SELECT water_id FROM stekken WHERE id = ?');
        $stmt->execute([$stekId]);
        $waterId = $stmt->fetchColumn() ?: null;
    }

    if (!$stekId) {
        vislok_error('Stek verplicht voor vangst', 400);
    }

    $id = vislok_sanitize_id($input['id'] ?? null, 'catch');
    $kg = isset($input['weightKg']) ? (float)$input['weightKg'] : null;
    $lbs = isset($input['weightLbs']) ? (float)$input['weightLbs'] : null;
    $length = isset($input['lengthCm']) ? (float)$input['lengthCm'] : null;
    $notes = substr(trim($input['notes'] ?? ''), 0, 2000);
    $photoPath = vislok_store_photo($input['photo'] ?? null);

    // Preserve existing photo when no new upload is provided
    $existingPhoto = null;
    if ($photoPath === null && $id !== null) {
        $stmt = $pdo->prepare('SELECT photo FROM catches WHERE id = ?');
        $stmt->execute([$id]);
        $existingPhoto = $stmt->fetchColumn() ?: null;
    }
    $photoToSave = $photoPath ?? $existingPhoto;
    $caughtAt = $input['caughtAt'] ?? null;

    $pdo->prepare('REPLACE INTO catches (id, water_id, stek_id, rig_id, weight_kg, weight_lbs, length_cm, notes, photo, caught_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $waterId, $stekId, $rigId, $kg, $lbs, $length, $notes, $photoToSave, $caughtAt]);

    $saved = [
        'id' => $id,
        'water_id' => $waterId,
        'stek_id' => $stekId,
        'rig_id' => $rigId,
        'weight_kg' => $kg,
        'weight_lbs' => $lbs,
        'length_cm' => $length,
        'notes' => $notes,
        'photo' => $photoToSave,
        'caught_at' => $caughtAt,
    ];
    vislok_json_response(['catch' => $saved]);
} catch (Throwable $e) {
    vislok_error('Catch save failed', 500, ['detail' => $e->getMessage()]);
}

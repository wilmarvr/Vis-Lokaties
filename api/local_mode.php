<?php
function vislok_api_disabled(string $action): void {
    http_response_code(410);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'API uitgeschakeld: alle gegevens worden lokaal opgeslagen.',
        'action' => $action,
    ]);
    exit;
}

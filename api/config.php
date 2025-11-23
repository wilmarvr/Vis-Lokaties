<?php
return [
    'db' => [
        'host' => getenv('VISLOK_DB_HOST') ?: '127.0.0.1',
        'port' => (int)(getenv('VISLOK_DB_PORT') ?: 3306),
        'database' => getenv('VISLOK_DB_NAME') ?: 'vislok',
        'user' => getenv('VISLOK_DB_USER') ?: 'vislok_app',
        'pass' => getenv('VISLOK_DB_PASS') ?: 'vislok_app',
        'admin_user' => getenv('VISLOK_DB_ADMIN_USER') ?: 'root',
        'admin_pass' => getenv('VISLOK_DB_ADMIN_PASS') ?: '',
    ],
];

<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$defaults = [
    'admin_host' => 'localhost',
    'admin_port' => '3306',
    'admin_user' => 'root',
    'admin_password' => '',
    'database' => 'vis_lokaties',
    'app_host' => 'localhost',
    'app_user' => 'vislokaties',
    'app_password' => bin2hex(random_bytes(6)),
];

$status = [
    'errors' => [],
    'messages' => [],
    'config_written' => false,
    'table_ready' => false,
];

$input = $defaults;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($defaults as $key => $value) {
        $input[$key] = isset($_POST[$key]) ? trim((string) $_POST[$key]) : $value;
    }

    if ($input['database'] === '' || !preg_match('/^[A-Za-z0-9_]+$/', $input['database'])) {
        $status['errors'][] = 'Databasenaam mag alleen letters, cijfers en _ bevatten.';
    }

    if ($input['app_user'] === '' || !preg_match('/^[A-Za-z0-9_]+$/', $input['app_user'])) {
        $status['errors'][] = 'Applicatiegebruiker mag alleen letters, cijfers en _ bevatten.';
    }

    if ($input['app_password'] === '') {
        $status['errors'][] = 'Voer een wachtwoord in voor de applicatiegebruiker.';
    }

    if (!$status['errors']) {
        try {
            $admin = new mysqli($input['admin_host'], $input['admin_user'], $input['admin_password'], '', (int) $input['admin_port']);
            $admin->set_charset('utf8mb4');

            $dbName = $input['database'];
            $safeDb = sprintf('`%s`', str_replace('`', '``', $dbName));
            $admin->query("CREATE DATABASE IF NOT EXISTS $safeDb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $status['messages'][] = "Database $dbName gecontroleerd/aangemaakt.";

            $safeUser = $admin->real_escape_string($input['app_user']);
            $safeHost = $admin->real_escape_string($input['app_host'] ?: 'localhost');
            $safePass = $admin->real_escape_string($input['app_password']);

            $admin->query("CREATE USER IF NOT EXISTS '$safeUser'@'$safeHost' IDENTIFIED BY '$safePass'");
            $admin->query("ALTER USER '$safeUser'@'$safeHost' IDENTIFIED BY '$safePass'");
            $status['messages'][] = "Gebruiker {$input['app_user']}@{$input['app_host']} ingesteld.";

            $admin->query("GRANT ALL PRIVILEGES ON $safeDb.* TO '$safeUser'@'$safeHost'");
            $admin->query('FLUSH PRIVILEGES');
            $status['messages'][] = 'Rechten toegekend.';

            $appConnectHost = resolveAppConnectHost($input);
            $appConn = new mysqli($appConnectHost, $input['app_user'], $input['app_password'], $input['database'], (int) $input['admin_port']);
            $appConn->set_charset('utf8mb4');
            ensureStorageTable($appConn);
            $status['table_ready'] = true;
            $status['messages'][] = 'kv-tabel is aanwezig en juist.';

            $configTarget = __DIR__ . '/config.php';
            $configData = [
                'host' => $appConnectHost,
                'port' => (int) $input['admin_port'],
                'user' => $input['app_user'],
                'password' => $input['app_password'],
                'database' => $input['database'],
            ];
            $configTemplate = "<?php\nreturn " . var_export($configData, true) . ";\n";
            $configPreview = $configTemplate;

            if (!file_exists($configTarget) || is_writable($configTarget) || is_writable(dirname($configTarget))) {
                file_put_contents($configTarget, $configTemplate);
                $status['config_written'] = true;
                $status['messages'][] = 'config.php is aangemaakt/bijgewerkt.';
            } else {
                $status['messages'][] = 'Kon config.php niet schrijven – maak dit bestand handmatig aan met onderstaande inhoud.';
            }
        } catch (mysqli_sql_exception $e) {
            $status['errors'][] = 'Installatie is gestopt: ' . $e->getMessage();
        }
    }
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function resolveAppConnectHost(array $input): string
{
    $loopbackHosts = ['localhost', '127.0.0.1', '::1'];
    if (isset($input['app_host']) && in_array($input['app_host'], $loopbackHosts, true)) {
        return $input['app_host'];
    }

    return $input['admin_host'];
}

$previewHost = resolveAppConnectHost($input);
$configPreview = "<?php\nreturn " . var_export([
    'host' => $previewHost,
    'port' => (int) $input['admin_port'],
    'user' => $input['app_user'],
    'password' => $input['app_password'],
    'database' => $input['database'],
], true) . ";\n";

?><!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vis Lokaties installatie</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 20px; background: #0f172a; color: #f8fafc; }
        h1 { margin-bottom: 0.5em; }
        form { background: #1e293b; padding: 20px; border-radius: 12px; max-width: 640px; }
        label { display: block; margin-bottom: 12px; }
        input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; }
        button { padding: 10px 16px; border: 0; border-radius: 6px; background: #38bdf8; color: #0f172a; font-weight: 600; cursor: pointer; }
        .messages { margin: 16px 0; padding: 12px; border-radius: 8px; }
        .messages.error { background: #7f1d1d; }
        .messages.ok { background: #14532d; }
        pre { background: #020617; padding: 12px; border-radius: 8px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Vis Lokaties installatie</h1>
    <p>Gebruik deze wizard om de database, gebruiker en tabellen voor Vis Lokaties automatisch aan te maken via een MySQL-administrator.</p>

    <?php if ($status['errors']): ?>
        <div class="messages error">
            <strong>Fouten:</strong>
            <ul>
                <?php foreach ($status['errors'] as $error): ?>
                    <li><?= e($error) ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>

    <?php if (!$status['errors'] && $_SERVER['REQUEST_METHOD'] === 'POST'): ?>
        <div class="messages ok">
            <strong>Installatie voltooid.</strong>
            <ul>
                <?php foreach ($status['messages'] as $msg): ?>
                    <li><?= e($msg) ?></li>
                <?php endforeach; ?>
            </ul>
        </div>
    <?php endif; ?>

    <form method="post">
        <h2>1. Administrator-verbinding</h2>
        <label>Host
            <input type="text" name="admin_host" value="<?= e($input['admin_host']) ?>" required>
        </label>
        <label>Poort
            <input type="number" name="admin_port" value="<?= e($input['admin_port']) ?>" required>
        </label>
        <label>Gebruiker met adminrechten
            <input type="text" name="admin_user" value="<?= e($input['admin_user']) ?>" required>
        </label>
        <label>Wachtwoord admin
            <input type="password" name="admin_password" value="<?= e($input['admin_password']) ?>">
        </label>

        <h2>2. Nieuwe database + applicatiegebruiker</h2>
        <label>Databasenaam
            <input type="text" name="database" value="<?= e($input['database']) ?>" required>
        </label>
        <label>Applicatie host (meestal localhost of %)
            <input type="text" name="app_host" value="<?= e($input['app_host']) ?>" required>
        </label>
        <label>Applicatie gebruiker
            <input type="text" name="app_user" value="<?= e($input['app_user']) ?>" required>
        </label>
        <label>Applicatie wachtwoord
            <input type="text" name="app_password" value="<?= e($input['app_password']) ?>" required>
        </label>

        <button type="submit">Maak database & gebruiker aan</button>
    </form>

    <h2>config.php voorbeeld</h2>
    <p>Mocht het bestand niet automatisch zijn aangemaakt, kopieer onderstaande inhoud naar <code>api/config.php</code>.</p>
    <pre><?= e($configPreview) ?></pre>
</body>
</html>

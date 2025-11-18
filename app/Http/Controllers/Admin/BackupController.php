<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Process\Process;

class BackupController extends Controller
{
    public function store(): RedirectResponse
    {
        $connection = Config::get('database.default');
        $config = Config::get("database.connections.{$connection}");

        if (($config['driver'] ?? null) === 'sqlite') {
            $database = $config['database'] ?? database_path('database.sqlite');
            if (! file_exists($database)) {
                @mkdir(dirname($database), 0755, true);
                file_put_contents($database, '');
            }

            $timestamp = now()->format('Ymd_His');
            $target = "backups/vis-lokaties-{$timestamp}.sqlite";
            Storage::disk('local')->put($target, file_get_contents($database));

            return back()->with('status', 'Backup created.');
        }

        if (($config['driver'] ?? null) === 'mysql') {
            $timestamp = now()->format('Ymd_His');
            $target = "backups/vis-lokaties-{$timestamp}.sql";

            $command = [
                'mysqldump',
                '--host=' . ($config['host'] ?? '127.0.0.1'),
                '--port=' . ($config['port'] ?? '3306'),
                '--user=' . ($config['username'] ?? 'root'),
            ];

            if (! empty($config['password'])) {
                $command[] = '--password=' . $config['password'];
            }

            if (! empty($config['unix_socket'])) {
                $command[] = '--socket=' . $config['unix_socket'];
            }

            $command[] = $config['database'];

            $process = new Process($command);
            $process->setTimeout(120);
            $process->run();

            if (! $process->isSuccessful()) {
                return back()->withErrors('Backup failed: ' . $process->getErrorOutput() ?: $process->getOutput());
            }

            Storage::disk('local')->put($target, $process->getOutput());

            return back()->with('status', 'Backup created.');
        }

        return back()->withErrors('Backups are only supported for SQLite or MySQL connections.');
    }

    public function download(string $path): StreamedResponse
    {
        $file = basename($path);
        abort_unless(Storage::disk('local')->exists("backups/{$file}"), 404);

        return Storage::disk('local')->download("backups/{$file}");
    }
}

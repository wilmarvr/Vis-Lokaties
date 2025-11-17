<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BackupController extends Controller
{
    public function store(): RedirectResponse
    {
        $database = database_path('database.sqlite');
        if (! file_exists($database)) {
            @mkdir(dirname($database), 0755, true);
            file_put_contents($database, '');
        }

        $timestamp = now()->format('Ymd_His');
        $target = "backups/vis-lokaties-{$timestamp}.sqlite";
        Storage::disk('local')->put($target, file_get_contents($database));

        return back()->with('status', 'Backup created.');
    }

    public function download(string $path): StreamedResponse
    {
        $file = basename($path);
        abort_unless(Storage::disk('local')->exists("backups/{$file}"), 404);

        return Storage::disk('local')->download("backups/{$file}");
    }
}

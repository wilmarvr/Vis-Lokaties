<?php

namespace App\Providers;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    protected static bool $autoMigrated = false;

    public function register(): void
    {
    }

    public function boot(): void
    {
        $this->autoMigrateIfNeeded();
    }

    protected function autoMigrateIfNeeded(): void
    {
        if (self::$autoMigrated) {
            return;
        }

        if ($this->app->runningInConsole()) {
            return;
        }

        if (!config('app.auto_migrate')) {
            return;
        }

        try {
            $exitCode = Artisan::call('migrate', [
                '--force' => true,
                '--quiet' => true,
            ]);

            if ($exitCode === 0) {
                self::$autoMigrated = true;
            }
        } catch (\Throwable $e) {
            Log::warning('Automatic migration failed: ' . $e->getMessage());
        }
    }
}

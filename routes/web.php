<?php

use App\Http\Controllers\Admin\BackupController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\MapController;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'show'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);
    Route::get('/register', [RegisterController::class, 'show'])->name('register');
    Route::post('/register', [RegisterController::class, 'store']);
});

Route::post('/logout', [LoginController::class, 'destroy'])->middleware('auth')->name('logout');

Route::middleware('auth')->group(function () {
    Route::get('/', MapController::class)->name('dashboard');

    Route::prefix('admin')->middleware('can:access-admin')->group(function () {
        Route::get('/', DashboardController::class)->name('admin.dashboard');
        Route::get('/users', [UserController::class, 'index'])->name('admin.users');
        Route::patch('/users/{user}', [UserController::class, 'update'])->name('admin.users.update');
        Route::delete('/users/{user}', [UserController::class, 'destroy'])->name('admin.users.destroy');

        Route::get('/settings', [AdminSettingController::class, 'index'])->name('admin.settings');
        Route::post('/settings', [AdminSettingController::class, 'store'])->name('admin.settings.store');

        Route::post('/backups', [BackupController::class, 'store'])->name('admin.backups.store');
        Route::get('/backups/{file}', [BackupController::class, 'download'])->name('admin.backups.download');
    });
});

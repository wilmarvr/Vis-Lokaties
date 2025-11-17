<?php

use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\BathyPointController;
use App\Http\Controllers\Api\DatasetController;
use App\Http\Controllers\Api\RigController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\StekController;
use App\Http\Controllers\Api\WaterController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('waters', [WaterController::class, 'index']);
    Route::post('waters', [WaterController::class, 'store']);
    Route::patch('waters/{water}', [WaterController::class, 'update']);
    Route::delete('waters/{water}', [WaterController::class, 'destroy']);

    Route::apiResource('steks', StekController::class)->except(['show']);
    Route::apiResource('rigs', RigController::class)->except(['show']);

    Route::get('datasets', [DatasetController::class, 'index']);
    Route::post('datasets', [DatasetController::class, 'store']);
    Route::patch('datasets/{dataset}', [DatasetController::class, 'update']);
    Route::delete('datasets/{dataset}', [DatasetController::class, 'destroy']);

    Route::get('bathy', [BathyPointController::class, 'index']);
    Route::post('bathy', [BathyPointController::class, 'store']);
    Route::delete('bathy', [BathyPointController::class, 'destroy']);

    Route::get('settings', [SettingController::class, 'index']);
    Route::post('settings', [SettingController::class, 'store']);

    Route::post('attachments', [AttachmentController::class, 'store']);
    Route::delete('attachments/{attachment}', [AttachmentController::class, 'destroy']);
});

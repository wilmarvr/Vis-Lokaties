<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BathyPoint;
use App\Models\Dataset;
use App\Models\Rig;
use App\Models\Stek;
use App\Models\User;
use App\Models\Water;

class DashboardController extends Controller
{
    public function __invoke()
    {
        return view('admin.dashboard', [
            'userCount' => User::count(),
            'waterCount' => Water::count(),
            'stekCount' => Stek::count(),
            'rigCount' => Rig::count(),
            'datasetCount' => Dataset::count(),
            'bathyCount' => BathyPoint::count(),
        ]);
    }
}

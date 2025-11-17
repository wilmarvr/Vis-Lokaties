<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class MapController extends Controller
{
    public function __invoke(Request $request)
    {
        return view('map');
    }
}

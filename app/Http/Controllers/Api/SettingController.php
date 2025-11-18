<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SettingController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $settings = Setting::where('user_id', $request->user()->id)->get();

        return JsonResource::collection($settings);
    }

    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:120'],
            'value' => ['nullable'],
        ]);

        $setting = Setting::updateOrCreate([
            'user_id' => $request->user()->id,
            'key' => $data['key'],
        ], [
            'value' => $data['value'],
        ]);

        return JsonResource::make($setting);
    }
}

<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class SettingController extends Controller
{
    public function index(): View
    {
        $settings = Setting::whereNull('user_id')->get()->keyBy('key');

        return view('admin.settings', ['settings' => $settings]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'key' => ['required', 'string', 'max:120'],
            'value' => ['nullable'],
        ]);

        Setting::updateOrCreate([
            'user_id' => null,
            'key' => $data['key'],
        ], [
            'value' => $this->castSettingValue($data['value']),
        ]);

        return back()->with('status', 'Setting saved.');
    }

    protected function castSettingValue(?string $value)
    {
        if ($value === null || $value === '') {
            return null;
        }

        $decoded = json_decode($value, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $decoded;
        }

        return ['raw' => $value];
    }
}

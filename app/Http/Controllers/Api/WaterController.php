<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Water;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WaterController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $waters = Water::where('user_id', $request->user()->id)->latest()->get();

        return JsonResource::collection($waters);
    }

    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'geometry' => ['nullable', 'array'],
            'color' => ['nullable', 'string'],
        ]);

        $water = $request->user()->waters()->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'geometry' => geo_json_clean($data['geometry'] ?? null),
            'color' => $data['color'] ?? '#33a1ff',
        ]);

        return JsonResource::make($water);
    }

    public function update(Request $request, Water $water): JsonResource
    {
        abort_unless($water->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'geometry' => ['nullable', 'array'],
            'color' => ['nullable', 'string'],
        ]);

        $water->update([
            'name' => $data['name'] ?? $water->name,
            'description' => array_key_exists('description', $data) ? $data['description'] : $water->description,
            'geometry' => array_key_exists('geometry', $data) ? geo_json_clean($data['geometry']) : $water->geometry,
            'color' => $data['color'] ?? $water->color,
        ]);

        return JsonResource::make($water);
    }

    public function destroy(Request $request, Water $water)
    {
        abort_unless($water->user_id === $request->user()->id, 403);
        $water->delete();

        return response()->json();
    }
}

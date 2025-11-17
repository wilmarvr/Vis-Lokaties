<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Stek;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StekController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $steks = Stek::where('user_id', $request->user()->id)->with('water')->get();

        return JsonResource::collection($steks);
    }

    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'water_id' => ['nullable', 'exists:waters,id'],
            'name' => ['required', 'string', 'max:255'],
            'lat' => ['required', 'numeric'],
            'lng' => ['required', 'numeric'],
            'notes' => ['nullable', 'string'],
        ]);

        $stek = $request->user()->steks()->create($data);

        return JsonResource::make($stek->fresh('water'));
    }

    public function update(Request $request, Stek $stek): JsonResource
    {
        abort_unless($stek->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'water_id' => ['nullable', 'exists:waters,id'],
            'name' => ['sometimes', 'string', 'max:255'],
            'lat' => ['sometimes', 'numeric'],
            'lng' => ['sometimes', 'numeric'],
            'notes' => ['nullable', 'string'],
        ]);

        $stek->update($data);

        return JsonResource::make($stek->fresh('water'));
    }

    public function destroy(Request $request, Stek $stek)
    {
        abort_unless($stek->user_id === $request->user()->id, 403);
        $stek->delete();

        return response()->json();
    }
}

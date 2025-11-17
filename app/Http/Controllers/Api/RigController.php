<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Rig;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RigController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $rigs = Rig::where('user_id', $request->user()->id)->with(['water', 'stek'])->get();

        return JsonResource::collection($rigs);
    }

    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'water_id' => ['nullable', 'exists:waters,id'],
            'stek_id' => ['nullable', 'exists:steks,id'],
            'name' => ['required', 'string', 'max:255'],
            'lat' => ['required', 'numeric'],
            'lng' => ['required', 'numeric'],
            'depth' => ['nullable', 'numeric'],
            'notes' => ['nullable', 'string'],
        ]);

        $rig = $request->user()->rigs()->create($data);

        return JsonResource::make($rig->fresh(['water', 'stek']));
    }

    public function update(Request $request, Rig $rig): JsonResource
    {
        abort_unless($rig->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'water_id' => ['nullable', 'exists:waters,id'],
            'stek_id' => ['nullable', 'exists:steks,id'],
            'name' => ['sometimes', 'string', 'max:255'],
            'lat' => ['sometimes', 'numeric'],
            'lng' => ['sometimes', 'numeric'],
            'depth' => ['nullable', 'numeric'],
            'notes' => ['nullable', 'string'],
        ]);

        $rig->update($data);

        return JsonResource::make($rig->fresh(['water', 'stek']));
    }

    public function destroy(Request $request, Rig $rig)
    {
        abort_unless($rig->user_id === $request->user()->id, 403);
        $rig->delete();

        return response()->json();
    }
}

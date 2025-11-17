<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BathyPoint;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BathyPointController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $points = BathyPoint::where('user_id', $request->user()->id)->latest()->limit(5000)->get();

        return JsonResource::collection($points);
    }

    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'dataset_id' => ['nullable', 'exists:datasets,id'],
            'points' => ['required', 'array', 'max:2000'],
            'points.*.lat' => ['required', 'numeric'],
            'points.*.lng' => ['required', 'numeric'],
            'points.*.depth' => ['required', 'numeric'],
            'points.*.meta' => ['nullable', 'array'],
        ]);

        $datasetId = $data['dataset_id'] ?? null;
        if ($datasetId) {
            abort_unless($request->user()->datasets()->where('id', $datasetId)->exists(), 403);
        }

        $created = collect($data['points'])->map(function (array $point) use ($request, $datasetId) {
            return BathyPoint::create([
                'user_id' => $request->user()->id,
                'dataset_id' => $datasetId,
                'lat' => $point['lat'],
                'lng' => $point['lng'],
                'depth' => $point['depth'],
                'meta' => $point['meta'] ?? null,
            ]);
        });

        return JsonResource::collection($created);
    }

    public function destroy(Request $request)
    {
        BathyPoint::where('user_id', $request->user()->id)->delete();

        return response()->json();
    }
}

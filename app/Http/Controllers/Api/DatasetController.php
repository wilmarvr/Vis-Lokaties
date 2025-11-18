<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dataset;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DatasetController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $datasets = Dataset::where('user_id', $request->user()->id)->withCount('bathyPoints')->get();

        return JsonResource::collection($datasets);
    }

    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:255'],
            'meta' => ['nullable', 'array'],
        ]);

        $dataset = $request->user()->datasets()->create($data);

        return JsonResource::make($dataset);
    }

    public function update(Request $request, Dataset $dataset): JsonResource
    {
        abort_unless($dataset->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:255'],
            'meta' => ['nullable', 'array'],
        ]);

        $dataset->update($data);

        return JsonResource::make($dataset);
    }

    public function destroy(Request $request, Dataset $dataset)
    {
        abort_unless($dataset->user_id === $request->user()->id, 403);
        $dataset->delete();

        return response()->json();
    }
}

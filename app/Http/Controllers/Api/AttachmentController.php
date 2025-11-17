<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attachment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class AttachmentController extends Controller
{
    public function store(Request $request): JsonResource
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'max:20480'],
            'attachable_type' => ['nullable', 'string', 'max:120'],
            'attachable_id' => ['nullable', 'integer'],
        ]);

        $path = $request->file('file')->store('attachments');

        $attachment = Attachment::create([
            'user_id' => $request->user()->id,
            'attachable_type' => $data['attachable_type'] ?? null,
            'attachable_id' => $data['attachable_id'] ?? null,
            'path' => $path,
            'original_name' => $request->file('file')->getClientOriginalName(),
            'mime' => $request->file('file')->getMimeType(),
            'size' => $request->file('file')->getSize(),
        ]);

        return JsonResource::make($attachment);
    }

    public function destroy(Request $request, Attachment $attachment)
    {
        abort_unless($attachment->user_id === $request->user()->id, 403);
        Storage::disk(config('filesystems.default'))->delete($attachment->path);
        $attachment->delete();

        return response()->json();
    }
}

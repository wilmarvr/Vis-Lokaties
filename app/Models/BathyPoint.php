<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BathyPoint extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'dataset_id',
        'lat',
        'lng',
        'depth',
        'meta',
    ];

    protected $casts = [
        'lat' => 'float',
        'lng' => 'float',
        'depth' => 'float',
        'meta' => 'array',
    ];

    public function dataset()
    {
        return $this->belongsTo(Dataset::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

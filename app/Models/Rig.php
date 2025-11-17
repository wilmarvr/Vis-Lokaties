<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Rig extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'water_id',
        'stek_id',
        'name',
        'lat',
        'lng',
        'depth',
        'notes',
    ];

    protected $casts = [
        'lat' => 'float',
        'lng' => 'float',
        'depth' => 'float',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function water()
    {
        return $this->belongsTo(Water::class);
    }

    public function stek()
    {
        return $this->belongsTo(Stek::class);
    }
}

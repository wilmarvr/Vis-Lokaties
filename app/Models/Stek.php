<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Stek extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'water_id',
        'name',
        'lat',
        'lng',
        'notes',
    ];

    protected $casts = [
        'lat' => 'float',
        'lng' => 'float',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function water()
    {
        return $this->belongsTo(Water::class);
    }

    public function rigs()
    {
        return $this->hasMany(Rig::class);
    }
}

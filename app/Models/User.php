<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'is_admin',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'is_admin' => 'bool',
    ];

    public function waters()
    {
        return $this->hasMany(Water::class);
    }

    public function steks()
    {
        return $this->hasMany(Stek::class);
    }

    public function rigs()
    {
        return $this->hasMany(Rig::class);
    }

    public function datasets()
    {
        return $this->hasMany(Dataset::class);
    }

    public function bathyPoints()
    {
        return $this->hasMany(BathyPoint::class);
    }
}

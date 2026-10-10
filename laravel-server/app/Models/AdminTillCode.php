<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AdminTillCode extends Model
{
    use HasUuids;

    protected $fillable = [
        'admin_id',
        'code_hash',
        'code_encrypted',
        'label',
        'last_used_at',
        'revoked_at',
    ];

    protected $hidden = ['code_hash', 'code_encrypted'];

    protected $casts = [
        'last_used_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function scopeActive($query)
    {
        return $query->whereNull('revoked_at');
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}

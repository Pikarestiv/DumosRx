<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AdminTillSession extends Model
{
    use HasUuids;

    protected $fillable = [
        'admin_id',
        'store_id',
        'device_id',
        'started_at',
        'expires_at',
        'ended_at',
        'end_reason',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'expires_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function scopeLive($query)
    {
        return $query->whereNull('ended_at');
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}

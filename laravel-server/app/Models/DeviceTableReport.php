<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DeviceTableReport extends Model
{
    use HasUuids;

    protected $fillable = [
        'store_id',
        'device_id',
        'user_id',
        'diverged_count',
        'tables',
        'reported_at',
    ];

    protected $casts = [
        'diverged_count' => 'integer',
        'tables' => 'array',
        'reported_at' => 'datetime',
    ];
}

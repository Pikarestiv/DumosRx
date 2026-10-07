<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DeviceQueueReport extends Model
{
    use HasUuids;

    protected $fillable = [
        'store_id',
        'device_id',
        'user_id',
        'queue_depth',
        'stuck_count',
        'stuck_items',
        'reported_at',
    ];

    protected $casts = [
        'queue_depth' => 'integer',
        'stuck_count' => 'integer',
        'stuck_items' => 'array',
        'reported_at' => 'datetime',
    ];
}

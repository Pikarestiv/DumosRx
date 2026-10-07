<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DeviceStockReport extends Model
{
    use HasUuids;

    protected $fillable = [
        'store_id',
        'device_id',
        'user_id',
        'device_batch_count',
        'device_quantity_sum',
        'server_batch_count',
        'server_quantity_sum',
        'reported_at',
    ];

    protected $casts = [
        'device_batch_count' => 'integer',
        'server_batch_count' => 'integer',
        'reported_at' => 'datetime',
    ];
}

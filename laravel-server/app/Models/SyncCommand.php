<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SyncCommand extends Model
{
    use HasUuids;

    protected $fillable = [
        'store_id', 'device_id', 'action', 'table_name', 'record_id',
        'issued_by', 'status', 'result', 'issued_at', 'acted_at',
    ];

    protected $casts = [
        'issued_at' => 'datetime',
        'acted_at' => 'datetime',
    ];
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LoyaltyRedemptionOption extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id', 'user_id', 'store_id', 'label', 'points_cost', 'discount_value', 'description', 'icon_key',
        'is_active', 'sort_order', '_version', '_synced', '_synced_at', '_deleted',
    ];

    protected $casts = [
        'points_cost' => 'decimal:2',
        'discount_value' => 'decimal:2',
        'is_active' => 'boolean',
        '_synced' => 'boolean',
        '_synced_at' => 'datetime',
    ];
}

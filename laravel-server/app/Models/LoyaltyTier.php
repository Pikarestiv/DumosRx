<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LoyaltyTier extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id', 'user_id', 'name', 'min_spend', 'points_multiplier', 'benefits',
        'color', 'sort_order', '_version', '_synced', '_synced_at',
    ];

    protected $casts = [
        'min_spend' => 'decimal:2',
        'points_multiplier' => 'decimal:2',
        '_synced' => 'boolean',
        '_synced_at' => 'datetime',
    ];
}

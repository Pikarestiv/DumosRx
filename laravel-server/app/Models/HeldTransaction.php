<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperHeldTransaction
 */
class HeldTransaction extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id',
        'store_id',
        'customer_id',
        'customer_name',
        'items_json',
        'total_amount',
        'discount',
        'discount_type',
        'is_reseller_sale',
        'markup_type',
        'notes',
        '_version',
        '_synced',
        '_synced_at',
        '_deleted',
    ];

    protected $casts = [
        'is_reseller_sale' => 'boolean',
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
    ];
}

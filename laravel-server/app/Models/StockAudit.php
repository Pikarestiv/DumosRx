<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperStockAudit
 */
class StockAudit extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id',
        'store_id',
        'product_id',
        'expected_quantity',
        'actual_quantity',
        'difference',
        'expected_cost_price',
        'actual_cost_price',
        'cost_price_difference',
        'expected_selling_price',
        'actual_selling_price',
        'selling_price_difference',
        'notes',
        'user_id',
        'status',
        'reconciled_at',
        '_version',
        '_synced',
        '_synced_at',
        '_deleted',
    ];

    protected $casts = [
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
        'reconciled_at' => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}

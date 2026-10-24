<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property string|null $store_id
 */
class SaleItemBatch extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id', 'sale_item_id', 'stock_batch_id', 'quantity',
        '_version', '_synced', '_synced_at',
    ];

    protected $casts = [
        'quantity' => 'integer',
        '_synced' => 'boolean',
        '_synced_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<SaleItem, $this>
     */
    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class);
    }

    /**
     * @return BelongsTo<StockBatch, $this>
     */
    public function stockBatch(): BelongsTo
    {
        return $this->belongsTo(StockBatch::class);
    }
}

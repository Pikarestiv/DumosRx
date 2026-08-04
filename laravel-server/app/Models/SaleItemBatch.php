<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperSaleItemBatch
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

    public function saleItem()
    {
        return $this->belongsTo(SaleItem::class);
    }

    public function stockBatch()
    {
        return $this->belongsTo(StockBatch::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperSaleReturnItem
 */
class SaleReturnItem extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $table = 'return_items';

    protected $fillable = [
        'return_id', 'product_id', 'quantity', 'unit_price', 'subtotal',
        '_version', '_synced', '_synced_at', '_deleted'
    ];

    protected $casts = [
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
    ];

    public function saleReturn()
    {
        return $this->belongsTo(SaleReturn::class, 'return_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}

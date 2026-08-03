<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperSaleItem
 */
class SaleItem extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'sale_id', 'product_id', 'stock_batch_id', 'quantity',
        'unit_price', 'discount_amount', 'total_price', 'cost_price',
    ];
}

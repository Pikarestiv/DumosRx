<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockBatch extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'stock_batches';

    protected $fillable = [
        'product_id', 'batch_number', 'quantity', 'quantity_reserved',
        'reorder_level', 'max_stock_level', 'cost_price',
        'manufacture_date', 'expiry_date', 'supplier_id', 'location', 'status',
    ];

    protected $casts = [
        'manufacture_date' => 'date',
        'expiry_date' => 'date',
        'cost_price' => 'decimal:2',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }
}

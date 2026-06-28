<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'stock_batch_id', 'product_id', 'movement_type', 'quantity',
        'unit_cost', 'total_cost', 'reference_id', 'reference_type',
        'reason', 'performed_by', 'movement_date', '_synced_at',
    ];

    protected $casts = [
        'movement_date' => 'datetime',
        'quantity' => 'integer',
        'unit_cost' => 'decimal:2',
        'total_cost' => 'decimal:2',
    ];

    public function stockBatch()
    {
        return $this->belongsTo(StockBatch::class, 'stock_batch_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}

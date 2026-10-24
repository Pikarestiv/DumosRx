<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string|null $store_id
 */
class StockMovement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'stock_batch_id', 'product_id', 'store_id', 'movement_type', 'quantity',
        'unit_cost', 'total_cost', 'reference_id', 'reference_type',
        'reason', 'performed_by', 'movement_date', 'status', '_synced_at',
    ];

    protected $casts = [
        'movement_date' => 'datetime',
        'quantity' => 'integer',
        'unit_cost' => 'decimal:2',
        'total_cost' => 'decimal:2',
    ];

    /**
     * @return BelongsTo<StockBatch, $this>
     */
    public function stockBatch(): BelongsTo
    {
        return $this->belongsTo(StockBatch::class, 'stock_batch_id');
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}

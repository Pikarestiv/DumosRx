<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string|null $store_id
 * @property string|null $user_id
 */
class StockBatch extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'stock_batches';

    protected $guarded = [];

    protected $casts = [
        'manufacture_date' => 'date',
        'expiry_date' => 'date',
        'cost_price' => 'decimal:2',
    ];

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return BelongsTo<Supplier, $this>
     */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }
}

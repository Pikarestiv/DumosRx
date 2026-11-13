<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property string $id
 * @property string $return_id
 * @property string|null $sale_service_id
 * @property int $quantity
 * @property float $refund_amount
 * @property string|null $reason
 */
class ReturnService extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id', 'store_id', 'return_id', 'sale_service_id',
        'quantity', 'refund_amount', 'reason',
        '_version', '_synced', '_synced_at', '_deleted',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'refund_amount' => 'decimal:2',
        '_version' => 'integer',
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
    ];

    public function return(): BelongsTo
    {
        return $this->belongsTo(SaleReturn::class, 'return_id');
    }

    public function saleService(): BelongsTo
    {
        return $this->belongsTo(SaleService::class);
    }
}

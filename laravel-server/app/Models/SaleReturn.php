<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property string|null $store_id
 */
class SaleReturn extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $table = 'returns';

    protected $fillable = [
        'sale_id', 'user_id', 'reason', 'total_refunded',
        '_version', '_synced', '_synced_at', '_deleted',
    ];

    protected $casts = [
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
        'total_refunded' => 'decimal:2',
    ];

    /**
     * @return HasMany<SaleReturnItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(SaleReturnItem::class, 'return_id');
    }

    /**
     * @return BelongsTo<Sale, $this>
     */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

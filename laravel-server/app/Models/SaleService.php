<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property string $id
 * @property string $sale_id
 * @property string|null $service_id
 * @property string $service_name
 * @property int $quantity
 * @property float $unit_price
 * @property float $total_price
 * @property string|null $notes
 */
class SaleService extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id', 'store_id', 'sale_id', 'service_id', 'service_name',
        'quantity', 'unit_price', 'total_price', 'notes',
        '_version', '_synced', '_synced_at', '_deleted',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'total_price' => 'decimal:2',
        '_version' => 'integer',
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function returnServices(): HasMany
    {
        return $this->hasMany(ReturnService::class);
    }
}

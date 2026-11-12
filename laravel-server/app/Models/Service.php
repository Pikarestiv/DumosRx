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
 * @property string|null $store_id
 * @property string $name
 * @property string|null $code
 * @property string|null $description
 * @property string|null $category
 * @property float $price
 * @property bool $is_active
 */
class Service extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id', 'store_id', 'name', 'code', 'description',
        'category', 'price', 'is_active',
        '_version', '_synced', '_synced_at', '_deleted',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'is_active' => 'boolean',
        '_version' => 'integer',
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function saleServices(): HasMany
    {
        return $this->hasMany(SaleService::class);
    }
}

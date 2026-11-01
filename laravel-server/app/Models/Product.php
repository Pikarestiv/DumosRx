<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

/**
 * @property string|null $store_id
 * @property string|null $user_id
 */
class Product extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $guarded = [];

    protected $attributes = [
        'show_online' => true,
    ];

    protected $casts = [
        'requires_prescription' => 'boolean',
        'is_controlled' => 'boolean',
        'is_active' => 'boolean',
        'show_online' => 'boolean',
        'selling_price' => 'decimal:2',
        'markup_percentage' => 'decimal:2',
    ];

    /**
     * Product columns baked into the published storefront HTML (see
     * StorefrontProductResource and the storeProducts() filter).
     */
    private const STOREFRONT_PUBLISHED_FIELDS = [
        'name',
        'selling_price',
        'show_online',
        'is_active',
    ];

    /** Rationale: laravel-server/AGENTS.md, "What dirties a storefront" and "The stamp is always refreshed". */
    protected static function booted(): void
    {
        static::created(function (Product $product) {
            if ($product->show_online) {
                $product->markStorefrontDirty();
            }
        });

        static::updated(function (Product $product) {
            if ($product->wasChanged(self::STOREFRONT_PUBLISHED_FIELDS)) {
                $product->markStorefrontDirty();
            }
        });

        static::deleted(function (Product $product) {
            if ($product->show_online) {
                $product->markStorefrontDirty();
            }
        });
    }

    private function markStorefrontDirty(): void
    {
        if ($this->store_id) {
            self::markStorefrontsDirty([$this->store_id], []);
        } elseif ($this->user_id) {
            self::markStorefrontsDirty([], [$this->user_id]);
        }
    }

    /**
     * A store-less legacy row (predating the store_id backfill) belongs to whichever of its owner's stores
     * publishes it, so it dirties every publishing store of `$ownerIds`.
     *
     * @param  array<int, string>  $storeIds
     * @param  array<int, string>  $ownerIds
     */
    public static function markStorefrontsDirty(array $storeIds, array $ownerIds): void
    {
        if ($storeIds === [] && $ownerIds === []) {
            return;
        }

        DB::table('stores')
            ->where('online_store_enabled', true)
            ->where(fn ($q) => $q->whereIn('id', $storeIds)->orWhereIn('user_id', $ownerIds))
            ->update(['storefront_dirty_at' => now()]);
    }

    /**
     * @return BelongsTo<Category, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * @return HasMany<StockBatch, $this>
     */
    public function stockBatches(): HasMany
    {
        return $this->hasMany(StockBatch::class);
    }
}

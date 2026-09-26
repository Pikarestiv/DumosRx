<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

/**
 * @mixin IdeHelperProduct
 */
class Product extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $guarded = [];

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

    /**
     * Mirrors Store::boot()'s dirty-flag hook for the other half of what a
     * customer sees: prices and listings live on products, so without this a
     * price change stays frozen in the static export until something
     * unrelated triggers a rebuild. Raw DB::table() update, not a ->save(),
     * for the same reason it is over there (re-firing model events), and
     * narrowed to stores that actually publish a storefront so a bulk product
     * sync doesn't write flags for the accounts that have none. The stamp is
     * always refreshed rather than only set when currently null: the rebuild
     * confirmation callback clears flags stamped at or before the moment the
     * rebuild was dispatched, so a change that lands mid-build has to move the
     * timestamp past that cutoff or it would be cleared without ever shipping.
     */
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
        $stores = DB::table('stores')->where('online_store_enabled', true);

        if ($this->store_id) {
            $stores->where('id', $this->store_id);
        } elseif ($this->user_id) {
            // Legacy rows predating the store_id backfill belong to whichever
            // of the owner's stores publishes them, which can't be narrowed
            // further from here.
            $stores->where('user_id', $this->user_id);
        } else {
            return;
        }

        $stores->update(['storefront_dirty_at' => now()]);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }



    public function stockBatches()
    {
        return $this->hasMany(StockBatch::class);
    }
}

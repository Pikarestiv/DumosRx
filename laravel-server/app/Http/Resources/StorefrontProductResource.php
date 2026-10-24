<?php

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Explicit field whitelist for products served on the *unauthenticated*
 * public storefront route.
 *
 * `Product` is `$guarded = []` with nothing hidden, so returning the model
 * directly published every column to anyone who could guess a store slug:
 * ownership columns (`user_id`/`store_id`), the internal margin figure
 * (`markup_percentage` — the `cost_price` column it used to accompany was
 * dropped from `products` in 2026_06_28), sync bookkeeping (`_version`,
 * `_synced*`, `_deleted`), and clinical/admin fields no shopper needs.
 *
 * Only the fields `web/lib/types/storefront.ts`'s `StorefrontProduct`
 * actually consumes are exposed, plus a few purely descriptive
 * customer-facing ones. `id` is kept deliberately: the storefront cart and
 * `checkout()`'s `items.*.product_id` are keyed on it, and it is no longer
 * leverageable into a write (see `SyncController::push()`'s ownership
 * checks).
 */
class StorefrontProductResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray($request): array
    {
        $product = $this->product();

        return [
            'id' => $product->id,
            'name' => $product->name,
            'generic_name' => $product->generic_name,
            'description' => $product->description,
            'dosage_form' => $product->dosage_form,
            'strength' => $product->strength,
            'pack_size' => $product->pack_size,
            'unit_of_measure' => $product->unit_of_measure,
            'selling_price' => $product->selling_price,
            'requires_prescription' => (bool) $product->requires_prescription,
            'category' => $this->whenLoaded('category', fn () => $product->category
                ? ['id' => $product->category->id, 'name' => $product->category->name]
                : null),
        ];
    }

    private function product(): Product
    {
        return $this->resource;
    }
}

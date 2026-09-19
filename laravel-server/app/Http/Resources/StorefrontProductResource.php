<?php

namespace App\Http\Resources;

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
        return [
            'id' => $this->id,
            'name' => $this->name,
            'generic_name' => $this->generic_name,
            'description' => $this->description,
            'dosage_form' => $this->dosage_form,
            'strength' => $this->strength,
            'pack_size' => $this->pack_size,
            'unit_of_measure' => $this->unit_of_measure,
            'selling_price' => $this->selling_price,
            'requires_prescription' => (bool) $this->requires_prescription,
            'category' => $this->whenLoaded('category', fn () => $this->category
                ? ['id' => $this->category->id, 'name' => $this->category->name]
                : null),
        ];
    }
}

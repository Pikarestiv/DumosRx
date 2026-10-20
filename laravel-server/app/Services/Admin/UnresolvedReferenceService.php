<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;

/**
 * Counts child rows whose parent reference names nothing in the database —
 * the shape behind A-294 (a product's `category_id` matching no `categories`
 * row) and A-296 (a `purchase_order_items` row matching no `purchase_orders`
 * row at all, not even a soft-deleted one). Production declares zero foreign
 * keys (A-292), so nothing else catches this. Detection only, so it surfaces
 * on its own instead of needing a fresh forensic dive each time it happens —
 * see docs/KNOWN_BUGS.md A-294/A-296 for why these are not auto-repaired.
 */
class UnresolvedReferenceService
{
    /** Products in this store whose category_id names no categories row, in any state (a trashed category still resolves). */
    public function unresolvableCategoryCount(string $storeId): int
    {
        return (int) DB::table('products as p')
            ->where('p.store_id', $storeId)
            ->whereNull('p.deleted_at')
            ->whereNotNull('p.category_id')
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('categories as c')
                    ->whereColumn('c.id', 'p.category_id');
            })
            ->count();
    }

    /**
     * purchase_order_items whose purchase_order_id names no purchase_orders
     * row at all. Global, not store-scoped: an orphan this complete carries
     * no resolvable store of its own, because its only parent — the thing
     * that would have named one — does not exist.
     */
    public function orphanedPurchaseOrderItemsCount(): int
    {
        return (int) DB::table('purchase_order_items as i')
            ->whereNull('i.deleted_at')
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('purchase_orders as po')
                    ->whereColumn('po.id', 'i.purchase_order_id');
            })
            ->count();
    }
}

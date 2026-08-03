<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Store;
use Illuminate\Http\Request;

/**
 * Resolves the tenant-owning user's ID for the caller: a store owner
 * resolves to themselves, a staff member (has `store_id` set) resolves to
 * the store's owner, since tenant-scoped data (products, categories,
 * suppliers, customers, stock, sales, ...) is always stored under the
 * owner's user_id, never the staff member's own id. Matches the pattern
 * already used correctly in SaleController/StockBatchController/
 * PurchaseOrderController/SyncController.
 */
trait ScopesToTenant
{
    protected function tenantOwnerId(Request $request): ?string
    {
        $user = $request->user();

        return $user->store_id
            ? Store::where('id', $user->store_id)->value('user_id')
            : $user->id;
    }
}

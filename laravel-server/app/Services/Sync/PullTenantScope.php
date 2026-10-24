<?php

namespace App\Services\Sync;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#pulltenantscope */
class PullTenantScope
{
    public function __construct(private SyncOwnershipResolver $ownership) {}

    public function applyPullTenantScope($query, string $table, array $scope): void
    {
        $ownerId = $scope['ownerId'];
        $storeIds = $scope['storeIds'];
        $userIds = $scope['userIds'];
        $ownedStoreIds = $scope['ownedStoreIds'];

        match ($table) {
            'users' => $query->whereIn('id', $userIds),
            'stores' => $query->whereIn('id', $scope['storeRowIds'] ?? $ownedStoreIds)->with(['user.subscriptions']),
            'products' => $query->whereIn('store_id', $storeIds),
            'sales' => $query->whereIn('store_id', $storeIds),
            'customers' => $query->whereIn('store_id', $storeIds),
            'categories' => $query->whereIn('store_id', $storeIds),
            'suppliers' => $query->whereIn('store_id', $storeIds),
            'expenses' => $query->whereIn('store_id', $storeIds),
            'purchase_orders' => $query->whereIn('store_id', $storeIds),
            'prescriptions' => $query->whereIn('store_id', $storeIds),
            'returns' => $query->whereIn('store_id', $storeIds),
            'stock_movements' => $query->whereIn('store_id', $storeIds),
            'supplier_payments' => $query->whereIn('store_id', $storeIds),
            'sale_items' => $query->whereIn('sale_id', $this->tenantSaleIds($storeIds)),
            'return_items' => $query->whereIn('return_id', \App\Models\SaleReturn::withTrashed()->select('id')->whereIn('store_id', $storeIds)),
            'prescription_items' => $query->whereIn('prescription_id', \App\Models\Prescription::withTrashed()->select('id')->whereIn('store_id', $storeIds)),
            'purchase_order_items' => $query->whereIn('purchase_order_id', PurchaseOrder::withTrashed()->select('id')->whereIn('store_id', $storeIds)),
            'stock_batches' => $query->whereIn('product_id', Product::withTrashed()->select('id')->whereIn('store_id', $storeIds)),
            'sale_item_batches' => $query->whereIn(
                'sale_item_id',
                SaleItem::withTrashed()->select('id')->whereIn('sale_id', $this->tenantSaleIds($storeIds)),
            ),
            'requested_products' => $query->whereIn('store_id', $storeIds),
            'loyalty_tiers' => $query->whereIn('store_id', $storeIds),
            'loyalty_redemption_options' => $query->whereIn('store_id', $storeIds),
            'stock_audits' => $query->whereIn('store_id', $storeIds),
            'held_transactions' => $query->whereIn('store_id', $storeIds),
            'loyalty_transactions' => $query->whereIn('store_id', $storeIds),
            'customer_payments' => $query->whereIn('store_id', $storeIds),
            'audit_logs' => $query->whereIn('store_id', $storeIds),
            'permission_groups' => $query->whereIn('store_id', $storeIds),
            default => $query->where('user_id', $ownerId),
        };
    }

    private function tenantSaleIds(array $storeIds)
    {
        return Sale::withTrashed()->select('id')->whereIn('store_id', $storeIds);
    }

    public const PULL_TABLES_INDEPENDENT_OF_STORE_HEADER = ['stores', 'payment_accounts'];

    public function logRefusedPullStore(string $userId, string $refusedStoreId): void
    {
        try {
            if (\Illuminate\Support\Facades\Cache::add('sync-pull-refused:'.$userId, true, now()->addDay())) {
                Log::warning('Sync pull: X-Store-Id is outside the caller\'s scope; withholding store-scoped tables (A-254)', [
                    'user_id' => $userId,
                    'refused_store_id' => mb_substr($refusedStoreId, 0, 64),
                ]);
            }
        } catch (\Throwable) {
        }
    }

    private function isCallersOwnDeletedStore($user, ?string $ownerId, string $storeId): bool
    {
        return $ownerId === $user->id && Store::onlyTrashed()->whereKey($storeId)->where('user_id', $ownerId)->exists();
    }

    public function resolvePullTenantScope($user, Request $request): array
    {
        ['ownerId' => $ownerId, 'storeIds' => $ownedStoreIds] = $this->ownership->resolveOwnershipIdentity($user);

        $requested = $request->header('X-Store-Id') ?? $request->input('store_id');
        $requestedStoreId = match (true) {
            $requested === null || $requested === '' => null,
            is_string($requested) => $requested,
            default => '(invalid)',
        };

        $storeIds = $requestedStoreId === null
            ? $ownedStoreIds
            : (in_array($requestedStoreId, $ownedStoreIds, true) ? [$requestedStoreId] : []);
        $refusedStoreId = $requestedStoreId !== null && $storeIds === [] ? $requestedStoreId : null;

        $storeRowIds = $ownedStoreIds;
        if ($refusedStoreId !== null && $this->isCallersOwnDeletedStore($user, $ownerId, $refusedStoreId)) {
            $storeRowIds[] = $refusedStoreId;
        }

        $userIds = $refusedStoreId !== null
            ? [$ownerId]
            : User::whereIn('store_id', $storeIds)->pluck('id')->push($ownerId)->toArray();

        return [
            'ownerId' => $ownerId,
            'storeIds' => $storeIds,
            'ownedStoreIds' => $ownedStoreIds,
            'storeRowIds' => $storeRowIds,
            'userIds' => $userIds,
            'refusedStoreId' => $refusedStoreId,
        ];
    }
}

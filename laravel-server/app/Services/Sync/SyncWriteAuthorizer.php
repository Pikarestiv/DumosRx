<?php

namespace App\Services\Sync;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#syncwriteauthorizer */
class SyncWriteAuthorizer
{
    private const PARENT_KEYS = [
        'stock_batches' => 'product_id',
        'sale_items' => 'sale_id',
        'sale_services' => 'sale_id',
        'sale_item_batches' => 'sale_item_id',
        'return_items' => 'return_id',
        'return_services' => 'return_id',
        'prescription_items' => 'prescription_id',
        'purchase_order_items' => 'purchase_order_id',
    ];

    /** @var array<string, string> */
    private array $batchStoreIds = [];

    public function withoutStoreReassignment(string $tableName, array $payload, $model, ?array $allowedStoreIds): array
    {
        if ($tableName === 'users' || ! array_key_exists('store_id', $payload)) {
            return $payload;
        }

        if (empty($model->store_id) && $this->claimIsEvidence($payload['store_id'], $allowedStoreIds)) {
            return $payload;
        }

        if (! empty($model->store_id) && $payload['store_id'] !== $model->store_id) {
            Log::info('Sync push: ignored a store reassignment (A-248)', [
                'table' => $tableName,
                'record_id' => $model->getKey(),
                'store_id' => $model->store_id,
                'claimed_store_id' => $payload['store_id'],
            ]);
        }
        unset($payload['store_id']);

        return $payload;
    }

    public function claimIsEvidence($claimedStoreId, ?array $allowedStoreIds): bool
    {
        return $allowedStoreIds !== null
            && count($allowedStoreIds) === 1
            && $claimedStoreId === $allowedStoreIds[array_key_first($allowedStoreIds)];
    }

    public function isBatchOutsideScope($stockBatchId, ?array $allowedStoreIds, bool $memoize = false): bool
    {
        if ($allowedStoreIds === null) {
            return false;
        }

        $key = (string) $stockBatchId;
        $storeId = $memoize ? ($this->batchStoreIds[$key] ?? null) : null;
        if ($storeId === null) {
            $storeId = DB::table('stock_batches')
                ->join('products', 'products.id', '=', 'stock_batches.product_id')
                ->where('stock_batches.id', $key)
                ->value('products.store_id');
            if ($memoize && $storeId !== null) {
                $this->batchStoreIds[$key] = $storeId;
            }
        }

        return $storeId !== null && ! in_array($storeId, $allowedStoreIds, true);
    }

    public function namesForeignBatch(string $tableName, array $payload, array $allowedStoreIds, $model = null): bool
    {
        return $tableName === 'stock_movements'
            && ! empty($payload['stock_batch_id'])
            && $payload['stock_batch_id'] !== $model?->stock_batch_id
            && $this->isBatchOutsideScope($payload['stock_batch_id'], $allowedStoreIds, true);
    }

    /** A-325: `PRODUCT_ID` or `stock_batches.product_id` still names the column, past every guard reading `product_id`. */
    public function hasNonColumnKey(mixed $payload): bool
    {
        if (! is_array($payload)) {
            return false;
        }

        foreach (array_keys($payload) as $key) {
            if (! preg_match('/^[a-z0-9_]+$/D', (string) $key)) {
                return true;
            }
        }

        return false;
    }

    public function repointsToForeignParent(string $tableName, array $payload, $model, array $allowedStoreIds, array $allowedUserIds = []): bool
    {
        $parentKey = self::PARENT_KEYS[$tableName] ?? null;
        if ($parentKey === null || empty($payload[$parentKey]) || (string) $payload[$parentKey] === (string) $model->{$parentKey}) {
            return false;
        }

        $parentInfo = $this->resolveParentInfo($tableName, (object) [$parentKey => $payload[$parentKey]]);
        if ($parentInfo === null) {
            return false;
        }

        if ($parentInfo->store_id !== null) {
            return ! in_array($parentInfo->store_id, $allowedStoreIds, true);
        }

        return ! $this->isAuthorAllowed($parentInfo->user_id, $allowedUserIds);
    }

    public function isAuthorAllowed(?string $authorId, array $allowedUserIds): bool
    {
        if (empty($authorId)) {
            return true;
        }

        if (in_array($authorId, $allowedUserIds, true)) {
            return true;
        }

        return ! User::withTrashed()->whereKey($authorId)->exists();
    }

    public function authorizeChangeTarget(string $tableName, $model, array $allowedStoreIds, array $allowedUserIds): bool
    {
        if ($tableName === 'stores') {
            return in_array($model->id, $allowedStoreIds, true);
        }
        if ($tableName === 'users') {
            return in_array($model->id, $allowedUserIds, true);
        }

        $resolvedStoreId = $this->resolveChangeStoreId($tableName, $model);
        if ($resolvedStoreId !== null) {
            return in_array($resolvedStoreId, $allowedStoreIds, true);
        }

        if ($tableName === 'services') {
            return false;
        }

        if (! isset($model->user_id)) {
            return true;
        }

        return $this->isAuthorAllowed($model->user_id, $allowedUserIds);
    }

    public function authorizeInsertTarget(string $tableName, array $payload, array $allowedStoreIds, array $allowedUserIds = []): bool
    {
        if ($tableName === 'stores' || $tableName === 'users') {
            return true;
        }

        if ($this->namesForeignBatch($tableName, $payload, $allowedStoreIds)) {
            return false;
        }

        $parentKey = self::PARENT_KEYS[$tableName] ?? null;
        if ($parentKey !== null && ! empty($payload[$parentKey])) {
            $parentInfo = $this->resolveParentInfo($tableName, (object) $payload);
            if ($parentInfo !== null) {
                if ($parentInfo->store_id !== null) {
                    return in_array($parentInfo->store_id, $allowedStoreIds, true);
                }

                return $this->isAuthorAllowed($parentInfo->user_id, $allowedUserIds);
            }
        }

        $resolvedStoreId = $this->resolveChangeStoreId($tableName, (object) $payload);

        if ($resolvedStoreId === null) {
            return true;
        }

        return in_array($resolvedStoreId, $allowedStoreIds, true);
    }

    public function guardedRowStoreId(string $tableName, array $payload, $model = null): ?string
    {
        if ($tableName === 'stock_batches') {
            $productId = $payload['product_id'] ?? $model?->product_id;

            return isset($payload['supplier_id']) && $productId
                ? Product::withTrashed()->whereKey($productId)->value('store_id')
                : null;
        }

        return $payload['store_id'] ?? $model?->store_id;
    }

    private function resolveChangeStoreId(string $tableName, $model): ?string
    {
        return $this->resolveParentStoreId($tableName, $model) ?? ($model->store_id ?? null);
    }

    private function resolveParentStoreId(string $tableName, $model): ?string
    {
        static $directStoreTables = [
            'products', 'sales', 'customers', 'categories', 'suppliers',
            'expenses', 'purchase_orders', 'prescriptions', 'returns',
            'stock_movements', 'supplier_payments', 'requested_products',
            'payment_accounts', 'loyalty_tiers', 'loyalty_redemption_options',
            'stock_audits', 'held_transactions', 'loyalty_transactions',
            'customer_payments', 'audit_logs', 'permission_groups', 'services',
        ];

        if (in_array($tableName, $directStoreTables, true)) {
            return $model->store_id ?? null;
        }

        return $this->resolveParentInfo($tableName, $model)?->store_id;
    }

    private function resolveParentInfo(string $tableName, $model): ?object
    {
        if ($tableName === 'sale_items' || $tableName === 'sale_services') {
            $sale = isset($model->sale_id) ? Sale::withTrashed()->where('id', $model->sale_id)->first(['store_id', 'user_id', 'cashier_id']) : null;

            return $sale ? (object) ['store_id' => $sale->store_id, 'user_id' => $sale->user_id ?? $sale->cashier_id] : null;
        }
        if ($tableName === 'return_items' || $tableName === 'return_services') {
            $return = isset($model->return_id) ? \App\Models\SaleReturn::withTrashed()->where('id', $model->return_id)->first(['store_id', 'user_id']) : null;

            return $return ? (object) ['store_id' => $return->store_id, 'user_id' => $return->user_id] : null;
        }
        if ($tableName === 'prescription_items') {
            $prescription = isset($model->prescription_id) ? \App\Models\Prescription::withTrashed()->where('id', $model->prescription_id)->first(['store_id', 'user_id']) : null;

            return $prescription ? (object) ['store_id' => $prescription->store_id, 'user_id' => $prescription->user_id] : null;
        }
        if ($tableName === 'purchase_order_items') {
            $po = isset($model->purchase_order_id) ? PurchaseOrder::withTrashed()->where('id', $model->purchase_order_id)->first(['store_id', 'ordered_by']) : null;

            return $po ? (object) ['store_id' => $po->store_id, 'user_id' => $po->ordered_by] : null;
        }
        if ($tableName === 'stock_batches') {
            $product = isset($model->product_id) ? Product::withTrashed()->where('id', $model->product_id)->first(['store_id', 'user_id']) : null;

            return $product ? (object) ['store_id' => $product->store_id, 'user_id' => $product->user_id] : null;
        }
        if ($tableName === 'sale_item_batches') {
            if (! isset($model->sale_item_id)) {
                return null;
            }
            $saleId = SaleItem::withTrashed()->where('id', $model->sale_item_id)->value('sale_id');
            $sale = $saleId ? Sale::withTrashed()->where('id', $saleId)->first(['store_id', 'user_id', 'cashier_id']) : null;

            return $sale ? (object) ['store_id' => $sale->store_id, 'user_id' => $sale->user_id ?? $sale->cashier_id] : null;
        }

        return null;
    }
}

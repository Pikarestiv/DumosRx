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
        'sale_item_batches' => 'sale_item_id',
        'return_items' => 'return_id',
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

    /** Column names are case-insensitive in MySQL and SQLite, so a miscased key would slip past every guard (A-325). */
    public function hasMiscasedKey(array $payload): bool
    {
        foreach (array_keys($payload) as $key) {
            if ((string) $key !== strtolower((string) $key)) {
                return true;
            }
        }

        return false;
    }

    public function repointsToForeignParent(string $tableName, array $payload, $model, array $allowedStoreIds): bool
    {
        $parentKey = self::PARENT_KEYS[$tableName] ?? null;
        if ($parentKey === null || empty($payload[$parentKey]) || (string) $payload[$parentKey] === (string) $model->{$parentKey}) {
            return false;
        }

        $newParentStoreId = $this->resolveParentStoreId($tableName, (object) [$parentKey => $payload[$parentKey]]);

        return $newParentStoreId !== null && ! in_array($newParentStoreId, $allowedStoreIds, true);
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

        // Fails open on purpose for legacy rows (docs/SYNC_SERVER_RATIONALE.md).
        if (! isset($model->user_id)) {
            return true;
        }

        if (in_array($model->user_id, $allowedUserIds, true)) {
            return true;
        }

        return ! User::withTrashed()->whereKey($model->user_id)->exists();
    }

    public function authorizeInsertTarget(string $tableName, array $payload, array $allowedStoreIds): bool
    {
        if ($tableName === 'stores' || $tableName === 'users') {
            return true;
        }

        if ($this->namesForeignBatch($tableName, $payload, $allowedStoreIds)) {
            return false;
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
            'customer_payments', 'audit_logs', 'permission_groups',
        ];

        if (in_array($tableName, $directStoreTables, true)) {
            return $model->store_id ?? null;
        }

        if ($tableName === 'sale_items') {
            return isset($model->sale_id) ? Sale::withTrashed()->where('id', $model->sale_id)->value('store_id') : null;
        }
        if ($tableName === 'return_items') {
            return isset($model->return_id) ? \App\Models\SaleReturn::withTrashed()->where('id', $model->return_id)->value('store_id') : null;
        }
        if ($tableName === 'prescription_items') {
            return isset($model->prescription_id) ? \App\Models\Prescription::withTrashed()->where('id', $model->prescription_id)->value('store_id') : null;
        }
        if ($tableName === 'purchase_order_items') {
            return isset($model->purchase_order_id) ? PurchaseOrder::withTrashed()->where('id', $model->purchase_order_id)->value('store_id') : null;
        }
        if ($tableName === 'stock_batches') {
            return isset($model->product_id) ? Product::withTrashed()->where('id', $model->product_id)->value('store_id') : null;
        }
        if ($tableName === 'sale_item_batches') {
            if (! isset($model->sale_item_id)) {
                return null;
            }
            $saleId = SaleItem::withTrashed()->where('id', $model->sale_item_id)->value('sale_id');

            return $saleId ? Sale::withTrashed()->where('id', $saleId)->value('store_id') : null;
        }

        return null;
    }
}

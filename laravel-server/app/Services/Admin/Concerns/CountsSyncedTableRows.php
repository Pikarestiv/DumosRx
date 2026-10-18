<?php

namespace App\Services\Admin\Concerns;

use App\Models\Prescription;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleReturn;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The cloud side of a table-agreement fingerprint: the rows a device of this
 * store should be holding, counted the way `SyncController::pull()` scopes
 * them, and the sum of their `_version`.
 *
 * `DB::table()` deliberately bypasses the soft-delete global scope: the
 * device keeps a soft-deleted row with `_deleted = 1`, so excluding them
 * here would read as a divergence on every store. See
 * docs/DEVICE_TABLE_AGREEMENT.md.
 */
trait CountsSyncedTableRows
{
    /**
     * Mirrors client/lib/db/schema-migrations.ts STORE_SCOPED_TABLES, less
     * `audit_logs`, which compared two different physical tables: a physical
     * `audit_logs` exists but is unused legacy cruft, while the pull actually
     * delivers from `activity_logs` (getModelForTable maps the client's
     * `audit_logs` onto ActivityLog, which has no `$table` override). The
     * comparison therefore produced a large permanent false delta and could
     * never have detected a real activity-log divergence. See
     * docs/DEVICE_TABLE_AGREEMENT.md; the general physical-vs-model name
     * hazard is A-289.
     */
    protected const AGREEMENT_TABLES = [
        'products',
        'stock_batches',
        'categories',
        'customers',
        'suppliers',
        'sales',
        'sale_items',
        'sale_item_batches',
        'prescriptions',
        'prescription_items',
        'expenses',
        'returns',
        'return_items',
        'purchase_orders',
        'purchase_order_items',
        'stock_audits',
        'held_transactions',
        'loyalty_transactions',
        'customer_payments',
        'stock_movements',
        'requested_products',
        'supplier_payments',
        'loyalty_tiers',
        'loyalty_redemption_options',
        'permission_groups',
    ];

    /**
     * @return array{rows: int, version_sum: int}|null null when the table
     *                                                 cannot be counted at all
     */
    protected function serverTableFingerprint(string $storeId, string $table): ?array
    {
        if (! in_array($table, self::AGREEMENT_TABLES, true)) {
            return null;
        }

        try {
            $row = $this->scopeToStore(DB::table($table), $table, $storeId)
                ->selectRaw('COUNT(*) as rows_count, COALESCE(SUM(_version), 0) as version_sum')
                ->first();
        } catch (\Throwable $e) {
            return null;
        }

        return [
            'rows' => (int) ($row->rows_count ?? 0),
            'version_sum' => (int) ($row->version_sum ?? 0),
        ];
    }

    private function scopeToStore(Builder $query, string $table, string $storeId): Builder
    {
        return match ($table) {
            'stock_batches' => $query->whereIn(
                'product_id',
                Product::withTrashed()->select('id')->where('store_id', $storeId),
            ),
            'sale_items' => $query->whereIn(
                'sale_id',
                Sale::withTrashed()->select('id')->where('store_id', $storeId),
            ),
            'sale_item_batches' => $query->whereIn(
                'sale_item_id',
                SaleItem::withTrashed()->select('id')->whereIn(
                    'sale_id',
                    Sale::withTrashed()->select('id')->where('store_id', $storeId),
                ),
            ),
            'return_items' => $query->whereIn(
                'return_id',
                SaleReturn::withTrashed()->select('id')->where('store_id', $storeId),
            ),
            'prescription_items' => $query->whereIn(
                'prescription_id',
                Prescription::withTrashed()->select('id')->where('store_id', $storeId),
            ),
            'purchase_order_items' => $query->whereIn(
                'purchase_order_id',
                PurchaseOrder::withTrashed()->select('id')->where('store_id', $storeId),
            ),
            default => $query->where('store_id', $storeId),
        };
    }
}

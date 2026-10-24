<?php

namespace App\Services\Sync;

use App\Models\User;
use Illuminate\Http\Request;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#pushpayloadnormalizer */
class PushPayloadNormalizer
{
    public function __construct(
        private SyncPayloadSanitizer $sanitizer,
        private SyncOwnershipResolver $ownership,
    ) {}

    public function normalizePushPayload(Request $request, array $change, array $payload, ?string $currentStoreId, $currentUser, bool $isSuperAdmin, array $allowedStoreIds, array $allowedUserIds = [], ?string $ownerId = null): array
    {
        if ($change['table_name'] === 'users' && $currentUser && ! $isSuperAdmin) {
            $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
            $payload = $this->sanitizer->sanitizeUserSyncPayload($payload, $recordId, $currentUser, $allowedStoreIds);
        }

        if ($change['table_name'] === 'permission_groups' && $currentUser) {
            $payload = LegacyStockQuantitiesGrant::apply($payload, $change['record_id'] ?? ($payload['id'] ?? null), $change['operation'], $request->header('X-App-Version'), $currentUser);
        }

        if ($change['table_name'] === 'permission_groups' && $currentUser && ! $isSuperAdmin) {
            $pgRecordId = $change['record_id'] ?? ($payload['id'] ?? null);
            $payload = $this->sanitizer->sanitizePermissionGroupSyncPayload($payload, $pgRecordId, $change['operation'], $currentUser, $allowedStoreIds);
        }

        if ($change['table_name'] === 'stores') {
            foreach (self::STORE_SYNC_FORBIDDEN_FIELDS as $field) {
                unset($payload[$field]);
            }
        }

        if ($change['table_name'] === 'users' && $currentStoreId && $change['operation'] === 'INSERT') {
            if (($payload['role'] ?? null) !== 'store_owner' && ($payload['role'] ?? null) !== 'admin') {
                $payload['store_id'] = $payload['store_id'] ?? $currentStoreId;
            }
        }

        if ($change['table_name'] === 'sales' && isset($payload['user_id'])) {
            $payload['cashier_id'] = $payload['user_id'];
            unset($payload['user_id']);
        }

        if ($change['table_name'] === 'purchase_orders') {
            if (isset($payload['vendor_id'])) {
                $payload['supplier_id'] = $payload['vendor_id'];
                unset($payload['vendor_id']);
            }
            if (! isset($payload['ordered_by']) && isset($payload['user_id'])) {
                $payload['ordered_by'] = $payload['user_id'];
                unset($payload['user_id']);
            }
        }

        if ($change['table_name'] === 'purchase_order_items') {
            if (isset($payload['po_id'])) {
                $payload['purchase_order_id'] = $payload['po_id'];
                unset($payload['po_id']);
            }
            if (isset($payload['subtotal'])) {
                $payload['total_cost'] = $payload['subtotal'];
                unset($payload['subtotal']);
            }
            if (isset($payload['bulk_quantity']) && isset($payload['units_per_bulk'])) {
                if (isset($payload['quantity_received'])) {
                    $payload['quantity_received'] = intval($payload['quantity_received']) * intval($payload['units_per_bulk']);
                }
                $payload['quantity_ordered'] = intval($payload['bulk_quantity']) * intval($payload['units_per_bulk']);
                unset($payload['bulk_quantity']);
                unset($payload['units_per_bulk']);
            }
        }

        if ($change['table_name'] === 'users') {
            if (isset($payload['name']) && ! isset($payload['first_name'])) {
                $parts = explode(' ', $payload['name'], 2);
                $payload['first_name'] = $parts[0];
                $payload['last_name'] = $parts[1] ?? '';
            }
            unset($payload['name']);
        }

        if ($change['table_name'] === 'feedback' && $currentUser && ! $isSuperAdmin) {
            if (empty($payload['user_id']) || ! in_array($payload['user_id'], $allowedUserIds, true)) {
                $payload['user_id'] = $currentUser->id;
            }
        }

        $tablesWithUserId = [
            'sales', 'customers', 'products', 'stock_batches',
            'subscriptions', 'payment_transactions', 'categories',
            'suppliers', 'prescriptions', 'stores',
            'loyalty_tiers', 'loyalty_redemption_options',
        ];
        if (in_array($change['table_name'], $tablesWithUserId)) {
            if (! isset($payload['user_id']) || empty($payload['user_id'])) {
                if ($currentUser) {
                    $payload['user_id'] = $currentUser->id;
                }
            }

            if ($change['table_name'] === 'stores') {
                if (empty($payload['device_id'])) {
                    $payload['device_id'] = $request->header('X-Device-Id') ?? ('web-client-'.$change['record_id']);
                }
            }
        }

        if (in_array($change['table_name'], self::STORE_ID_BACKFILL_TABLES, true)) {
            if (empty($payload['store_id'])) {
                if ($change['operation'] === 'INSERT') {
                    if ($currentStoreId && ! ($change['table_name'] === 'products' && ($isSuperAdmin || count($allowedStoreIds) > 1))) {
                        $payload['store_id'] = $currentStoreId;
                    }
                } else {
                    unset($payload['store_id']);
                }
            } elseif ($currentUser && ! $isSuperAdmin && ! in_array($payload['store_id'], $allowedStoreIds, true)) {
                if ($this->ownership->storeBelongsToTenantOwner($payload['store_id'], $ownerId)) {
                    throw new \App\Exceptions\SyncPushForbiddenException('Sync push: store_id in payload belongs to another store of this tenant, outside the current session\'s scope');
                }
                throw new \App\Exceptions\SyncPushPermissionDeniedException('Sync push: store_id in payload is outside the caller\'s allowed stores');
            }
        }

        if ($change['table_name'] === 'stock_movements' && empty($payload['performed_by']) && $currentUser) {
            $payload['performed_by'] = $currentUser->id;
        }

        if ($change['table_name'] === 'products') {
            if (empty($payload['pack_size'])) {
                $payload['pack_size'] = 1;
            }
            if (empty($payload['unit_of_measure'])) {
                $payload['unit_of_measure'] = 'piece';
            }
        }

        if ($change['table_name'] === 'suppliers') {
            if (empty($payload['payment_terms']) || $payload['payment_terms'] === 'null') {
                $payload['payment_terms'] = 30;
            }
        }

        if ($change['table_name'] === 'audit_logs') {
            if (
                empty($payload['user_id']) ||
                ! User::withTrashed()->where('id', $payload['user_id'])->exists()
            ) {
                $payload['user_id'] = $currentUser->id ?? null;
            }
            $payload['description'] = 'Action: '.($payload['action'] ?? 'Unknown').' on '.($payload['table_name'] ?? 'unknown');
            $payload['properties'] = [
                'client_id' => $payload['id'] ?? null,
                'table_name' => $payload['table_name'] ?? null,
                'record_id' => $payload['record_id'] ?? null,
                'details' => $payload['details'] ?? null,
            ];
            $payload['ip_address'] = $request->ip();
            $payload['user_agent'] = $request->userAgent();
            unset($payload['table_name']);
            unset($payload['record_id']);
            unset($payload['details']);
            unset($payload['id']);
        }

        return $payload;
    }

    private const STORE_SYNC_FORBIDDEN_FIELDS = [
        'paystack_subaccount_code', 'paystack_subaccount_country',
        'paystack_bank_code', 'paystack_account_number_last4',
        'paystack_fee_dirty_at',
        'status', 'suspension_reason', 'is_demo',
        'loyalty_defaults_seeded_at', 'permission_groups_seeded_at',
        'last_sync_run_id', 'last_sync_run_started_at',
    ];

    public const STORE_ID_BACKFILL_TABLES = [
        'requested_products', 'payment_accounts',
        'products', 'sales', 'customers', 'categories', 'suppliers',
        'expenses', 'purchase_orders', 'prescriptions', 'returns',
        'stock_movements', 'supplier_payments', 'audit_logs',
        'permission_groups', 'loyalty_tiers', 'loyalty_redemption_options',
        'stock_audits', 'held_transactions', 'loyalty_transactions',
        'customer_payments',
    ];
}

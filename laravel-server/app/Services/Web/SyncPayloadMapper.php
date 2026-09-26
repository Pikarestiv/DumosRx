<?php

namespace App\Services\Web;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SyncPayloadMapper
{
    /** Mirrors the client's own upload-time check (handleLogoUpload in
     * hooks/use-settings.ts) - logos are stored inline as a base64 data URI
     * (stores.logo_url is LONGTEXT, not a file upload), so nothing else
     * bounds their size. This is a backstop against a bypassed/buggy client
     * pushing an unbounded blob, not the primary control. */
    private const MAX_LOGO_BYTES = 1024 * 1024;
    /**
     * Maps and cleans incoming payload data from the client to match the server schema.
     */
    public static function map(string $tableName, array $payload, array $context = []): array
    {
        // 1. Sales
        if ($tableName === 'sales') {
            if (isset($payload['payment_method']) && $payload['payment_method'] === 'mixed') {
                $payload['payment_method'] = 'split';
            }
        }

        // 2. Purchase Orders
        if ($tableName === 'purchase_orders') {
            if (empty($payload['order_number'])) {
                $payload['order_number'] = 'PO-' . substr(time(), -6) . '-' . rand(100, 999);
            }
            if (empty($payload['ordered_by'])) {
                // If a fallback is needed; ideally the client provides it, but if not, use the authenticated user
                $payload['ordered_by'] = $context['user_id'] ?? null;
            }
            if (empty($payload['order_date'])) {
                $payload['order_date'] = isset($payload['created_at']) 
                    ? explode('T', $payload['created_at'])[0] 
                    : date('Y-m-d');
            }
            if (isset($payload['status'])) {
                if ($payload['status'] === 'completed') {
                    $payload['status'] = 'received';
                } elseif ($payload['status'] === 'draft') {
                    $payload['status'] = 'pending';
                }
            }
        }

        // 3. Purchase Order Items
        if ($tableName === 'purchase_order_items') {
            if (empty($payload['quantity_ordered']) && !empty($payload['bulk_quantity'])) {
                $payload['quantity_ordered'] = $payload['bulk_quantity'] * ($payload['units_per_bulk'] ?? 1);
            }
            // quantity_received's own base-unit scaling happens once, in
            // SyncController::normalizePushPayload()'s bulk_quantity/units_per_bulk
            // branch (which runs after this mapper and unsets both source
            // fields) — scaling it here too would double-apply units_per_bulk
            // when both are present in the same payload.
            if (empty($payload['total_cost']) && !empty($payload['subtotal'])) {
                $payload['total_cost'] = $payload['subtotal'];
            }
            if (empty($payload['purchase_order_id']) && !empty($payload['po_id'])) {
                $payload['purchase_order_id'] = $payload['po_id'];
            }
            if (empty($payload['status'])) {
                $payload['status'] = 'pending';
            }
        }

        // 4. Stores
        if ($tableName === 'stores' && isset($payload['logo_url']) && strlen((string) $payload['logo_url']) > self::MAX_LOGO_BYTES) {
            Log::warning('Sync push: dropped oversized stores.logo_url', [
                'store_id' => $payload['id'] ?? null,
                'bytes' => strlen((string) $payload['logo_url']),
            ]);
            unset($payload['logo_url']);
        }

        return $payload;
    }
}

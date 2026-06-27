<?php

namespace App\Services\Web;

use Illuminate\Support\Str;

class SyncPayloadMapper
{
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

        return $payload;
    }
}

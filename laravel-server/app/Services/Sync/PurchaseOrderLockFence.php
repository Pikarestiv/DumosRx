<?php

namespace App\Services\Sync;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;

/** Design notes: laravel-server/AGENTS.md, "Purchase-order draft lock". */
class PurchaseOrderLockFence
{
    public const FRESH_MINUTES = 10;

    public function refuses(string $operation, array $payload, ?string $recordId, ?string $deviceId): bool
    {
        if ($operation === 'DELETE') {
            return false;
        }
        if ($operation === 'UPDATE' && array_key_exists('quantity_received', $payload)) {
            return false;
        }

        $parentId = $payload['purchase_order_id']
            ?? ($recordId ? PurchaseOrderItem::withTrashed()->where('id', $recordId)->value('purchase_order_id') : null);
        if (! $parentId) {
            return false;
        }

        $parent = PurchaseOrder::withTrashed()->select(['editing_device_id', 'updated_at'])->find($parentId);
        if (! $parent || $parent->editing_device_id === null || $parent->editing_device_id === $deviceId) {
            return false;
        }

        return $parent->updated_at !== null && $parent->updated_at->gt(now()->subMinutes(self::FRESH_MINUTES));
    }
}

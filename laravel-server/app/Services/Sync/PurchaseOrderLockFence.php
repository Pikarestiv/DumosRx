<?php

namespace App\Services\Sync;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

/** Design notes: laravel-server/AGENTS.md, "Purchase-order draft lock". */
class PurchaseOrderLockFence
{
    public const FRESH_MINUTES = 10;

    public const LOCK_COLUMNS = ['editing_device_id', 'editing_device_label', 'editing_user_id', 'editing_at'];

    private static ?bool $lockColumnsExist = null;

    public static function forgetSchema(): void
    {
        self::$lockColumnsExist = null;
    }

    public function lockColumnsExist(): bool
    {
        return self::$lockColumnsExist ??= Schema::hasColumn('purchase_orders', 'editing_device_id');
    }

    public function prepareOrderPayload(array $payload): array
    {
        if (! $this->lockColumnsExist()) {
            return array_diff_key($payload, array_flip(self::LOCK_COLUMNS));
        }
        if (! empty($payload['editing_at'])) {
            $payload['editing_at'] = $this->clampToServerClock((string) $payload['editing_at']);
        }

        return $payload;
    }

    public function refuses(string $operation, array $payload, ?string $recordId, ?string $deviceId): bool
    {
        if ($operation === 'DELETE' || ! $this->lockColumnsExist()) {
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

        $parent = PurchaseOrder::withTrashed()->select(['editing_device_id', 'editing_at', 'updated_at'])->find($parentId);
        if (! $parent || $parent->editing_device_id === null || $parent->editing_device_id === $deviceId) {
            return false;
        }

        $stampedAt = $this->parse($parent->editing_at) ?? $parent->updated_at;

        return $stampedAt !== null && $stampedAt->gt(now()->subMinutes(self::FRESH_MINUTES));
    }

    private function clampToServerClock(string $value): string
    {
        $stamped = $this->parse($value);
        if ($stamped === null || $stamped->lte(now())) {
            return $value;
        }

        return now()->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    private function parse(?string $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}

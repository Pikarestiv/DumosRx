<?php

namespace App\Services\Audit;

use App\Models\AuditSession;
use App\Models\AuditSessionItem;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AuditSessionItemWriter
{
    private const ITEM_UPSERT_CHUNK = 200;

    private ?bool $baselineColumn = null;

    public function insertStartingItems(AuditSession $session, array $items, Carbon $now): void
    {
        $itemRecords = [];
        foreach ($items as $item) {
            $itemRecords[] = [
                'id' => (string) Str::uuid(),
                'audit_session_id' => $session->id,
                'product_id' => $item['product_id'],
                'system_quantity' => $item['system_quantity'] ?? 0,
                ...($this->hasBaselineColumn() ? ['baseline_quantity' => $item['baseline_quantity'] ?? null] : []),
                'counted_quantity' => $item['counted_quantity'] ?? null,
                'cost_price' => $item['cost_price'] ?? null,
                'counted_cost_price' => $item['counted_cost_price'] ?? null,
                'selling_price' => $item['selling_price'] ?? null,
                'counted_selling_price' => $item['counted_selling_price'] ?? null,
                'counted' => (bool) ($item['counted'] ?? false),
                'notes' => $item['notes'] ?? null,
                'counted_at' => isset($item['counted_at']) ? Carbon::parse($item['counted_at']) : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($itemRecords, self::ITEM_UPSERT_CHUNK) as $chunk) {
            AuditSessionItem::insert($chunk);
        }
    }

    public function upsertSyncedItems(AuditSession $session, array $items, Carbon $now): void
    {
        $withBaseline = [];
        $withoutBaseline = [];
        foreach (collect($items)->keyBy('product_id')->sortKeys(SORT_STRING) as $item) {
            $row = [
                'id' => (string) Str::uuid(),
                'audit_session_id' => $session->id,
                'product_id' => $item['product_id'],
                'system_quantity' => $item['system_quantity'] ?? 0,
                'counted_quantity' => $item['counted_quantity'] ?? null,
                'cost_price' => $item['cost_price'] ?? null,
                'counted_cost_price' => $item['counted_cost_price'] ?? null,
                'selling_price' => $item['selling_price'] ?? null,
                'counted_selling_price' => $item['counted_selling_price'] ?? null,
                'counted' => (bool) ($item['counted'] ?? false),
                'notes' => $item['notes'] ?? null,
                'counted_at' => isset($item['counted_at']) ? Carbon::parse($item['counted_at'])->utc()->toDateTimeString() : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (isset($item['baseline_quantity']) && $this->hasBaselineColumn()) {
                $withBaseline[] = $row + ['baseline_quantity' => $item['baseline_quantity']];
            } else {
                $withoutBaseline[] = $row;
            }
        }

        $columns = ['system_quantity', 'counted_quantity', 'cost_price', 'counted_cost_price', 'selling_price', 'counted_selling_price', 'counted', 'notes', 'counted_at', 'updated_at'];
        foreach (array_chunk($withBaseline, self::ITEM_UPSERT_CHUNK) as $chunk) {
            AuditSessionItem::upsert($chunk, ['audit_session_id', 'product_id'], [...$columns, 'baseline_quantity']);
        }
        foreach (array_chunk($withoutBaseline, self::ITEM_UPSERT_CHUNK) as $chunk) {
            AuditSessionItem::upsert($chunk, ['audit_session_id', 'product_id'], $columns);
        }
    }

    private function hasBaselineColumn(): bool
    {
        return $this->baselineColumn ??= Schema::hasColumn('audit_session_items', 'baseline_quantity');
    }
}

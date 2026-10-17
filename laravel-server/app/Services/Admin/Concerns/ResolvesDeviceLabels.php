<?php

namespace App\Services\Admin\Concerns;

use App\Models\UserDevice;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

trait ResolvesDeviceLabels
{
    /**
     * @param  string[]  $deviceIds
     * @return array<string, string>
     */
    protected function deviceLabels(string $storeId, array $deviceIds): array
    {
        $ids = $this->uniqueDeviceIds($deviceIds);

        if ($ids === []) {
            return [];
        }

        return $this->deviceNicknames($storeId, $ids) + $this->sniffedLabels($ids);
    }

    /**
     * The operator-set names alone, for a screen that must tell a nickname
     * apart from the client's own sniffed label.
     *
     * @param  string[]  $deviceIds
     * @return array<string, string>
     */
    protected function deviceNicknames(string $storeId, array $deviceIds): array
    {
        $ids = $this->uniqueDeviceIds($deviceIds);
        $resolved = [];

        foreach ($this->nicknames($ids, [$storeId]) as $key => $nickname) {
            $resolved[explode('|', $key, 2)[1]] = $nickname;
        }

        return $resolved;
    }

    /**
     * Keyed `storeId|deviceId`, because one browser signed into two stores
     * carries the same device id in both and a nickname belongs to one of
     * them. Read it with `storeRowLabel()`.
     *
     * @param  iterable<object>  $stores  rows carrying `id` and `device_id`
     * @return array<string, string>
     */
    protected function deviceLabelsForStores(iterable $stores): array
    {
        $page = collect($stores);
        $storeIds = $page->pluck('id')->filter()->unique()->values()->all();
        $ids = $this->uniqueDeviceIds($page->pluck('device_id')->all());

        if ($storeIds === [] || $ids === []) {
            return [];
        }

        $labels = $this->sniffedLabels($ids);
        $nicknames = $this->nicknames($ids, $storeIds);
        $resolved = [];

        foreach ($page as $store) {
            if (empty($store->id) || empty($store->device_id)) {
                continue;
            }

            $key = $store->id.'|'.$store->device_id;
            $label = $nicknames[$key] ?? $labels[$store->device_id] ?? null;

            if ($label !== null) {
                $resolved[$key] = $label;
            }
        }

        return $resolved;
    }

    /** @param array<string, string> $labels */
    protected function storeRowLabel(array $labels, object $store): ?string
    {
        return $labels[$store->id.'|'.$store->device_id] ?? null;
    }

    protected function deviceLabel(?string $storeId, ?string $deviceId): ?string
    {
        return $storeId === null || $deviceId === null
            ? null
            : ($this->deviceLabels($storeId, [$deviceId])[$deviceId] ?? null);
    }

    /**
     * @param  string[]  $deviceIds
     * @return array<string, string>
     */
    private function sniffedLabels(array $deviceIds): array
    {
        return UserDevice::whereIn('device_id', $deviceIds)
            ->whereNotNull('device_label')
            ->orderBy('updated_at')
            ->pluck('device_label', 'device_id')
            ->all();
    }

    /**
     * @param  string[]  $deviceIds
     * @param  string[]  $storeIds
     * @return array<string, string> keyed `storeId|deviceId`
     */
    private function nicknames(array $deviceIds, array $storeIds): array
    {
        try {
            $rows = DB::table('device_nicknames')
                ->whereIn('device_id', $deviceIds)
                ->whereIn('store_id', $storeIds)
                ->get(['store_id', 'device_id', 'nickname']);
        } catch (QueryException $e) {
            // Retirable once every environment has run the 2026-10-14
            // migration: a nickname must never 500 a screen.
            report($e);

            return [];
        }

        return $rows
            ->filter(fn ($row) => filled($row->nickname))
            ->mapWithKeys(fn ($row) => [$row->store_id.'|'.$row->device_id => $row->nickname])
            ->all();
    }

    /**
     * @param  string[]  $deviceIds
     * @return string[]
     */
    private function uniqueDeviceIds(array $deviceIds): array
    {
        return array_values(array_unique(array_filter($deviceIds)));
    }
}

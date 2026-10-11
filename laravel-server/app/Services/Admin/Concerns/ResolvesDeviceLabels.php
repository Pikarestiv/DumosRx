<?php

namespace App\Services\Admin\Concerns;

use App\Models\UserDevice;

trait ResolvesDeviceLabels
{
    /**
     * @param  string[]  $deviceIds
     * @return array<string, string>
     */
    protected function deviceLabels(string $storeId, array $deviceIds): array
    {
        return $this->labelQuery($deviceIds)
            ?->where('store_id', $storeId)
            ->pluck('device_label', 'device_id')
            ->all() ?? [];
    }

    /**
     * @param  iterable<object>  $stores  rows carrying `id` and `device_id`
     * @return array<string, string>
     */
    protected function deviceLabelsForStores(iterable $stores): array
    {
        $page = collect($stores);
        $storeIds = $page->pluck('id')->filter()->unique()->values();

        if ($storeIds->isEmpty()) {
            return [];
        }

        return $this->labelQuery($page->pluck('device_id')->all())
            ?->whereIn('store_id', $storeIds->all())
            ->pluck('device_label', 'device_id')
            ->all() ?? [];
    }

    protected function deviceLabel(?string $storeId, ?string $deviceId): ?string
    {
        return $storeId === null || $deviceId === null
            ? null
            : ($this->deviceLabels($storeId, [$deviceId])[$deviceId] ?? null);
    }

    /** @param string[] $deviceIds */
    private function labelQuery(array $deviceIds): ?\Illuminate\Database\Eloquent\Builder
    {
        $ids = array_values(array_unique(array_filter($deviceIds)));

        return $ids === []
            ? null
            : UserDevice::whereIn('device_id', $ids)
                ->whereNotNull('device_label')
                ->orderBy('updated_at');
    }
}

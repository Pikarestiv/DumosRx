<?php

namespace App\Services\Admin;

use App\Models\DeviceTableReport;
use App\Services\Admin\Concerns\CountsSyncedTableRows;
use App\Services\Admin\Concerns\ResolvesDeviceLabels;

/**
 * Whether one device and the cloud hold the same rows, per synced table.
 * The sibling of StockDivergenceService, which only ever compared stock.
 *
 * The digest is two integers per table — row count and the sum of
 * `_version` — chosen because they are the only aggregates that compute
 * identically on the device's SQLite and the server's MySQL without a hash
 * function neither engine shares. What that can and cannot detect is
 * written down in docs/DEVICE_TABLE_AGREEMENT.md; read it before trusting
 * an "agrees".
 */
class TableAgreementService
{
    use CountsSyncedTableRows;
    use ResolvesDeviceLabels;

    /**
     * Past this age a snapshot describes a device that has stopped
     * reporting, not one that disagrees — the same rule and window as
     * StockDivergenceService. See laravel-server/AGENTS.md, "Absence of a
     * measurement is not a disagreement".
     */
    private const STALE_AFTER_HOURS = 48;

    /**
     * Freezes both sides of the comparison at report time. A stored row is
     * never recompared on read: a snapshot that changed meaning later is
     * how two devices measured days apart came to look comparable (A-274).
     *
     * @param  array{tables?: array<int, array<string, mixed>>}  $report
     */
    public function record(string $storeId, string $deviceId, ?string $userId, array $report): DeviceTableReport
    {
        $rows = [];

        foreach ((array) ($report['tables'] ?? []) as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $table = (string) ($entry['t'] ?? '');
            $server = $this->serverTableFingerprint($storeId, $table);

            if ($server === null) {
                continue;
            }

            $rows[] = [
                'table' => $table,
                'device_rows' => max(0, (int) ($entry['r'] ?? 0)),
                'device_version_sum' => max(0, (int) ($entry['v'] ?? 0)),
                'device_pending' => max(0, (int) ($entry['p'] ?? 0)),
                'server_rows' => $server['rows'],
                'server_version_sum' => $server['version_sum'],
            ];
        }

        $compared = $this->compare($rows);

        return DeviceTableReport::updateOrCreate(
            ['store_id' => $storeId, 'device_id' => $deviceId],
            [
                'user_id' => $userId,
                'diverged_count' => count(array_filter(
                    $compared,
                    fn (array $row) => $row['verdict'] === 'diverged',
                )),
                'tables' => $rows,
                'reported_at' => now(),
            ],
        );
    }

    /** Drops one device's snapshot; it returns when that device next reports. */
    public function forget(string $storeId, string $deviceId): int
    {
        return DeviceTableReport::where('store_id', $storeId)
            ->where('device_id', $deviceId)
            ->delete();
    }

    public function forStore(string $storeId): array
    {
        $reports = DeviceTableReport::where('store_id', $storeId)
            ->orderByDesc('diverged_count')
            ->limit(50)
            ->get();

        $deviceIds = $reports->pluck('device_id')->all();
        $labels = $this->deviceLabels($storeId, $deviceIds);
        $nicknames = $this->deviceNicknames($storeId, $deviceIds);

        $devices = $reports->map(function (DeviceTableReport $report) use ($labels, $nicknames) {
            $tables = $this->compare((array) ($report->tables ?? []));
            $stale = $report->reported_at === null
                || $report->reported_at->lt(now()->subHours(self::STALE_AFTER_HOURS));

            // A device that holds nothing of this store has not disagreed
            // with it; it has never pulled it. Same rule as the stock panel.
            $hasLocalCopy = $this->holdsACopy($tables);
            $diverged = array_values(array_map(
                fn (array $row) => $row['table'],
                array_filter($tables, fn (array $row) => $row['verdict'] === 'diverged'),
            ));

            return [
                'device_id' => $report->device_id,
                'device_label' => $labels[$report->device_id] ?? null,
                'device_nickname' => $nicknames[$report->device_id] ?? null,
                'tables' => $tables,
                'diverged_tables' => $hasLocalCopy && ! $stale ? $diverged : [],
                'has_local_copy' => $hasLocalCopy,
                'stale' => $stale,
                'diverged' => $hasLocalCopy && ! $stale && $diverged !== [],
                'reported_at' => $report->reported_at?->toIso8601String(),
            ];
        })->values()->all();

        return [
            // A store nobody has reported for has not been measured; saying
            // "every table agrees" would be a claim nobody has earned.
            'measured' => $devices !== [],
            'diverged_devices' => count(array_filter($devices, fn (array $d) => $d['diverged'])),
            'devices' => $devices,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function compare(array $rows): array
    {
        $compared = [];

        foreach ($rows as $row) {
            if (! is_array($row) || ! isset($row['table'])) {
                continue;
            }

            $rowDelta = (int) $row['device_rows'] - (int) $row['server_rows'];
            $versionDelta = (int) $row['device_version_sum'] - (int) $row['server_version_sum'];
            $pending = (int) ($row['device_pending'] ?? 0);

            $compared[] = $row + [
                'row_delta' => $rowDelta,
                'version_delta' => $versionDelta,
                'verdict' => $this->verdict($rowDelta, $versionDelta, $pending),
            ];
        }

        return $compared;
    }

    /**
     * A device with unpushed edits for a table is ahead of the cloud by
     * design, not in disagreement with it. Without this the panel is noisy
     * on every till that is mid-sync, which is most of them, and a noisy
     * instrument gets ignored.
     */
    private function verdict(int $rowDelta, int $versionDelta, int $pending): string
    {
        if ($rowDelta === 0 && $versionDelta === 0) {
            return 'agrees';
        }

        return $pending > 0 && abs($rowDelta) <= $pending && $versionDelta >= 0
            ? 'syncing'
            : 'diverged';
    }

    /** @param array<int, array<string, mixed>> $tables */
    private function holdsACopy(array $tables): bool
    {
        $deviceRows = array_sum(array_map(fn (array $row) => (int) $row['device_rows'], $tables));
        $serverRows = array_sum(array_map(fn (array $row) => (int) $row['server_rows'], $tables));

        return $deviceRows > 0 || $serverRows === 0;
    }
}

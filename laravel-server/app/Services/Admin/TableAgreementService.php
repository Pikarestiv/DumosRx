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

    public function __construct(private UnresolvedReferenceService $unresolvedReferences) {}

    /**
     * Past this age a snapshot describes a device that has stopped
     * reporting, not one that disagrees — the same rule and window as
     * StockDivergenceService. See laravel-server/AGENTS.md, "Absence of a
     * measurement is not a disagreement".
     */
    private const STALE_AFTER_HOURS = 48;

    private const AGREES = 'agrees';

    private const SYNCING = 'syncing';

    private const BEHIND = 'behind';

    private const DIVERGED = 'diverged';

    /**
     * Freezes both sides of the comparison at report time. A stored row is
     * never recompared on read: a snapshot that changed meaning later is
     * how two devices measured days apart came to look comparable (A-274).
     *
     * @param  array<mixed>  $report  as the device sent it, unvalidated
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

        $compared = $this->promote(
            $this->compare($rows),
            $this->previousReadings($storeId, $deviceId),
        );

        return DeviceTableReport::updateOrCreate(
            ['store_id' => $storeId, 'device_id' => $deviceId],
            [
                'user_id' => $userId,
                'diverged_count' => count(array_filter(
                    $compared,
                    fn (array $row) => $row['verdict'] === self::DIVERGED,
                )),
                'tables' => $compared,
                'reported_at' => now(),
            ],
        );
    }

    /**
     * This device's own last reading per table. One reading cannot tell a
     * device that is merely behind from one that has lost a row, because the
     * snapshot is frozen before this push's own edits are accepted and before
     * this round's pull.
     *
     * @return array<string, array<string, mixed>>
     */
    private function previousReadings(string $storeId, string $deviceId): array
    {
        $previous = DeviceTableReport::where('store_id', $storeId)
            ->where('device_id', $deviceId)
            ->first();

        $readings = [];

        foreach ((array) ($previous->tables ?? []) as $row) {
            if (is_array($row) && isset($row['table'], $row['verdict'])) {
                $readings[(string) $row['table']] = $row;
            }
        }

        return $readings;
    }

    /**
     * A `behind` table becomes `diverged` only when this device is stuck, not
     * merely trailing a till that keeps writing. Every report is taken at the
     * top of a push, before that round's pull, so a till that syncs every 15
     * minutes beside a busy one reads behind on every reading. It is stuck
     * only if it still holds less than the cloud already held at its last
     * reading AND gained nothing since: a device that is pulling keeps
     * gaining, and one that has lost a row stops gaining once the cloud is
     * quiet. See docs/DEVICE_TABLE_AGREEMENT.md, "Lagging versus stuck".
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<string, array<string, mixed>>  $previous
     * @return array<int, array<string, mixed>>
     */
    private function promote(array $rows, array $previous): array
    {
        return array_map(function (array $row) use ($previous) {
            $before = $previous[$row['table']] ?? null;

            if ($row['verdict'] === self::BEHIND && $before !== null && $this->wasUnsettled($before) && $this->isStuck($row, $before)) {
                $row['verdict'] = self::DIVERGED;
            }

            return $row;
        }, $rows);
    }

    /** @param array<string, mixed> $before */
    private function wasUnsettled(array $before): bool
    {
        return in_array($before['verdict'] ?? null, [self::BEHIND, self::DIVERGED], true);
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<string, mixed>  $before
     */
    private function isStuck(array $row, array $before): bool
    {
        if (! isset($before['device_rows'], $before['device_version_sum'], $before['server_rows'], $before['server_version_sum'])) {
            return true;
        }

        $stillShortOfEarlierCloud = (int) $row['device_rows'] < (int) $before['server_rows']
            || (int) $row['device_version_sum'] < (int) $before['server_version_sum'];

        $gainedNothing = (int) $row['device_rows'] <= (int) $before['device_rows']
            && (int) $row['device_version_sum'] <= (int) $before['device_version_sum'];

        return $stillShortOfEarlierCloud && $gainedNothing;
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
        $appVersions = $this->deviceAppVersions($deviceIds);
        $buildShas = $this->deviceBuildShas($deviceIds);

        $devices = $reports->map(function (DeviceTableReport $report) use ($labels, $nicknames, $appVersions, $buildShas) {
            $tables = $this->storedVerdicts((array) ($report->tables ?? []));
            $stale = $report->reported_at->lt(now()->subHours(self::STALE_AFTER_HOURS));

            // A device that holds nothing of this store has not disagreed
            // with it; it has never pulled it. Same rule as the stock panel.
            $hasLocalCopy = $this->holdsACopy($tables);
            $diverged = array_values(array_map(
                fn (array $row) => $row['table'],
                array_filter($tables, fn (array $row) => $row['verdict'] === self::DIVERGED),
            ));

            return [
                'device_id' => $report->device_id,
                'device_label' => $labels[$report->device_id] ?? null,
                'device_nickname' => $nicknames[$report->device_id] ?? null,
                'app_version' => $appVersions[$report->device_id] ?? null,
                'build_sha' => $buildShas[$report->device_id] ?? null,
                'tables' => $tables,
                'diverged_tables' => $hasLocalCopy && ! $stale ? $diverged : [],
                'has_local_copy' => $hasLocalCopy,
                'stale' => $stale,
                'diverged' => $hasLocalCopy && ! $stale && $diverged !== [],
                'reported_at' => $report->reported_at->toIso8601String(),
            ];
        })->values()->all();

        return [
            // A store nobody has reported for has not been measured; saying
            // "every table agrees" would be a claim nobody has earned.
            'measured' => $devices !== [],
            'diverged_devices' => count(array_filter($devices, fn (array $d) => $d['diverged'])),
            'devices' => $devices,
            // A-294: products whose category_id this store can never resolve, so some of a
            // "diverges"/"behind" verdict on products or categories may be this, not a real gap.
            'unresolvable_category_products' => $this->unresolvedReferences->unresolvableCategoryCount($storeId),
        ];
    }

    /**
     * The verdict is part of the frozen snapshot, not recomputed on read: it
     * depends on the previous reading, so recomputing it would quietly undo
     * the promotion rule. A row stored before the verdict was persisted is
     * compared on the fly so an already-recorded report still renders.
     *
     * @param  array<mixed>  $rows
     * @return array<int, array<string, mixed>>
     */
    private function storedVerdicts(array $rows): array
    {
        $hasVerdicts = array_filter(
            $rows,
            fn ($row) => is_array($row) && isset($row['verdict']),
        );

        return count($hasVerdicts) === count($rows) && $rows !== []
            ? array_values($hasVerdicts)
            : $this->compare($rows);
    }

    /**
     * @param  array<mixed>  $rows
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
     * A device mid-sync is not a device in disagreement, and the two ways it
     * can be mid-sync are different. Both are explained, with the arithmetic,
     * in docs/DEVICE_TABLE_AGREEMENT.md.
     *
     * `syncing` — the drift fits inside this table's queued-edit count, which
     * is an exact bound because the server assigns exactly one version per
     * accepted UPDATE. Covers the device's own in-flight push and is reported
     * immediately.
     *
     * `behind` — the device holds no more than the cloud. Usually another
     * till's write that this device has not pulled yet. Only a second
     * consecutive reading that shows the device stuck promotes it, in promote().
     */
    private function verdict(int $rowDelta, int $versionDelta, int $pending): string
    {
        if ($rowDelta === 0 && $versionDelta === 0) {
            return self::AGREES;
        }

        if ($pending > 0 && abs($rowDelta) <= $pending && abs($versionDelta) <= $pending) {
            return self::SYNCING;
        }

        return $rowDelta <= 0 && $versionDelta <= 0 ? self::BEHIND : self::DIVERGED;
    }

    /** @param array<int, array<string, mixed>> $tables */
    private function holdsACopy(array $tables): bool
    {
        $deviceRows = array_sum(array_map(fn (array $row) => (int) $row['device_rows'], $tables));
        $serverRows = array_sum(array_map(fn (array $row) => (int) $row['server_rows'], $tables));

        return $deviceRows > 0 || $serverRows === 0;
    }
}

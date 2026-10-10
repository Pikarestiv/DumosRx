<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\Sync\HealthSyncReconciliationRepairService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RepairHealthSyncReconciliation extends Command
{
    protected $signature = 'sync:repair-health-sync-reconciliation
                            {--apply : Write the repair. Without this flag the command only reports.}
                            {--store= : Limit the repair to one store id.}';

    protected $description = 'Reverse the Health Sync sync_reconciliation movements that zeroed live stock on 2026-10-10 (A-214), with compensating movements.';

    public function handle(HealthSyncReconciliationRepairService $service): int
    {
        $storeId = $this->option('store') ?: null;
        $apply = (bool) $this->option('apply');

        $result = $apply ? $service->apply($storeId) : $service->preview($storeId);

        if ($result['batches'] === 0) {
            $this->info('Nothing to repair: no un-reversed sync_reconciliation movements dated on or before '
                .HealthSyncReconciliationRepairService::INCIDENT_THROUGH.'.');

            return self::SUCCESS;
        }

        $this->line($apply ? '<info>APPLIED</info>' : '<comment>DRY RUN — nothing was written</comment>');
        $this->explainArithmetic();
        $this->showStores($result['per_store']);
        $this->showLargest($result['largest']);

        $this->info("Batches affected: {$result['batches']}");
        $this->info("Reconciliation movements reversed: {$result['movements_reversed']}");
        $this->info("Units restored: +{$result['units_restored']}");

        if ($result['clamped'] > 0) {
            $this->warn("{$result['clamped']} batch(es) sum below zero once the reconciliation is removed — "
                .'stored as 0 and the shortfall stays visible in the movement log; these need a physical count.');
        }

        if ($result['drifted'] > 0) {
            $this->warn("{$result['drifted']} batch(es) held a quantity that did not match their own movement log "
                .'before this repair; the log total is what they are set to.');
        }

        if ($apply) {
            Log::info('sync:repair-health-sync-reconciliation applied', $result);
        } else {
            $this->newLine();
            $this->line('Re-run with <info>--apply</info> to write these changes.');
        }

        return self::SUCCESS;
    }

    private function explainArithmetic(): void
    {
        $this->newLine();
        $this->line('Arithmetic: each batch is set to the sum of its whole movement log minus the bad');
        $this->line('reconciliation deltas, and a compensating movement of the opposite sign is written for');
        $this->line('each one. Movements recorded after the incident — sales, deliveries, counts — are part of');
        $this->line('that sum and are kept, so this restores the reconciliation delta rather than resetting the');
        $this->line('batch to its pre-incident number. A negative total is stored as 0.');
        $this->newLine();
    }

    /** @param array<string, array{batches:int, movements:int, units:int}> $perStore */
    private function showStores(array $perStore): void
    {
        $names = Store::whereIn('id', array_keys($perStore))->pluck('name', 'id');

        $rows = [];
        foreach ($perStore as $storeId => $totals) {
            $rows[] = [
                $names[$storeId] ?? '(unknown store)',
                $storeId,
                $totals['batches'],
                $totals['movements'],
                '+'.$totals['units'],
            ];
        }

        $this->table(['Store', 'Store id', 'Batches', 'Movements', 'Units restored'], $rows);
    }

    /** @param array<int, array{product:string, store:string, units:int, from:int, to:int}> $largest */
    private function showLargest(array $largest): void
    {
        $rows = array_map(fn ($row) => [
            $row['product'],
            $row['store'],
            '+'.$row['units'],
            $row['from'],
            $row['to'],
        ], $largest);

        $this->line('Largest corrections:');
        $this->table(['Product', 'Store id', 'Units restored', 'Quantity now', 'Quantity after'], $rows);
    }
}

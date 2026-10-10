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

        $this->showWindow($result);

        if ($result['batches'] === 0 && $result['skipped'] === 0) {
            $this->info('Nothing to repair: no un-reversed sync_reconciliation movement was written inside that window.');

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
            $this->warn("{$result['clamped']} batch(es) fall below zero once the reconciliation is removed — "
                .'stored as 0 and the shortfall stays visible in the movement log; these need a physical count.');
        }

        if ($result['skipped'] > 0) {
            $this->warn("{$result['skipped']} batch(es) had their quantity moved by a till while the repair ran, so "
                .'nothing was written for them — not the quantity and not the reversal. Re-run the command to finish them.');
            $this->table(
                ['Product', 'Store id', 'Batch id'],
                array_map(fn ($row) => [$row['product'], $row['store'], $row['batch']], $result['skipped_batches']),
            );
        }

        if ($result['drifted'] > 0) {
            $this->warn("{$result['drifted']} batch(es) held a quantity that did not match their own movement log "
                .'before this repair; their stored quantity, not the log total, is what the repair builds on.');
        }

        if ($apply) {
            Log::info('sync:repair-health-sync-reconciliation applied', $result);
        } else {
            $this->newLine();
            $this->line('Re-run with <info>--apply</info> to write these changes.');
        }

        return self::SUCCESS;
    }

    /** @param array<string, mixed> $result */
    private function showWindow(array $result): void
    {
        [$from, $through] = $result['window'];
        $this->line('Scope: the A-214 Health Sync run — sync_reconciliation movements written');
        $this->line("from <info>{$from}</info>");
        $this->line("to   <info>{$through}</info>");

        $outside = $result['out_of_window'];

        if ($outside['count'] > 0) {
            $this->warn("{$outside['count']} other un-reversed sync_reconciliation movement(s) exist outside that window");
            $this->warn("(between {$outside['earliest']} and {$outside['latest']}) and are deliberately NOT touched:");
            $this->warn('the A-148 repair run and any owner-pressed Health Sync are legitimate.');
        }
    }

    private function explainArithmetic(): void
    {
        $this->newLine();
        $this->line('Arithmetic: each batch is set to its quantity now minus the bad reconciliation deltas,');
        $this->line('and a compensating movement of the opposite sign is written for each one. That undoes');
        $this->line('exactly the incident: every movement recorded after it — sales, deliveries, counts — is');
        $this->line('already part of the quantity now and is kept. The movement log is never summed, so a');
        $this->line('batch whose opening stock produced no movement row is still restored correctly.');
        $this->line('"Units restored" is the change actually written to each batch; a negative total is stored as 0.');
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

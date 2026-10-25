<?php

namespace App\Console\Commands;

use App\Services\Sync\OversellCompensationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CompensateOversells extends Command
{
    protected $signature = 'stock:compensate-oversells
                            {--store= : Only batches of this store id.}
                            {--write : Write the compensations. Without this flag the command only reports.}
                            {--run= : Label for this run, written into each row\'s reason. Defaults to now (UTC).}
                            {--revert= : Reverse the rows the named run wrote, with matching negative adjustments.}';

    protected $description = 'Write the inbound adjustment an oversell needed for every batch whose movement log sums below zero (A-265).';

    public function handle(OversellCompensationService $service): int
    {
        if (config('dumos.health_sync_enabled')) {
            $this->error('Refusing to run while Health Sync is enabled: the two repairs must never both be live.');

            return self::FAILURE;
        }

        if ($run = $this->option('revert')) {
            return $this->revert($service, (string) $run);
        }

        $deficits = $service->deficits($this->option('store') ?: null);
        if ($deficits->isEmpty()) {
            $this->info('No batch has a movement log that sums below zero.');

            return self::SUCCESS;
        }

        $this->table(
            ['Batch', 'Product', 'Store', 'Inbound', 'Outbound', 'Compensation'],
            $deficits->map(fn ($row) => [$row->batch_id, $row->product, $row->store_id, $row->inbound, $row->outbound, '+'.$row->deficit])->all(),
        );

        if (! $this->option('write')) {
            $this->line('<comment>DRY RUN — nothing was written.</comment> Re-run with <info>--write</info> to write these rows.');

            return self::SUCCESS;
        }

        $run = (string) ($this->option('run') ?: now()->utc()->format('Y-m-d\TH:i\Z'));
        if ($service->writtenBy($run)->isNotEmpty()) {
            $this->error("Run \"{$run}\" has already written rows; pick another --run label.");

            return self::FAILURE;
        }

        $written = $service->compensate($deficits, $run);
        $skipped = $deficits->count() - $written;
        $this->info("Wrote {$written} compensation row(s) as run \"{$run}\". Revert with --revert=\"{$run}\".");
        if ($skipped > 0) {
            $this->warn("{$skipped} batch(es) skipped: no outbound movement names who performed it.");
        }
        Log::info('stock:compensate-oversells written', ['run' => $run, 'written' => $written, 'skipped' => $skipped]);

        return self::SUCCESS;
    }

    private function revert(OversellCompensationService $service, string $run): int
    {
        $reverted = $service->revert($run);
        $this->info($reverted > 0
            ? "Reversed {$reverted} row(s) from run \"{$run}\"."
            : "Nothing to reverse for run \"{$run}\" (no rows, or already reversed).");
        Log::info('stock:compensate-oversells reverted', ['run' => $run, 'reverted' => $reverted]);

        return self::SUCCESS;
    }
}

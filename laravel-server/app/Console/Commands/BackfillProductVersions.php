<?php

namespace App\Console\Commands;

use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BackfillProductVersions extends Command
{
    private const CHUNK = 500;

    protected $signature = 'sync:backfill-product-versions
                            {--since= : Only products whose updated_at is at or after this timestamp. Required.}
                            {--until= : Only products whose updated_at is at or before this timestamp.}
                            {--store= : Limit the backfill to one store id.}
                            {--apply : Write the bump. Without this flag the command only reports.}';

    protected $description = 'Bump products._version over a time window so a device holding a pre-repair copy can no longer revert it (A-245 backfill).';

    public function handle(): int
    {
        $since = $this->option('since');
        $until = $this->option('until');
        $storeId = $this->option('store') ?: null;
        $apply = (bool) $this->option('apply');

        $connection = config('database.default');
        $this->line('Database: <info>'.(config("database.connections.{$connection}.database") ?: ':memory:')."</info> (connection {$connection})");

        if (! $since) {
            $this->error('--since is required: this command writes to every product in the window, so the window must be stated explicitly.');

            return self::FAILURE;
        }

        $query = Product::query()
            ->where('updated_at', '>=', $since)
            ->when($until, fn ($q) => $q->where('updated_at', '<=', $until))
            ->when($storeId, fn ($q) => $q->where('store_id', $storeId));

        $ids = $query->orderBy('id')->pluck('id');

        $this->line($apply ? '<info>APPLIED</info>' : '<comment>DRY RUN — nothing was written</comment>');
        $this->info("Products in window: {$ids->count()}");

        if (! $apply) {
            $this->newLine();
            $this->line('Re-run with <info>--apply</info> to bump these versions.');

            return self::SUCCESS;
        }

        foreach ($ids->chunk(self::CHUNK) as $chunk) {
            Product::whereIn('id', $chunk->all())->update([
                '_version' => DB::raw('COALESCE(_version, 0) + 1'),
            ]);
        }

        Log::info('sync:backfill-product-versions applied', [
            'since' => $since,
            'until' => $until,
            'store' => $storeId,
            'products' => $ids->count(),
        ]);

        return self::SUCCESS;
    }
}

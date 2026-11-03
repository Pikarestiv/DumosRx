<?php

namespace App\Console\Commands;

use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Semantics, and why `_version` is not bumped: laravel-server/AGENTS.md, "Products are shown online by default". */
class BackfillShowOnline extends Command
{
    protected $signature = 'products:backfill-show-online
                            {--dry-run : Count the products that would be shown without writing anything.}
                            {--chunk=500 : Rows per write.}';

    protected $description = 'Show every active, non-controlled, live product that is currently hidden from the storefront.';

    public function handle(): int
    {
        $connection = config('database.default');
        $this->line('Database: <info>'.(config("database.connections.{$connection}.database") ?: ':memory:')."</info> (connection {$connection})");

        if ($this->option('dry-run')) {
            $this->line('<comment>DRY RUN — nothing was written</comment>');
            $this->info('Would update '.$this->eligible()->count().' product(s).');

            return self::SUCCESS;
        }

        [$updated, $storeIds, $ownerIds] = $this->write(max(1, (int) $this->option('chunk')));

        Product::markStorefrontsDirty($storeIds, $ownerIds);

        $this->info("Updated {$updated} product(s) across ".count($storeIds).' store(s) and '.count($ownerIds).' store-less owner(s).');
        Log::info('products:backfill-show-online applied', ['updated' => $updated, 'stores' => count($storeIds)]);

        return self::SUCCESS;
    }

    private function eligible(): Builder
    {
        return DB::table('products')
            ->where('show_online', false)
            ->where('is_active', true)
            ->where('is_controlled', false)
            ->whereNull('deleted_at');
    }

    /** @return array{0: int, 1: array<int, string>, 2: array<int, string>} */
    private function write(int $chunk): array
    {
        $updated = 0;
        $storeIds = [];
        $ownerIds = [];
        $lastId = '';

        while (true) {
            $rows = $this->eligible()->where('id', '>', $lastId)->orderBy('id')->limit($chunk)->get(['id', 'store_id', 'user_id']);

            if ($rows->isEmpty()) {
                break;
            }

            $lastId = (string) $rows->last()->id;
            $updated += $this->eligible()->whereIn('id', $rows->pluck('id'))->update([
                'show_online' => true,
                'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
            ]);

            foreach ($rows as $row) {
                if ($row->store_id !== null) {
                    $storeIds[$row->store_id] = (string) $row->store_id;
                } elseif ($row->user_id !== null) {
                    $ownerIds[$row->user_id] = (string) $row->user_id;
                }
            }
        }

        return [$updated, array_values($storeIds), array_values($ownerIds)];
    }
}

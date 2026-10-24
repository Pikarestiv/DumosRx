<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RepairProductStoreStamps extends Command
{
    private const CHUNK = 200;

    private const CONFIRMATION = 'Write these moves?';

    protected $signature = 'sync:repair-product-store-stamps
                            {--store= : Only repair products whose evidence points at this store id.}
                            {--apply : Write the moves. Without this flag the command only reports.}';

    protected $description = 'Move a product back onto the store its own stock batches and movements belong to, so the batch becomes pullable again (A-248).';

    /** @var array<string, array{name: string, owner: string|null}|null> */
    private array $stores = [];

    /** @var array<string, string|null> */
    private array $tenants = [];

    public function handle(): int
    {
        $connection = config('database.default');
        $this->line('Database: <info>'.(config("database.connections.{$connection}.database") ?: ':memory:')."</info> (connection {$connection})");

        $onlyStore = $this->option('store') ?: null;
        $apply = (bool) $this->option('apply');

        [$repairable, $refused] = $this->collect($onlyStore);

        if ($repairable === [] && $refused === []) {
            $this->info('No product disagrees with the store its stock batches and movements belong to.');

            return self::SUCCESS;
        }

        $this->newLine();
        $this->line($apply
            ? '<info>APPLY — you will be asked to confirm before anything is written</info>'
            : '<comment>DRY RUN — nothing was written</comment>');
        $this->newLine();

        foreach ($refused as $case) {
            $this->reportRefused($case);
        }

        foreach ($repairable as $case) {
            $this->reportRepairable($case);
        }

        $this->summarize($repairable, $refused);

        if (! $apply) {
            $this->newLine();
            $this->line('Re-run with <info>--apply</info> to write these moves.');

            return self::SUCCESS;
        }

        if ($repairable === []) {
            $this->warn('Nothing can be attributed, so nothing was written.');

            return self::SUCCESS;
        }

        $this->warnAboutTheLosingStores($repairable);

        if (! $this->confirm(self::CONFIRMATION)) {
            $this->warn('Nothing was written.');

            return self::SUCCESS;
        }

        $this->write($repairable);

        Log::info('sync:repair-product-store-stamps applied', [
            'store' => $onlyStore,
            'moved' => count($repairable),
            'refused' => count($refused),
            'products' => array_column($repairable, 'id'),
        ]);

        return self::SUCCESS;
    }

    /**
     * Candidates: a product holding a batch whose own non-NULL `store_id` differs, or a store-less product whose
     * batches name a store; its movements are not evidence, the server backfills their store from the session (A-248).
     *
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, array<string, mixed>>}
     */
    private function collect(?string $onlyStore): array
    {
        $repairable = [];
        $refused = [];
        $lastId = '';

        while (true) {
            $products = DB::table('products')
                ->where('id', '>', $lastId)
                ->where(fn ($q) => $q
                    ->where(fn ($stamped) => $stamped->whereNotNull('store_id')->whereExists(fn ($e) => $e->from('stock_batches')
                        ->whereColumn('stock_batches.product_id', 'products.id')
                        ->whereNotNull('stock_batches.store_id')
                        ->whereColumn('stock_batches.store_id', '<>', 'products.store_id')))
                    ->orWhere(fn ($storeless) => $storeless->whereNull('store_id')
                        ->whereExists(fn ($b) => $b->from('stock_batches')->whereColumn('stock_batches.product_id', 'products.id')->whereNotNull('stock_batches.store_id'))))
                ->orderBy('id')
                ->limit(self::CHUNK)
                ->get(['id', 'name', 'store_id', 'user_id']);

            if ($products->isEmpty()) {
                break;
            }

            $lastId = (string) $products->last()->id;

            foreach ($products as $product) {
                $case = $this->assess($product);

                if ($case['reason'] !== null) {
                    $refused[] = $case;

                    continue;
                }

                if ($onlyStore !== null && $case['proposed'] !== $onlyStore) {
                    continue;
                }

                $repairable[] = $case;
            }
        }

        return [$repairable, $refused];
    }

    /**
     * The one store all its batches name, plus its movements' unless it is store-less; anything else is refused.
     * Rules: laravel-server/AGENTS.md, "Mis-stamped product repair".
     *
     * @return array<string, mixed>
     */
    private function assess(object $product): array
    {
        $batches = DB::table('stock_batches')
            ->where('product_id', $product->id)
            ->orderBy('id')
            ->get(['id', 'store_id']);

        $movementStores = DB::table('stock_movements')
            ->where('product_id', $product->id)
            ->whereNotNull('store_id')
            ->distinct()
            ->pluck('store_id')
            ->all();

        $evidence = array_values(array_unique(array_merge(
            array_filter($batches->pluck('store_id')->all()),
            $product->store_id === null ? [] : $movementStores,
        )));

        $case = [
            'id' => (string) $product->id,
            'name' => (string) ($product->name ?? '(unnamed)'),
            'current' => $product->store_id === null ? null : (string) $product->store_id,
            'proposed' => count($evidence) === 1 ? (string) $evidence[0] : null,
            'evidence' => $evidence,
            'batches' => $batches->pluck('id')->all(),
            'movements' => DB::table('stock_movements')->where('product_id', $product->id)->count(),
            'reason' => null,
        ];

        if ($case['proposed'] === null || $case['proposed'] === $case['current']) {
            return ['reason' => 'CONTRADICTORY'] + $case;
        }

        $owner = $this->store($case['proposed'])['owner'] ?? null;
        $currentOwner = $case['current'] === null
            ? $this->tenantOf($product->user_id ?? null)
            : ($this->store($case['current'])['owner'] ?? null);

        if ($case['current'] === null && $currentOwner === null) {
            return ['reason' => 'NO KNOWN AUTHOR'] + $case;
        }

        if ($owner === null || $owner !== $currentOwner) {
            return ['reason' => 'ANOTHER TENANT'] + $case;
        }

        return $case;
    }

    /** A store-less product's tenant is its author's: the author if they own stores, else their store's owner. */
    private function tenantOf(?string $userId): ?string
    {
        if ($userId === null) {
            return null;
        }

        if (! array_key_exists($userId, $this->tenants)) {
            $storeId = DB::table('users')->where('id', $userId)->value('store_id');
            $this->tenants[$userId] = DB::table('stores')->where('user_id', $userId)->exists()
                ? $userId
                : ($storeId === null ? null : ($this->store((string) $storeId)['owner'] ?? null));
        }

        return $this->tenants[$userId];
    }

    /** @param array<string, mixed> $case */
    private function reportRepairable(array $case): void
    {
        $this->line("<info>{$case['id']}</info> \"{$case['name']}\"");
        $this->line('  current:  '.$this->describeStore($case['current']));
        $this->line('  proposed: '.$this->describeStore($case['proposed']));
        $this->line('  evidence: '.count($case['batches']).' batch(es), '.$case['movements'].' movement(s)');
        $this->line('  batches:  '.implode(', ', $case['batches']));
        $this->newLine();
    }

    /** @param array<string, mixed> $case */
    private function reportRefused(array $case): void
    {
        $this->line("<comment>{$case['id']}</comment> \"{$case['name']}\" — <comment>{$case['reason']}</comment>, left alone");
        $this->line('  current:  '.$this->describeStore($case['current']));
        $this->line('  evidence points at '.count($case['evidence']).' store(s): '.(
            $case['evidence'] === []
                ? 'none'
                : implode(' | ', array_map(fn ($id) => $this->describeStore((string) $id), $case['evidence']))
        ));
        $this->line('  batches:  '.implode(', ', $case['batches']));
        $this->newLine();
    }

    /**
     * @param  array<int, array<string, mixed>>  $repairable
     * @param  array<int, array<string, mixed>>  $refused
     */
    private function summarize(array $repairable, array $refused): void
    {
        $reasons = array_count_values(array_column($refused, 'reason'));

        $this->line('Repairable: '.count($repairable));
        $this->line('Contradictory: '.($reasons['CONTRADICTORY'] ?? 0));
        $this->line('Another tenant: '.($reasons['ANOTHER TENANT'] ?? 0));
        $this->line('No known author: '.($reasons['NO KNOWN AUTHOR'] ?? 0));
    }

    /** @param array<int, array<string, mixed>> $repairable */
    private function warnAboutTheLosingStores(array $repairable): void
    {
        $losing = array_count_values(array_filter(array_column($repairable, 'current')));

        $this->newLine();
        $this->warn('Moving a product out of a store is a scoping change, not a delete, so no tombstone is ever sent.');
        $this->warn('Every device of the losing store keeps that product, its batches and its movements for ever,');
        $this->warn('with no way to learn they are gone (§11). Those rows are already on those devices today —');
        $this->warn('this repair stops the cloud refreshing them. Nothing on the server can clear one: a full');
        $this->warn('resync only re-pulls, so the only remedy is wiping that device\'s local database.');
        $this->newLine();

        foreach ($losing as $storeId => $count) {
            $this->warn("  {$this->describeStore((string) $storeId)} loses {$count} product(s) from its pull scope.");
        }

        $this->newLine();
    }

    /** @param array<int, array<string, mixed>> $repairable */
    private function write(array $repairable): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        $byStore = [];

        foreach ($repairable as $case) {
            $byStore[$case['proposed']][] = $case['id'];
        }

        foreach ($byStore as $storeId => $ids) {
            foreach (array_chunk($ids, self::CHUNK) as $chunk) {
                DB::table('products')->whereIn('id', $chunk)->update([
                    'store_id' => $storeId,
                    'updated_at' => $now,
                    '_version' => DB::raw('COALESCE(_version, 0) + 1'),
                ]);
                DB::table('stock_batches')->whereIn('product_id', $chunk)->update(['_synced_at' => $now]);
            }
        }

        $this->info('Moved '.count($repairable).' product(s). Each one re-pulls to every device of both stores.');
    }

    private function describeStore(?string $id): string
    {
        if ($id === null) {
            return '(no store)';
        }

        return $id.' '.($this->store($id)['name'] ?? '(unknown store)');
    }

    /** @return array{name: string, owner: string|null}|null */
    private function store(string $id): ?array
    {
        if (! array_key_exists($id, $this->stores)) {
            $row = DB::table('stores')->where('id', $id)->first(['name', 'user_id']);

            $this->stores[$id] = $row === null ? null : [
                'name' => (string) $row->name,
                'owner' => $row->user_id === null ? null : (string) $row->user_id,
            ];
        }

        return $this->stores[$id];
    }
}

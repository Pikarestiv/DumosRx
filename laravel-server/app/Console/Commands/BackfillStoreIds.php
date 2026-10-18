<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BackfillStoreIds extends Command
{
    private const CHUNK = 500;

    /**
     * Table => ordered derivation chain of [source table, foreign key]. The
     * key order is the processing order: a table never appears before one it
     * derives from. `users` is resolved by ownership rather than by reading a
     * store_id column. See docs/FIXED_BUGS.md A-288 for the per-table
     * reasoning and confidence.
     */
    private const DERIVATIONS = [
        'customers' => [['users', 'user_id']],
        'categories' => [['users', 'user_id']],
        'suppliers' => [['users', 'user_id']],
        'products' => [['users', 'user_id']],
        'expenses' => [['users', 'user_id']],
        'prescriptions' => [['users', 'user_id']],
        'loyalty_tiers' => [['users', 'user_id']],
        'loyalty_redemption_options' => [['users', 'user_id']],
        'activity_logs' => [['users', 'user_id']],
        'audit_logs' => [['users', 'user_id']],
        'sales' => [['users', 'cashier_id'], ['users', 'user_id']],
        'returns' => [['sales', 'sale_id'], ['users', 'user_id']],
        'purchase_orders' => [['suppliers', 'supplier_id']],
        'supplier_payments' => [['purchase_orders', 'po_id'], ['suppliers', 'supplier_id']],
        'stock_movements' => [['products', 'product_id']],
        'stock_audits' => [['products', 'product_id'], ['users', 'user_id']],
        'held_transactions' => [['customers', 'customer_id']],
        'loyalty_transactions' => [['customers', 'customer_id']],
        'customer_payments' => [['customers', 'customer_id']],
        'requested_products' => [],
    ];

    protected $signature = 'sync:backfill-store-ids
                            {--store= : Only write rows that resolve to this store id.}
                            {--apply : Write the attributions. Without this flag the command only reports.}';

    protected $description = 'Attribute a store_id to legacy rows the server left NULL, which the sync engine can see in neither direction (A-288).';

    /** @var array<string, string|null> */
    private array $storeCache = [];

    public function handle(): int
    {
        $connection = config('database.default');
        $this->line('Database: <info>'.(config("database.connections.{$connection}.database") ?: ':memory:')."</info> (connection {$connection})");

        $onlyStore = $this->option('store') ?: null;
        $apply = (bool) $this->option('apply');

        $this->line($apply ? '<info>APPLIED</info>' : '<comment>DRY RUN — nothing was written</comment>');

        $totals = ['attributed' => 0, 'unattributable' => 0, 'tables' => 0];

        foreach (self::DERIVATIONS as $table => $chain) {
            $counts = $this->processTable($table, $chain, $onlyStore, $apply);

            if ($counts['attributed'] === 0 && $counts['unattributable'] === 0) {
                continue;
            }

            $this->line("{$table}: {$counts['unattributable']} unattributable, {$counts['attributed']} attributed");
            $totals['attributed'] += $counts['attributed'];
            $totals['unattributable'] += $counts['unattributable'];
            $totals['tables']++;
        }

        if ($totals['tables'] === 0) {
            $this->info('Nothing to attribute: no store-scoped table holds a row with a NULL store_id.');

            return self::SUCCESS;
        }

        $this->newLine();
        $this->line("Total: {$totals['unattributable']} unattributable, {$totals['attributed']} attributed across {$totals['tables']} table(s).");
        $this->line('An unattributable row keeps its NULL store_id and stays invisible to the sync engine; its owner cannot be derived and is deliberately not guessed.');

        if (! $apply) {
            $this->newLine();
            $this->line('Re-run with <info>--apply</info> to write these attributions.');

            return self::SUCCESS;
        }

        Log::info('sync:backfill-store-ids applied', $totals + ['store' => $onlyStore]);

        return self::SUCCESS;
    }

    /**
     * @param  array<int, array{0: string, 1: string}>  $chain
     * @return array{attributed: int, unattributable: int}
     */
    private function processTable(string $table, array $chain, ?string $onlyStore, bool $apply): array
    {
        $columns = array_values(array_unique(array_merge(['id'], array_column($chain, 1))));
        $attributed = 0;
        $unattributable = 0;
        $lastId = '';

        while (true) {
            $rows = DB::table($table)
                ->whereNull('store_id')
                ->where('id', '>', $lastId)
                ->orderBy('id')
                ->limit(self::CHUNK)
                ->get($columns);

            if ($rows->isEmpty()) {
                break;
            }

            $lastId = (string) $rows->last()->id;
            $byStore = [];

            foreach ($rows as $row) {
                $storeId = $this->resolveStoreId($row, $chain);
                $this->storeCache["{$table}:{$row->id}"] = $storeId;

                if ($storeId === null) {
                    $unattributable++;

                    continue;
                }

                if ($onlyStore !== null && $storeId !== $onlyStore) {
                    continue;
                }

                $attributed++;
                $byStore[$storeId][] = $row->id;
            }

            if ($apply) {
                foreach ($byStore as $storeId => $ids) {
                    DB::table($table)->whereIn('id', $ids)->update(['store_id' => $storeId]);
                }
            }
        }

        return ['attributed' => $attributed, 'unattributable' => $unattributable];
    }

    /** @param array<int, array{0: string, 1: string}> $chain */
    private function resolveStoreId(object $row, array $chain): ?string
    {
        foreach ($chain as [$source, $column]) {
            $key = $row->{$column} ?? null;

            if ($key === null) {
                continue;
            }

            $storeId = $source === 'users'
                ? $this->storeOwnedByUser((string) $key)
                : $this->storeIdOfRow($source, (string) $key);

            if ($storeId !== null) {
                return $storeId;
            }
        }

        return null;
    }

    /**
     * The one store this user can only mean: their employer store if they are
     * staff, or the single store they own. Any other count — none, or several
     * — is ambiguous and returns null rather than picking one.
     */
    private function storeOwnedByUser(string $userId): ?string
    {
        return $this->cached("users:{$userId}", function () use ($userId) {
            $candidates = DB::table('stores')
                ->where('user_id', $userId)
                ->whereNull('deleted_at')
                ->pluck('id')
                ->all();

            $employer = DB::table('users')->where('id', $userId)->value('store_id');

            if ($employer !== null) {
                $candidates[] = $employer;
            }

            $candidates = array_values(array_unique($candidates));

            return count($candidates) === 1 ? (string) $candidates[0] : null;
        });
    }

    private function storeIdOfRow(string $table, string $id): ?string
    {
        return $this->cached("{$table}:{$id}", function () use ($table, $id) {
            $storeId = DB::table($table)->where('id', $id)->value('store_id');

            return $storeId === null ? null : (string) $storeId;
        });
    }

    private function cached(string $key, callable $resolve): ?string
    {
        if (! array_key_exists($key, $this->storeCache)) {
            $this->storeCache[$key] = $resolve();
        }

        return $this->storeCache[$key];
    }
}

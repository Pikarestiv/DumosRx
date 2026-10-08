<?php

namespace App\Console\Commands;

use App\Services\Sync\CrossTenantCategoryRepairService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RepairCrossTenantCategories extends Command
{
    protected $signature = 'sync:repair-cross-tenant-categories
                            {--apply : Write the repair. Without this flag the command only reports.}
                            {--store= : Limit the repair to one store id.}';

    protected $description = 'Repoint products whose category belongs to a different store onto a same-named category their own store owns.';

    public function handle(CrossTenantCategoryRepairService $service): int
    {
        $storeId = $this->option('store') ?: null;
        $apply = (bool) $this->option('apply');

        $result = $apply ? $service->apply($storeId) : $service->preview($storeId);

        if ($result['products_repointed'] === 0 && $result['unowned_products_skipped'] === 0) {
            $this->info('No cross-tenant category references found.');

            return self::SUCCESS;
        }

        $this->line($apply ? '<info>APPLIED</info>' : '<comment>DRY RUN — nothing was written</comment>');
        $this->newLine();

        $rows = [];
        foreach ($result['per_store'] as $store => $detail) {
            $names = array_values(array_unique($detail['categories']));
            sort($names);
            $rows[] = [$store, $detail['products'], count($names), implode(', ', $names)];
        }

        $this->table(['Store', 'Products', 'Categories', 'Category names'], $rows);

        $this->info("Products repointed: {$result['products_repointed']}");
        $this->info("Categories created: {$result['categories_created']}");
        $this->info("Categories revived: {$result['categories_revived']}");

        if ($result['unowned_products_skipped'] > 0) {
            $this->warn(
                "Skipped {$result['unowned_products_skipped']} product(s) with no store_id — ".
                'these have no owning store to repoint to and need to be assigned one first.'
            );
        }

        if ($apply) {
            Log::info('sync:repair-cross-tenant-categories applied', $result);
        } else {
            $this->newLine();
            $this->line('Re-run with <info>--apply</info> to write these changes.');
        }

        return self::SUCCESS;
    }
}

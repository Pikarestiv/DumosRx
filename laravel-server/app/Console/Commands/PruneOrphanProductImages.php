<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Services\ProductImages\ProductImageService;
use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;

class PruneOrphanProductImages extends Command
{
    private const PUBLISHED_MIN_AGE_HOURS = 24;

    private const INCOMING_MIN_AGE_HOURS = 1;

    protected $signature = 'product-images:prune-orphans {--dry-run : List the orphans without deleting them}';

    protected $description = 'Delete abandoned uploads and published product images no product row references.';

    private bool $dryRun = false;

    private int $deleted = 0;

    public function handle(ProductImageService $images): int
    {
        if (! $images->isEnabled()) {
            $this->info('Product images are not configured; nothing to do.');

            return self::SUCCESS;
        }

        $this->dryRun = (bool) $this->option('dry-run');

        $this->sweep($images, $images->incomingDisk(), self::INCOMING_MIN_AGE_HOURS, fn (array $keys) => []);
        $this->sweep($images, $images->disk(), self::PUBLISHED_MIN_AGE_HOURS, fn (array $keys) => Product::withTrashed()->whereIn('image_key', $keys)->pluck('image_key')->all());

        $this->info(($this->dryRun ? 'Found ' : 'Deleted ')."{$this->deleted} orphaned product image object(s).");

        return self::SUCCESS;
    }

    /** @param callable(array<int, string>): array<int, string> $referencedAmong */
    private function sweep(ProductImageService $images, Filesystem $disk, int $minAgeHours, callable $referencedAmong): void
    {
        $cutoff = now()->subHours($minAgeHours)->getTimestamp();

        foreach (array_chunk($disk->allFiles('stores'), 500) as $keys) {
            $referenced = array_flip($referencedAmong($keys));

            foreach ($keys as $key) {
                if (isset($referenced[$key]) || $disk->lastModified($key) > $cutoff) {
                    continue;
                }
                $this->deleted++;
                $this->line(($this->dryRun ? 'Would delete ' : 'Deleting ').$key);
                if (! $this->dryRun) {
                    $images->deleteQuietly($disk, $key);
                }
            }
        }
    }
}

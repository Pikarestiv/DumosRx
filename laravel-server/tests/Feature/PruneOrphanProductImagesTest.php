<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PruneOrphanProductImagesTest extends TestCase
{
    use RefreshDatabase;

    private const LIVE = 'stores/s1/products/p1/live.webp';

    private const TRASHED = 'stores/s1/products/p2/trashed.webp';

    private const OLD_ORPHAN = 'stores/s1/products/p1/replaced.webp';

    private const FRESH_ORPHAN = 'stores/s1/products/p1/uploading.webp';

    private const OUTSIDE_PREFIX = 'backups/keep-me.zip';

    private const STALE_UPLOAD = 'stores/s1/products/p1/abandoned.webp';

    private const LIVE_UPLOAD = 'stores/s1/products/p1/in-flight.webp';

    protected function setUp(): void
    {
        parent::setUp();

        config(['product_images.enabled' => true, 'product_images.disk' => 'r2', 'product_images.public_base_url' => 'https://img.example.test']);
        config(['product_images.incoming_disk' => 'r2_incoming']);
        $disk = Storage::fake('r2');
        $incoming = Storage::fake('r2_incoming');
        $incoming->put(self::STALE_UPLOAD, 'x');
        touch($incoming->path(self::STALE_UPLOAD), time() - 2 * 3600);
        $incoming->put(self::LIVE_UPLOAD, 'x');

        foreach ([self::LIVE, self::TRASHED, self::OLD_ORPHAN, self::FRESH_ORPHAN, self::OUTSIDE_PREFIX] as $key) {
            $disk->put($key, 'x');
            touch($disk->path($key), $key === self::FRESH_ORPHAN ? time() - 3600 : time() - 3 * 86400);
        }

        Product::create(['name' => 'live', 'image_key' => self::LIVE]);
        Product::create(['name' => 'trashed', 'image_key' => self::TRASHED])->delete();
    }

    public function test_deletes_only_old_unreferenced_objects_under_the_stores_prefix(): void
    {
        $this->artisan('product-images:prune-orphans')->assertSuccessful();

        $disk = Storage::disk('r2');
        $disk->assertMissing(self::OLD_ORPHAN);
        $disk->assertExists(self::LIVE);
        $disk->assertExists(self::TRASHED);
        $disk->assertExists(self::FRESH_ORPHAN);
        $disk->assertExists(self::OUTSIDE_PREFIX);
    }

    public function test_deletes_incoming_uploads_older_than_an_hour(): void
    {
        $this->artisan('product-images:prune-orphans')->assertSuccessful();

        Storage::disk('r2_incoming')->assertMissing(self::STALE_UPLOAD);
        Storage::disk('r2_incoming')->assertExists(self::LIVE_UPLOAD);
    }

    public function test_dry_run_reports_without_deleting(): void
    {
        $this->artisan('product-images:prune-orphans --dry-run')
            ->expectsOutputToContain(self::OLD_ORPHAN)
            ->assertSuccessful();

        Storage::disk('r2')->assertExists(self::OLD_ORPHAN);
        Storage::disk('r2_incoming')->assertExists(self::STALE_UPLOAD);
    }

    public function test_does_nothing_while_the_feature_is_off(): void
    {
        config(['product_images.enabled' => false]);

        $this->artisan('product-images:prune-orphans')->assertSuccessful();

        Storage::disk('r2')->assertExists(self::OLD_ORPHAN);
    }
}

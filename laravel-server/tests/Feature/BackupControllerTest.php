<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Regression coverage for the backup-isolation fix: before it, every
 * backup lived in one shared `backups/` directory with no ownership check
 * at all — list() returned every store's filenames and download() served
 * any filename requested, regardless of who uploaded it.
 */
class BackupControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $ownerA;
    protected User $ownerB;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_upload_stores_under_a_per_owner_directory()
    {
        $response = $this->actingAs($this->ownerA)
            ->postJson('/api/v1/backups/upload', [
                'backup' => UploadedFile::fake()->create('backup.zip', 10),
            ]);

        $response->assertStatus(200);
        $path = $response->json('path');
        $this->assertStringStartsWith("backups/{$this->ownerA->id}/", $path);
        Storage::assertExists($path);
    }

    public function test_list_does_not_include_another_owners_backups()
    {
        $this->actingAs($this->ownerA)->postJson('/api/v1/backups/upload', [
            'backup' => UploadedFile::fake()->create('a.zip', 10),
        ]);
        $this->actingAs($this->ownerB)->postJson('/api/v1/backups/upload', [
            'backup' => UploadedFile::fake()->create('b.zip', 10),
        ]);

        $response = $this->actingAs($this->ownerA)->getJson('/api/v1/backups');

        $response->assertStatus(200);
        $files = $response->json();
        $this->assertCount(1, $files);
        $this->assertStringContainsString($this->ownerA->id, $files[0]);
    }

    public function test_download_404s_for_a_filename_belonging_to_another_owner()
    {
        $upload = $this->actingAs($this->ownerB)->postJson('/api/v1/backups/upload', [
            'backup' => UploadedFile::fake()->create('b.zip', 10),
        ]);
        $filename = basename($upload->json('path'));

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/backups/{$filename}/download");

        $response->assertStatus(404);
    }

    public function test_download_works_for_the_owners_own_backup()
    {
        $upload = $this->actingAs($this->ownerA)->postJson('/api/v1/backups/upload', [
            'backup' => UploadedFile::fake()->create('mine.zip', 10),
        ]);
        $filename = basename($upload->json('path'));

        $response = $this->actingAs($this->ownerA)->get("/api/v1/backups/{$filename}/download");

        $response->assertStatus(200);
    }

    public function test_download_rejects_path_traversal_in_filename()
    {
        $response = $this->actingAs($this->ownerA)
            ->getJson('/api/v1/backups/' . urlencode('../' . $this->ownerB->id . '/secret.zip') . '/download');

        $response->assertStatus(404);
    }

    public function test_staff_shares_their_store_owners_backups()
    {
        $store = Store::create([
            'user_id' => $this->ownerA->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staffA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id,
        ]);

        $this->actingAs($this->ownerA)->postJson('/api/v1/backups/upload', [
            'backup' => UploadedFile::fake()->create('owner-backup.zip', 10),
        ]);

        $response = $this->actingAs($staff)->getJson('/api/v1/backups');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json());
    }
}

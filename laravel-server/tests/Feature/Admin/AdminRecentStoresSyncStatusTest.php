<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminPlatformService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class AdminRecentStoresSyncStatusTest extends TestCase
{
    use RefreshDatabase;

    private function storeLastSyncedAt(?\DateTimeInterface $lastSyncAt, string $name): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => $name,
            'email' => strtolower($name).'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => $name,
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);
        $store->last_sync_at = $lastSyncAt;
        $store->saveQuietly();

        return $store;
    }

    private function recentStores(): Collection
    {
        return collect(app(AdminPlatformService::class)->getGlobalSummary()['recent_stores'])
            ->keyBy('name');
    }

    public function test_sync_status_reflects_how_long_ago_each_store_actually_synced(): void
    {
        $this->storeLastSyncedAt(now()->subMinutes(5), 'Fresh');
        $this->storeLastSyncedAt(now()->subHours(5), 'Stale');
        $this->storeLastSyncedAt(now()->subDays(30), 'Abandoned');
        $this->storeLastSyncedAt(null, 'NeverSynced');

        $stores = $this->recentStores();

        $this->assertSame('Active', $stores['Fresh']['sync_status']);
        $this->assertSame('Away', $stores['Stale']['sync_status']);
        $this->assertSame('Inactive', $stores['Abandoned']['sync_status']);
        $this->assertSame('Inactive', $stores['NeverSynced']['sync_status']);

        $this->assertStringContainsString('minutes ago', $stores['Fresh']['last_sync_human']);
        $this->assertStringContainsString('hours ago', $stores['Stale']['last_sync_human']);
        $this->assertSame('Never synced', $stores['NeverSynced']['last_sync_human']);
    }

    /**
     * A clock-skewed offline device can push a last_sync_at that is
     * genuinely in the future (SyncController trusts the client's own
     * clock verbatim); the dashboard must never show a future sync time.
     */
    public function test_a_future_last_sync_at_from_a_clock_skewed_device_is_clamped_to_now(): void
    {
        $this->storeLastSyncedAt(now()->addHours(6), 'ClockSkewed');

        $store = $this->recentStores()['ClockSkewed'];

        $this->assertSame('Active', $store['sync_status']);
        $this->assertStringNotContainsString('from now', $store['last_sync_human']);
    }
}

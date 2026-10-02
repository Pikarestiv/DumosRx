<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A device's X-Device-Id/X-Device-Label headers are recorded per (user,
 * device) on push/pull/counts, purely so the admin panel's Store Staff list
 * can show which device a staff member last synced from and when - never
 * consulted for sync correctness or authorization. See
 * laravel-server/AGENTS.md, "Per-device sync visibility".
 */
class UserDeviceTrackingTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected Store $outsiderStore;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Store',
            'store_slug' => 'main-store',
            'device_id' => 'WEB-MAIN',
        ]);

        $outsider = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->outsiderStore = Store::create([
            'user_id' => $outsider->id,
            'name' => 'Other Store',
            'store_slug' => 'other-store',
            'device_id' => 'WEB-OTHER',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();
    }

    #[Test]
    public function a_counts_call_records_the_device_with_its_label(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-ABC123', 'X-Device-Label' => 'Chrome on Windows'])
            ->getJson('/api/v1/app/sync/counts')
            ->assertStatus(200);

        $device = UserDevice::where('user_id', $this->owner->id)->where('device_id', 'DRX-ABC123')->first();
        $this->assertNotNull($device);
        $this->assertSame('Chrome on Windows', $device->device_label);
        $this->assertNotNull($device->last_synced_at);
    }

    #[Test]
    public function a_second_call_within_a_minute_does_not_rewrite_the_row(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-ABC123', 'X-Device-Label' => 'Chrome on Windows'])
            ->getJson('/api/v1/app/sync/counts');

        $first = UserDevice::where('user_id', $this->owner->id)->where('device_id', 'DRX-ABC123')->first();

        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-ABC123', 'X-Device-Label' => 'Chrome on Windows'])
            ->getJson('/api/v1/app/sync/counts');

        $this->assertEquals(1, UserDevice::where('user_id', $this->owner->id)->count());
        $second = UserDevice::where('user_id', $this->owner->id)->where('device_id', 'DRX-ABC123')->first();
        $this->assertTrue($first->last_synced_at->equalTo($second->last_synced_at));
    }

    #[Test]
    public function a_call_with_no_device_id_header_is_silently_skipped(): void
    {
        $this->actingAs($this->owner)
            ->getJson('/api/v1/app/sync/counts')
            ->assertStatus(200);

        $this->assertEquals(0, UserDevice::count());
    }

    #[Test]
    public function two_different_devices_for_the_same_user_are_tracked_separately(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-AAA', 'X-Device-Label' => 'Chrome on Windows'])
            ->getJson('/api/v1/app/sync/counts');

        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-BBB', 'X-Device-Label' => 'Safari on iOS'])
            ->getJson('/api/v1/app/sync/counts');

        $this->assertEquals(2, UserDevice::where('user_id', $this->owner->id)->count());
    }

    #[Test]
    public function a_push_call_also_records_the_device(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-PUSH', 'X-Device-Label' => 'Tauri Desktop'])
            ->postJson('/api/v1/app/sync/push', [
                'changes' => [[
                    'table_name' => 'products',
                    'operation' => 'INSERT',
                    'record_id' => 'prod-device-test',
                    'payload' => ['id' => 'prod-device-test', 'name' => 'Test Product', '_synced' => 0],
                ]],
            ])
            ->assertStatus(200);

        $device = UserDevice::where('user_id', $this->owner->id)->where('device_id', 'DRX-PUSH')->first();
        $this->assertNotNull($device);
        $this->assertSame($this->store->id, $device->store_id);
    }

    #[Test]
    public function a_pull_call_also_records_the_device(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders(['X-Device-Id' => 'DRX-PULL', 'X-Device-Label' => 'Chrome on Windows'])
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []])
            ->assertStatus(200);

        $device = UserDevice::where('user_id', $this->owner->id)->where('device_id', 'DRX-PULL')->first();
        $this->assertNotNull($device);
        $this->assertSame($this->store->id, $device->store_id);
    }

    #[Test]
    public function a_pull_call_never_trusts_an_unverified_x_store_id_header_for_device_attribution(): void
    {
        $this->actingAs($this->owner)
            ->withHeaders([
                'X-Device-Id' => 'DRX-PULL',
                'X-Device-Label' => 'Chrome on Windows',
                'X-Store-Id' => $this->outsiderStore->id,
            ])
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []])
            ->assertStatus(200);

        $device = UserDevice::where('user_id', $this->owner->id)->where('device_id', 'DRX-PULL')->first();
        $this->assertNotNull($device);
        $this->assertSame($this->store->id, $device->store_id);
        $this->assertNotSame($this->outsiderStore->id, $device->store_id);
    }
}

<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * GET /admin/users exposes each staff member's most-recently-synced device
 * (lastSyncedAt/lastSyncDevice), and GET /admin/users/{id}/devices backs the
 * Store Staff list's full sync-history drill-down. See
 * laravel-server/AGENTS.md, "Per-device sync visibility".
 */
class AdminUserSyncVisibilityTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $staff;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $owner->id, 'name' => 'Main Store',
            'store_slug' => 'main-store', 'device_id' => 'WEB-MAIN',
        ]);

        $this->staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'Member',
            'email' => 'staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function the_staff_list_shows_the_most_recently_synced_device(): void
    {
        UserDevice::create([
            'user_id' => $this->staff->id, 'store_id' => $this->store->id,
            'device_id' => 'DRX-OLD', 'device_label' => 'Firefox on Linux',
            'last_synced_at' => now()->subDays(3),
        ]);
        UserDevice::create([
            'user_id' => $this->staff->id, 'store_id' => $this->store->id,
            'device_id' => 'DRX-NEW', 'device_label' => 'Chrome on Windows',
            'last_synced_at' => now()->subMinutes(5),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/users?account_type=staff&store_id={$this->store->id}");

        $response->assertStatus(200);
        $row = collect($response->json('data'))->firstWhere('id', $this->staff->id);
        $this->assertSame('Chrome on Windows', $row['lastSyncDevice']);
        $this->assertNotNull($row['lastSyncedAt']);
    }

    #[Test]
    public function a_staff_member_who_has_never_synced_shows_null_not_an_error(): void
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/users?account_type=staff&store_id={$this->store->id}");

        $response->assertStatus(200);
        $row = collect($response->json('data'))->firstWhere('id', $this->staff->id);
        $this->assertNull($row['lastSyncDevice']);
        $this->assertNull($row['lastSyncedAt']);
    }

    #[Test]
    public function the_devices_endpoint_lists_every_device_most_recent_first(): void
    {
        UserDevice::create([
            'user_id' => $this->staff->id, 'store_id' => $this->store->id,
            'device_id' => 'DRX-OLD', 'device_label' => 'Firefox on Linux',
            'last_synced_at' => now()->subDays(3),
        ]);
        UserDevice::create([
            'user_id' => $this->staff->id, 'store_id' => $this->store->id,
            'device_id' => 'DRX-NEW', 'device_label' => 'Chrome on Windows',
            'last_synced_at' => now()->subMinutes(5),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/users/{$this->staff->id}/devices");

        $response->assertStatus(200);
        $devices = $response->json('devices');
        $this->assertCount(2, $devices);
        $this->assertSame('Chrome on Windows', $devices[0]['deviceLabel']);
        $this->assertSame('Firefox on Linux', $devices[1]['deviceLabel']);
    }

    #[Test]
    public function a_device_with_no_label_falls_back_to_its_raw_id(): void
    {
        UserDevice::create([
            'user_id' => $this->staff->id, 'store_id' => $this->store->id,
            'device_id' => 'DRX-UNLABELED', 'device_label' => null,
            'last_synced_at' => now(),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/users/{$this->staff->id}/devices");

        $response->assertStatus(200);
        $this->assertSame('DRX-UNLABELED', $response->json('devices.0.deviceLabel'));
    }
}

<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\Sync\PeerSyncFreshnessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-211: GET /app/sync/peer-freshness tells a counting till which OTHER
 * devices in its store are behind, which only the server can know.
 */
class SyncPeerFreshnessTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

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

        $this->owner->update(['store_id' => $this->store->id]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();
    }

    private function device(string $deviceId, string $label, ?string $syncedAt, ?string $storeId = null, ?User $user = null): void
    {
        UserDevice::create([
            'user_id' => ($user ?? $this->owner)->id,
            'store_id' => $storeId ?? $this->store->id,
            'device_id' => $deviceId,
            'device_label' => $label,
            'last_synced_at' => $syncedAt,
        ]);
    }

    private function request(string $callingDeviceId = 'DRX-TILL-1')
    {
        return $this->actingAs($this->owner)
            ->withHeader('X-Device-Id', $callingDeviceId)
            ->withHeader('X-Store-Id', $this->store->id)
            ->getJson('/api/v1/app/sync/peer-freshness');
    }

    #[Test]
    public function it_reports_a_sibling_device_that_has_not_synced_recently(): void
    {
        $this->device('DRX-TILL-2', 'Till 2', now()->subHours(3)->toDateTimeString());

        $response = $this->request();

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'threshold_minutes' => PeerSyncFreshnessService::STALE_AFTER_MINUTES,
            ]);

        $stale = $response->json('stale_devices');
        $this->assertCount(1, $stale);
        $this->assertEquals('DRX-TILL-2', $stale[0]['device_id']);
        $this->assertEquals('Till 2', $stale[0]['device_label']);
        $this->assertGreaterThanOrEqual(170, $stale[0]['minutes_behind']);
    }

    #[Test]
    public function a_recently_synced_sibling_and_the_calling_device_are_never_reported(): void
    {
        $this->device('DRX-TILL-2', 'Till 2', now()->subMinutes(5)->toDateTimeString());
        $this->device('DRX-TILL-1', 'Till 1', now()->subDays(2)->toDateTimeString());

        $this->request()->assertStatus(200)->assertJson(['stale_devices' => []]);
    }

    #[Test]
    public function a_device_that_has_never_synced_is_reported_with_a_null_age(): void
    {
        $this->device('DRX-TILL-2', 'Till 2', null);

        $stale = $this->request()->assertStatus(200)->json('stale_devices');

        $this->assertCount(1, $stale);
        $this->assertNull($stale[0]['minutes_behind']);
        $this->assertNull($stale[0]['last_synced_at']);
    }

    #[Test]
    public function another_stores_device_is_never_reported(): void
    {
        $outsider = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $otherStore = Store::create([
            'user_id' => $outsider->id,
            'name' => 'Other Store',
            'store_slug' => 'other-store',
            'device_id' => 'WEB-OTHER',
        ]);

        $this->device('DRX-OTHER-1', 'Their Till', now()->subDays(2)->toDateTimeString(), $otherStore->id);

        $this->request()->assertStatus(200)->assertJson(['stale_devices' => []]);
    }

    #[Test]
    public function the_newest_row_for_a_device_decides_its_freshness(): void
    {
        $secondStaff = User::create([
            'first_name' => 'Second', 'last_name' => 'Staff',
            'email' => 'second@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);

        $this->device('DRX-TILL-2', 'Till 2', now()->subDays(2)->toDateTimeString());
        $this->device('DRX-TILL-2', 'Till 2', now()->subMinutes(2)->toDateTimeString(), null, $secondStaff);

        $this->request()->assertStatus(200)->assertJson(['stale_devices' => []]);
    }
}

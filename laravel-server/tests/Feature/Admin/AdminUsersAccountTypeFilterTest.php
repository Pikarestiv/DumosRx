<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Covers the owner-vs-staff split of GET /admin/users: the `account_type`
 * and `store_id` query params the admin panel's Platform Users list, the
 * Store Details page and the owner profile dialog all read through.
 *
 * "Owner" is stores.user_id (the store this user OWNS), "staff" is
 * users.store_id (the store this user works AT) — the same two relations
 * AdminUsersStoreResolutionTest documents.
 */
class AdminUsersAccountTypeFilterTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeStoreWithStaff(string $storeName, int $staffCount = 1): array
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => $storeName,
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $staff = collect(range(1, $staffCount))->map(fn ($i) => User::create([
            'first_name' => 'Staff'.$i,
            'last_name' => uniqid(),
            'email' => 'staff-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $store->id,
        ]));

        return [$owner, $store, $staff];
    }

    #[Test]
    public function account_type_owners_lists_store_owners_only_and_excludes_staff_and_platform_accounts()
    {
        [$owner, , $staff] = $this->makeStoreWithStaff('Pikarestiv Stores');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=owners');

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($owner->id, $ids);
        $this->assertNotContains($staff->first()->id, $ids);
        $this->assertNotContains($this->superAdmin->id, $ids);
        $this->assertSame(1, $response->json('meta.total'));
    }

    #[Test]
    public function account_type_staff_lists_staff_only()
    {
        [$owner, , $staff] = $this->makeStoreWithStaff('Pikarestiv Stores', 2);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=staff');

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing($staff->pluck('id')->all(), $ids);
        $this->assertNotContains($owner->id, $ids);
        $this->assertNotContains($this->superAdmin->id, $ids);
    }

    #[Test]
    public function account_type_platform_lists_accounts_with_no_store_affiliation_at_all()
    {
        [$owner, , $staff] = $this->makeStoreWithStaff('Pikarestiv Stores');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=platform');

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertSame([$this->superAdmin->id], $ids);
        $this->assertNotContains($owner->id, $ids);
        $this->assertNotContains($staff->first()->id, $ids);
    }

    #[Test]
    public function store_id_narrows_staff_to_that_stores_own_team()
    {
        [, $storeA, $staffA] = $this->makeStoreWithStaff('Store A', 2);
        [, , $staffB] = $this->makeStoreWithStaff('Store B', 3);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=staff&store_id='.$storeA->id);

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing($staffA->pluck('id')->all(), $ids);
        $this->assertNotContains($staffB->first()->id, $ids);
        $this->assertSame(2, $response->json('meta.total'));
    }

    #[Test]
    public function store_id_alone_covers_both_the_owner_and_the_staff_of_that_store()
    {
        [$owner, $store, $staff] = $this->makeStoreWithStaff('Store A');
        [$otherOwner] = $this->makeStoreWithStaff('Store B');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?store_id='.$store->id);

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$owner->id, $staff->first()->id], $ids);
        $this->assertNotContains($otherOwner->id, $ids);
    }

    #[Test]
    public function rows_carry_the_resolved_store_id_and_an_ownership_flag()
    {
        [$owner, $store, $staff] = $this->makeStoreWithStaff('Pikarestiv Stores');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users');

        $response->assertStatus(200);
        $rows = collect($response->json('data'));

        $ownerRow = $rows->firstWhere('id', $owner->id);
        $this->assertSame($store->id, $ownerRow['store_id']);
        $this->assertTrue($ownerRow['is_store_owner']);

        $staffRow = $rows->firstWhere('id', $staff->first()->id);
        $this->assertSame($store->id, $staffRow['store_id']);
        $this->assertFalse($staffRow['is_store_owner']);

        $platformRow = $rows->firstWhere('id', $this->superAdmin->id);
        $this->assertNull($platformRow['store_id']);
        $this->assertFalse($platformRow['is_store_owner']);
    }

    #[Test]
    public function account_type_combines_with_the_existing_role_and_search_filters()
    {
        [$owner] = $this->makeStoreWithStaff('Searchable Store');
        $this->makeStoreWithStaff('Other Store');

        $byRole = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=owners&role=sales_staff');
        $byRole->assertStatus(200);
        $this->assertCount(0, $byRole->json('data'));

        $bySearch = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=owners&search='.$owner->email);
        $bySearch->assertStatus(200);
        $this->assertCount(1, $bySearch->json('data'));
        $this->assertSame($owner->id, $bySearch->json('data.0.id'));
    }

    #[Test]
    public function omitting_account_type_still_returns_every_account()
    {
        [$owner, , $staff] = $this->makeStoreWithStaff('Pikarestiv Stores');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users');

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing(
            [$this->superAdmin->id, $owner->id, $staff->first()->id],
            $ids,
        );
    }

    #[Test]
    public function bulk_notify_honours_the_same_account_type_filter_the_list_was_showing()
    {
        [$owner, , $staff] = $this->makeStoreWithStaff('Pikarestiv Stores');

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/users/bulk-notify', [
                'title' => 'Scheduled maintenance',
                'message' => 'We will be offline briefly tonight.',
                'filters' => ['account_type' => 'owners'],
            ]);

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('count'));
        $this->assertDatabaseHas('notifications', ['user_id' => $owner->id]);
        $this->assertDatabaseMissing('notifications', ['user_id' => $staff->first()->id]);
        $this->assertDatabaseMissing('notifications', ['user_id' => $this->superAdmin->id]);
    }

    #[Test]
    public function an_unrecognized_account_type_is_rejected_rather_than_silently_ignored()
    {
        $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?account_type=everyone')
            ->assertStatus(422);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * CheckAccountStatus has to resolve a store through withTrashed(), otherwise
 * archiving a store makes its suspension invisible and every remaining
 * session behaves as if the account were in good standing.
 */
class ArchivedStoreAccessTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected User $staff;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Ada', 'last_name' => 'Owner',
            'email' => 'ada-archived@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'email_verified_at' => now(),
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Archived Store',
            'device_id' => 'DEV-ARCHIVE-001',
            'status' => 'Active',
        ]);

        $this->staff = User::create([
            'first_name' => 'Sam', 'last_name' => 'Staff',
            'email' => 'sam-archived@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
            'email_verified_at' => now(),
        ]);

        \Illuminate\Support\Facades\DB::table('users')
            ->whereIn('id', [$this->owner->id, $this->staff->id])
            ->update(['is_active' => true]);

        $this->owner->refresh();
        $this->staff->refresh();

        $this->withoutMiddleware([
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function a_suspended_stores_suspension_survives_archiving()
    {
        $this->store->forceFill([
            'status' => 'Suspended',
            'suspension_reason' => 'Unpaid invoices',
        ])->save();
        $this->store->delete();

        $this->actingAs($this->owner)
            ->getJson('/api/v1/user')
            ->assertStatus(403)
            ->assertJsonPath('message', 'ACCOUNT_SUSPENDED');

        $this->actingAs($this->staff)
            ->getJson('/api/v1/user')
            ->assertStatus(403)
            ->assertJsonPath('message', 'ACCOUNT_SUSPENDED');
    }

    #[Test]
    public function an_archived_store_is_cut_off_with_an_explicit_reason()
    {
        $this->store->delete();

        $this->actingAs($this->staff)
            ->getJson('/api/v1/user')
            ->assertStatus(403)
            ->assertJsonPath('message', 'STORE_ARCHIVED');

        $this->actingAs($this->owner)
            ->getJson('/api/v1/user')
            ->assertStatus(403)
            ->assertJsonPath('message', 'STORE_ARCHIVED');
    }

    #[Test]
    public function an_active_store_is_untouched_by_the_archived_store_check()
    {
        $this->actingAs($this->staff)
            ->getJson('/api/v1/user')
            ->assertStatus(200);
    }
}

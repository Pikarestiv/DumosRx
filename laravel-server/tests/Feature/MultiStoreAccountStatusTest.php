<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-76: CheckAccountStatus must decide per-request which store is being
 * acted on, so that suspending or archiving one store of a multi-store
 * account neither leaves that store usable nor locks the owner out of the
 * untouched siblings.
 */
class MultiStoreAccountStatusTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $storeA;

    protected Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Multi', 'last_name' => 'Owner',
            'email' => 'multi-store-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'email_verified_at' => now(),
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Branch A', 'device_id' => 'DEV-MULTI-A', 'status' => 'Active',
        ]);

        $this->storeB = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Branch B', 'device_id' => 'DEV-MULTI-B', 'status' => 'Active',
        ]);

        \Illuminate\Support\Facades\DB::table('users')
            ->where('id', $this->owner->id)
            ->update(['is_active' => true]);

        $this->owner->refresh();

        $this->withoutMiddleware([
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function callAs(?string $storeId)
    {
        $headers = $storeId ? ['X-Store-Id' => $storeId] : [];

        return $this->actingAs($this->owner)->getJson('/api/v1/user', $headers);
    }

    #[Test]
    public function suspending_one_store_blocks_requests_naming_that_store()
    {
        $this->storeA->forceFill(['status' => 'Suspended', 'suspension_reason' => 'Unpaid'])->save();

        $this->callAs($this->storeA->id)
            ->assertStatus(403)
            ->assertJsonPath('message', 'ACCOUNT_SUSPENDED');
    }

    #[Test]
    public function suspending_one_store_leaves_the_sibling_store_usable()
    {
        $this->storeA->forceFill(['status' => 'Suspended', 'suspension_reason' => 'Unpaid'])->save();

        $this->callAs($this->storeB->id)->assertStatus(200);
    }

    #[Test]
    public function archiving_one_store_does_not_lock_the_owner_out_of_the_other()
    {
        $this->storeB->delete();

        $this->callAs($this->storeA->id)->assertStatus(200);
        $this->callAs(null)->assertStatus(200);
    }

    #[Test]
    public function archiving_one_store_still_blocks_requests_naming_it()
    {
        $this->storeB->delete();

        $this->callAs($this->storeB->id)
            ->assertStatus(403)
            ->assertJsonPath('message', 'STORE_ARCHIVED');
    }

    #[Test]
    public function an_unnamed_request_is_blocked_only_when_every_store_is_suspended()
    {
        $this->storeA->forceFill(['status' => 'Suspended', 'suspension_reason' => 'Unpaid'])->save();

        $this->callAs(null)->assertStatus(200);

        $this->storeB->forceFill(['status' => 'Suspended', 'suspension_reason' => 'Unpaid'])->save();

        $this->callAs(null)
            ->assertStatus(403)
            ->assertJsonPath('message', 'ACCOUNT_SUSPENDED');
    }

    #[Test]
    public function an_unnamed_request_is_blocked_when_every_store_is_archived()
    {
        $this->storeA->delete();
        $this->storeB->delete();

        $this->callAs(null)
            ->assertStatus(403)
            ->assertJsonPath('message', 'STORE_ARCHIVED');
    }

    #[Test]
    public function a_store_id_the_caller_does_not_own_is_ignored()
    {
        $stranger = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other-multi-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'email_verified_at' => now(),
        ]);
        $foreign = Store::create([
            'user_id' => $stranger->id,
            'name' => 'Foreign', 'device_id' => 'DEV-MULTI-F', 'status' => 'Suspended',
            'suspension_reason' => 'Unpaid',
        ]);

        $this->callAs($foreign->id)->assertStatus(200);
    }

    #[Test]
    public function staff_of_a_suspended_store_are_still_blocked()
    {
        $this->storeA->forceFill(['status' => 'Suspended', 'suspension_reason' => 'Unpaid'])->save();

        $staff = User::create([
            'first_name' => 'Sam', 'last_name' => 'Staff',
            'email' => 'sam-multi@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->storeA->id,
            'email_verified_at' => now(),
        ]);
        \Illuminate\Support\Facades\DB::table('users')->where('id', $staff->id)->update(['is_active' => true]);

        $this->actingAs($staff->refresh())
            ->getJson('/api/v1/user')
            ->assertStatus(403)
            ->assertJsonPath('message', 'ACCOUNT_SUSPENDED');
    }
}

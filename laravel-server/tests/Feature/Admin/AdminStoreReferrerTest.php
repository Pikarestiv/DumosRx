<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminStoreReferrerTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected User $oldReferrer;

    protected User $newReferrer;

    protected User $owner;

    protected Store $store;

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

        $this->oldReferrer = User::create([
            'first_name' => 'Old',
            'last_name' => 'Referrer',
            'email' => 'old@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'agent',
        ]);

        $this->newReferrer = User::create([
            'first_name' => 'New',
            'last_name' => 'Referrer',
            'email' => 'new@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'referred_by_id' => $this->oldReferrer->id,
        ]);

        $this->store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $this->owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function a_super_admin_can_reassign_the_referrer(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertOk()
            ->assertJsonPath('referrer.id', $this->newReferrer->id);

        $this->assertSame(
            $this->newReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_can_clear_the_referrer(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => null,
            ])
            ->assertOk()
            ->assertJsonPath('referrer', null);

        $this->assertNull($this->owner->fresh()->referred_by_id);
    }

    #[Test]
    public function it_writes_an_audit_entry_naming_both_referrers(): void
    {
        $before = ActivityLog::count();

        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertOk();

        $this->assertSame($before + 1, ActivityLog::count());

        $log = ActivityLog::latest('id')->first();
        $this->assertSame('STORE_REFERRER_REASSIGNED', $log->action);
        $this->assertSame($this->superAdmin->id, $log->user_id);
        $this->assertStringContainsString($this->newReferrer->id, $log->description.json_encode($log->properties));
        $this->assertStringContainsString($this->oldReferrer->id, $log->description.json_encode($log->properties));
    }

    #[Test]
    public function it_refuses_to_make_the_owner_their_own_referrer(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->owner->id,
            ])
            ->assertStatus(422);

        $this->assertSame(
            $this->oldReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_accepts_a_reassignment_to_the_current_referrer_without_a_second_audit_entry(): void
    {
        $before = ActivityLog::count();

        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->oldReferrer->id,
            ])
            ->assertOk();

        $this->assertSame($before, ActivityLog::count());
        $this->assertSame($this->oldReferrer->id, $this->owner->fresh()->referred_by_id);
    }

    #[Test]
    public function it_rejects_an_unknown_referrer_id(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => 'not-a-real-user-id',
            ])
            ->assertStatus(422);

        $this->assertSame(
            $this->oldReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_rejects_a_non_super_admin(): void
    {
        $platformAdmin = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'platform@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $this->actingAs($platformAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertForbidden();

        $this->assertSame(
            $this->oldReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_never_rewrites_existing_referral_credit_rows(): void
    {
        $tables = ['referral_credit_transactions'];

        $snapshots = [];
        foreach ($tables as $table) {
            if (\Illuminate\Support\Facades\Schema::hasTable($table)) {
                $snapshots[$table] = \Illuminate\Support\Facades\DB::table($table)->get()->toJson();
            }
        }

        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertOk();

        foreach ($snapshots as $table => $before) {
            $this->assertSame(
                $before,
                \Illuminate\Support\Facades\DB::table($table)->get()->toJson(),
                "{$table} must be untouched by a referrer reassignment",
            );
        }

        $this->assertNotEmpty($snapshots, 'expected at least one referral table to exist');
    }
}

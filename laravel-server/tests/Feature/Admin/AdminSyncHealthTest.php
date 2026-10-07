<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSyncHealthTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = $this->makeAdmin('super_admin');

        $owner = User::create([
            'first_name' => 'Sync',
            'last_name' => 'Owner',
            'email' => 'sync-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Sync Store',
            'device_id' => 'SYNC-STORE',
            'currency' => 'NGN',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeAdmin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => ucfirst($role),
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function tally(int $accepted, int $refused, ?string $date = null): void
    {
        SyncHealthDaily::create([
            'store_id' => $this->store->id,
            'date' => $date ? \Illuminate\Support\Carbon::parse($date) : now()->startOfDay(),
            'pushes' => 1,
            'changes_accepted' => $accepted,
            'changes_refused' => $refused,
        ]);
    }

    private function failure(string $reason): void
    {
        SyncFailure::create([
            'store_id' => $this->store->id,
            'table_name' => 'customer_payments',
            'record_id' => 'rec-'.uniqid(),
            'operation' => 'INSERT',
            'reason' => $reason,
            'created_at' => now(),
        ]);
    }

    public function test_the_summary_reports_a_success_rate_from_the_daily_tally(): void
    {
        $this->tally(9, 1);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/sync/health');

        $response->assertOk();
        $this->assertSame('90%', $response->json('success_rate_today'));
    }

    public function test_the_summary_reports_null_when_nothing_has_synced(): void
    {
        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/sync/health');

        $response->assertOk();
        $this->assertNull($response->json('success_rate_today'));
        $this->assertNull($response->json('success_rate_7d'));
    }

    public function test_it_groups_failures_by_reason(): void
    {
        $this->failure('permission_denied');
        $this->failure('permission_denied');
        $this->failure('forbidden');

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/sync/health');

        $response->assertOk();
        $this->assertSame(2, $response->json('failures_by_reason.permission_denied'));
        $this->assertSame(1, $response->json('failures_by_reason.forbidden'));
    }

    public function test_it_names_the_worst_affected_stores(): void
    {
        $this->failure('forbidden');
        $this->failure('forbidden');

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/sync/health');

        $response->assertOk();
        $this->assertSame($this->store->id, $response->json('worst_stores.0.store_id'));
        $this->assertSame('Sync Store', $response->json('worst_stores.0.store_name'));
        $this->assertSame(2, $response->json('worst_stores.0.refused'));
    }

    public function test_a_store_drilldown_returns_its_failures_paginated_at_fifty(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->failure('forbidden');
        }

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/sync/stores/{$this->store->id}");

        $response->assertOk();
        $this->assertSame(50, $response->json('failures.meta.per_page'));
        $this->assertCount(50, $response->json('failures.data'));
        $this->assertSame(60, $response->json('failures.meta.total'));
    }

    public function test_a_store_that_has_never_synced_reports_null_rather_than_zero(): void
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/sync/stores/{$this->store->id}");

        $response->assertOk();
        $this->assertNull($response->json('last_sync_at'));
        $this->assertSame([], $response->json('daily'));
        $this->assertSame([], $response->json('failures.data'));
    }

    public function test_the_drilldown_returns_the_daily_series(): void
    {
        $this->tally(4, 1);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/sync/stores/{$this->store->id}");

        $response->assertOk();
        $this->assertSame(4, $response->json('daily.0.accepted'));
        $this->assertSame(1, $response->json('daily.0.refused'));
    }

    public function test_the_endpoints_are_refused_to_a_non_super_admin(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->actingAs($this->makeAdmin('platform_admin'))
            ->getJson('/api/v1/admin/sync/health')
            ->assertStatus(403);

        $this->actingAs($this->makeAdmin('platform_admin'))
            ->getJson("/api/v1/admin/sync/stores/{$this->store->id}")
            ->assertStatus(403);
    }
}

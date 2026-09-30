<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminStoreDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use RuntimeException;
use Tests\TestCase;

/**
 * The audit trail and the restore-time signals of the store lifecycle:
 * that the purge cannot commit without its STORE_PURGED row, that archive
 * and restore rows are attributed to the store they describe, and that a
 * restore tells the admin when the store comes back still suspended.
 */
class AdminStoreLifecycleAuditTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super-audit@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Ada', 'last_name' => 'Owner',
            'email' => 'ada-audit@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Audited Store',
            'device_id' => 'DEV-AUDIT-001',
            'status' => Store::STATUS_ACTIVE,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function a_failed_purge_audit_row_rolls_the_purge_itself_back()
    {
        ActivityLog::created(function (ActivityLog $log) {
            if ($log->action === 'STORE_PURGED') {
                throw new RuntimeException('audit log unavailable');
            }
        });

        try {
            app(AdminStoreDeletionService::class)->purgeStore($this->store->id, $this->superAdmin);
            $this->fail('The purge should have surfaced the audit-log failure.');
        } catch (RuntimeException $e) {
            $this->assertSame('audit log unavailable', $e->getMessage());
        }

        $this->assertDatabaseHas('stores', ['id' => $this->store->id]);
        $this->assertDatabaseHas('users', ['id' => $this->owner->id]);
    }

    #[Test]
    public function a_successful_purge_still_records_its_audit_row()
    {
        app(AdminStoreDeletionService::class)->purgeStore($this->store->id, $this->superAdmin);

        $this->assertDatabaseMissing('stores', ['id' => $this->store->id]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'STORE_PURGED',
            'user_id' => $this->superAdmin->id,
        ]);
    }

    #[Test]
    public function archive_and_restore_audit_rows_carry_the_store_they_describe()
    {
        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id, ['reason' => 'Created twice'])
            ->assertStatus(200);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'STORE_ARCHIVED',
            'store_id' => $this->store->id,
            'user_id' => $this->superAdmin->id,
        ]);

        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/stores/'.$this->store->id.'/restore')
            ->assertStatus(200);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'STORE_RESTORED',
            'store_id' => $this->store->id,
            'user_id' => $this->superAdmin->id,
        ]);
    }

    #[Test]
    public function restoring_a_store_that_was_suspended_before_archival_warns_the_admin()
    {
        $this->store->forceFill([
            'status' => Store::STATUS_SUSPENDED,
            'suspension_reason' => 'Chargeback investigation',
        ])->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id, ['reason' => 'Archived while suspended'])
            ->assertStatus(200);

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/stores/'.$this->store->id.'/restore');

        $response->assertStatus(200);
        $response->assertJson([
            'was_suspended' => true,
            'suspension_reason' => 'Chargeback investigation',
        ]);
        $this->assertNotNull($response->json('warning'));

        $description = (string) \Illuminate\Support\Facades\DB::table('activity_logs')
            ->where('action', 'STORE_RESTORED')
            ->value('description');

        $this->assertStringContainsString('suspended', strtolower($description));
        $this->assertStringContainsString('Chargeback investigation', $description);
    }

    #[Test]
    public function restoring_an_unsuspended_store_reports_no_suspension_warning()
    {
        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/stores/'.$this->store->id)
            ->assertStatus(200);

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/stores/'.$this->store->id.'/restore');

        $response->assertStatus(200);
        $response->assertJson(['was_suspended' => false]);
        $this->assertNull($response->json('warning'));
        $this->assertNull($response->json('suspension_reason'));
    }
}

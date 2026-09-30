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
 * The audit trail of the store lifecycle: the purge cannot commit without
 * its STORE_PURGED row, and archive/restore rows are attributed to the
 * store they describe.
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

}

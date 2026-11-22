<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminMaintenanceBackupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function superAdmin(): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'backup-admin-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
    }

    public function test_backup_status_reports_missing_configuration_without_failing(): void
    {
        config([
            'database_backup.bucket' => null,
            'database_backup.public_key' => null,
        ]);

        $response = $this->actingAs($this->superAdmin())
            ->getJson('/api/v1/admin/maintenance/backup');

        $response->assertOk()->assertJson([
            'configured' => false,
            'bucket_configured' => false,
            'public_key_configured' => false,
            'recent_backups' => [],
            'list_error' => null,
        ]);
    }

    public function test_running_backup_when_unconfigured_returns_422_diagnostic(): void
    {
        config([
            'database_backup.bucket' => null,
            'database_backup.public_key' => null,
        ]);

        $response = $this->actingAs($this->superAdmin())
            ->postJson('/api/v1/admin/maintenance/backup/run');

        $response->assertStatus(422)
            ->assertJson(['ok' => false]);
        $this->assertStringContainsString('R2_BACKUP_BUCKET', (string) $response->json('output'));
    }

    public function test_running_manual_backup_uploads_encrypted_dump_and_records_audit_log(): void
    {
        $keypair = sodium_crypto_box_keypair();
        $publicKey = sodium_crypto_box_publickey($keypair);
        Storage::fake('r2_backups');

        config([
            'database_backup.bucket' => 'dumosrx-db-backups',
            'database_backup.public_key' => base64_encode($publicKey),
            'database_backup.min_bytes' => 16,
        ]);

        $actor = $this->superAdmin();

        $response = $this->actingAs($actor)
            ->postJson('/api/v1/admin/maintenance/backup/run');

        $response->assertOk()->assertJson(['ok' => true]);
        $key = (string) $response->json('result.key');
        Storage::disk('r2_backups')->assertExists($key);
        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $actor->id,
            'action' => 'maintenance_backup_run',
            'record_id' => $key,
        ]);
        $this->assertNotEmpty($response->json('status_after.recent_backups'));
    }
}

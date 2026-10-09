<?php

namespace Tests\Feature\Admin;

use App\Models\SyncCommand;
use App\Models\User;
use App\Services\Admin\SyncCommandService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A super_admin asks one device, once, to send its own diagnostics report.
 * Exists because crash rows ride the sync queue, so a till whose push is
 * jammed stops reporting at the moment it has most to say.
 */
class SyncCommandDeviceReportTest extends TestCase
{
    use RefreshDatabase;

    private function service(): SyncCommandService
    {
        return app(SyncCommandService::class);
    }

    private function admin(): User
    {
        return User::create([
            'first_name' => 'Root',
            'last_name' => 'Admin',
            'email' => 'root-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
            'is_active' => true,
        ]);
    }

    public function test_a_device_report_command_can_be_issued(): void
    {
        $admin = $this->admin();
        $storeId = (string) \Illuminate\Support\Str::uuid();

        $command = $this->service()->issue(
            $storeId, 'till-7', 'send_device_report', null, null, $admin->id,
        );

        $this->assertSame('send_device_report', $command->action);
        $this->assertSame('pending', $command->status);
        $this->assertSame('till-7', $command->device_id);
    }

    public function test_a_row_scope_is_discarded_because_the_action_is_device_wide(): void
    {
        $admin = $this->admin();

        $command = $this->service()->issue(
            (string) \Illuminate\Support\Str::uuid(),
            'till-7',
            'send_device_report',
            'products',
            'p1',
            $admin->id,
        );

        // Carrying a table/record would imply a row scope the action does not
        // have, and would read as one in the activity log.
        $this->assertNull($command->table_name);
        $this->assertNull($command->record_id);
    }

    public function test_an_unknown_action_is_still_refused(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->issue(
            (string) \Illuminate\Support\Str::uuid(),
            'till-7',
            'wipe_everything',
            null,
            null,
            $this->admin()->id,
        );
    }

    public function test_issuing_it_is_recorded_against_the_admin(): void
    {
        $admin = $this->admin();
        $storeId = (string) \Illuminate\Support\Str::uuid();

        $this->service()->issue($storeId, 'till-7', 'send_device_report', null, null, $admin->id);

        $this->assertDatabaseHas('activity_logs', ['user_id' => $admin->id]);
    }
}

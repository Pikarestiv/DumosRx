<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminActivityService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActivityLogActorRoleFilterTest extends TestCase
{
    use RefreshDatabase;

    private AdminActivityService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->service = app(AdminActivityService::class);
    }

    public function test_filters_activity_logs_by_the_acting_users_role(): void
    {
        $agent = $this->makeUser('agent', Role::where('slug', 'agent')->value('id'));
        $superAdmin = $this->makeUser('super_admin', Role::where('slug', 'super_admin')->value('id'));

        ActivityLog::create(['user_id' => $agent->id, 'action' => 'TEST_AGENT_ACTION', 'description' => 'x', 'status' => 'success']);
        ActivityLog::create(['user_id' => $superAdmin->id, 'action' => 'TEST_SUPERADMIN_ACTION', 'description' => 'x', 'status' => 'success']);

        $result = $this->service->getActivityLogs(1, null, null, null, null, null, null, 'agent');

        $actions = collect($result['data'])->pluck('action')->all();
        $this->assertContains('TEST_AGENT_ACTION', $actions);
        $this->assertNotContains('TEST_SUPERADMIN_ACTION', $actions);
    }

    public function test_returns_every_role_when_no_role_filter_is_given(): void
    {
        $agent = $this->makeUser('agent', Role::where('slug', 'agent')->value('id'));
        $superAdmin = $this->makeUser('super_admin', Role::where('slug', 'super_admin')->value('id'));

        ActivityLog::create(['user_id' => $agent->id, 'action' => 'TEST_AGENT_UNFILTERED', 'description' => 'x', 'status' => 'success']);
        ActivityLog::create(['user_id' => $superAdmin->id, 'action' => 'TEST_ADMIN_UNFILTERED', 'description' => 'x', 'status' => 'success']);

        $result = $this->service->getActivityLogs(1, null, null, null, null, null, null, null);

        $actions = collect($result['data'])->pluck('action')->all();
        $this->assertContains('TEST_AGENT_UNFILTERED', $actions);
        $this->assertContains('TEST_ADMIN_UNFILTERED', $actions);
    }

    private function makeUser(string $role, ?string $roleId = null): User
    {
        $user = User::create([
            'first_name' => 'Test',
            'last_name' => ucfirst($role),
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
            'is_active' => true,
        ]);

        if ($roleId !== null) {
            $user->role_id = $roleId;
            $user->save();
        }

        return $user;
    }
}

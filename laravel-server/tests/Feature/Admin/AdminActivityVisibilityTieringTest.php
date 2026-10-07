<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Who may see whose actions.
 *
 * The log was readable in full by anyone holding `view_platform_data`, so a
 * platform_admin or agent could read every super_admin action — role changes,
 * subscription overrides, migrations. That is privileged operational detail,
 * not peer accountability.
 *
 * The tiering: an operator sees their own peer group (platform_admin, agent)
 * and their own actions; only super_admin sees super_admin actions. Showing
 * an operator *only* their own actions was considered and rejected — the
 * point of an audit log is noticing what somebody else did.
 */
class AdminActivityVisibilityTieringTest extends TestCase
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

    private function admin(string $role): User
    {
        return User::create([
            'first_name' => ucfirst($role),
            'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function actionBy(User $actor, string $action): ActivityLog
    {
        return ActivityLog::create([
            'user_id' => $actor->id,
            'action' => $action,
            'description' => "{$action} by {$actor->role}",
        ]);
    }

    private function visibleActions(User $viewer): array
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        return array_column(
            $this->actingAs($viewer)->getJson('/api/v1/admin/activity-logs')->assertOk()->json('data') ?? [],
            'action'
        );
    }

    public function test_a_platform_admin_cannot_see_super_admin_actions(): void
    {
        $this->actionBy($this->admin('super_admin'), 'SUPER_ONLY_ACTION');
        $peer = $this->admin('platform_admin');
        $this->actionBy($peer, 'PEER_ACTION');

        $actions = $this->visibleActions($peer);

        $this->assertContains('PEER_ACTION', $actions);
        $this->assertNotContains('SUPER_ONLY_ACTION', $actions);
    }

    /** Peer accountability is the point; it is not an own-actions-only view. */
    public function test_a_platform_admin_sees_another_platform_admins_actions(): void
    {
        $other = $this->admin('platform_admin');
        $this->actionBy($other, 'OTHER_PLATFORM_ADMIN_ACTION');
        $this->actionBy($this->admin('agent'), 'AGENT_ACTION');

        $actions = $this->visibleActions($this->admin('platform_admin'));

        $this->assertContains('OTHER_PLATFORM_ADMIN_ACTION', $actions);
        $this->assertContains('AGENT_ACTION', $actions);
    }

    public function test_an_agent_cannot_see_super_admin_actions_either(): void
    {
        $this->actionBy($this->admin('super_admin'), 'SUPER_ONLY_ACTION');

        $this->assertNotContains('SUPER_ONLY_ACTION', $this->visibleActions($this->admin('agent')));
    }

    public function test_a_super_admin_sees_everything(): void
    {
        $this->actionBy($this->admin('super_admin'), 'SUPER_ONLY_ACTION');
        $this->actionBy($this->admin('platform_admin'), 'PEER_ACTION');

        $actions = $this->visibleActions($this->admin('super_admin'));

        $this->assertContains('SUPER_ONLY_ACTION', $actions);
        $this->assertContains('PEER_ACTION', $actions);
    }

    /** A store owner's or staff member's own actions stay visible to operators. */
    public function test_store_level_actions_remain_visible_to_operators(): void
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->actionBy($owner, 'STORE_ACTION');

        $this->assertContains('STORE_ACTION', $this->visibleActions($this->admin('platform_admin')));
    }
}

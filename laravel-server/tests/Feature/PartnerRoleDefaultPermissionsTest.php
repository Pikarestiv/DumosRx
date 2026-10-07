<?php

namespace Tests\Feature;

use App\Models\Role;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What a partner can SEE on first login, with no per-user grant.
 *
 * The read-only platform surfaces are delegatable, but delegatable is not the
 * same as granted: `view_subscriptions` being available to hand out did not
 * put it in any role's default set, so a newly created Platform Admin logged
 * in and found the Subscriptions nav item missing. That reads as a broken
 * panel, not a deliberate boundary.
 *
 * The governing rule (owner's decision, 2026-10-07): restrict what an
 * operator can DO, not what they can SEE — withholding visibility mostly
 * makes them unable to help. So the read-only surfaces are defaults, and
 * everything that CHANGES something stays role-gated.
 *
 * Agent is deliberately narrower than Platform Admin. An agent is a recruited
 * field installer, not a partner: platform-wide revenue and the subscription
 * money worklists are not theirs to see, while sync health is, because it is
 * what tells them why a store they installed is not working.
 */
class PartnerRoleDefaultPermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Asserting against the seeder's output is the point: these defaults
        // are what a freshly seeded platform actually grants.
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    /** @return array<int, string> */
    private function permissionsOf(string $slug): array
    {
        $role = Role::where('slug', $slug)->firstOrFail();

        return $role->permissions->pluck('slug')->all();
    }

    public function test_a_platform_admin_sees_the_read_only_platform_surfaces_by_default(): void
    {
        $permissions = $this->permissionsOf('platform_admin');

        foreach (['view_platform_data', 'view_platform_health', 'view_platform_revenue', 'view_subscriptions'] as $expected) {
            $this->assertContains(
                $expected,
                $permissions,
                "A partner should not have to be granted $expected by hand before the panel is usable."
            );
        }
    }

    public function test_a_platform_admin_keeps_its_existing_action_permissions(): void
    {
        $permissions = $this->permissionsOf('platform_admin');

        foreach (['manage_platform', 'create_accounts', 'grant_trials', 'send_notifications',
                  'reset_user_passwords', 'manage_account_status', 'impersonate_store'] as $expected) {
            $this->assertContains($expected, $permissions, "Widening visibility must not drop $expected.");
        }
    }

    public function test_an_agent_sees_sync_health_but_not_platform_money(): void
    {
        $permissions = $this->permissionsOf('agent');

        $this->assertContains('view_platform_health', $permissions,
            'An installer needs to see why a store they set up is not syncing.');

        $this->assertNotContains('view_platform_revenue', $permissions,
            'Platform-wide revenue is not a recruited field agent\'s business.');
        $this->assertNotContains('view_subscriptions', $permissions,
            'The subscription worklists carry money data for every store, not just theirs.');
    }

    /** Visibility widened; the ability to comp an account did not. */
    public function test_an_agent_still_cannot_grant_trials_or_change_accounts(): void
    {
        $permissions = $this->permissionsOf('agent');

        foreach (['grant_trials', 'reset_user_passwords', 'manage_account_status', 'impersonate_store'] as $forbidden) {
            $this->assertNotContains($forbidden, $permissions,
                "Agent must not gain $forbidden: this change is about what they see, not what they can do.");
        }
    }

    /**
     * Anything that can hand out a permission must never be a default, or a
     * partner could quietly widen their own access.
     */
    public function test_no_partner_role_can_manage_roles_or_permissions(): void
    {
        foreach (['platform_admin', 'agent'] as $slug) {
            $permissions = $this->permissionsOf($slug);

            foreach (['manage_roles', 'manage_permissions', 'assign_permissions'] as $escalation) {
                $this->assertNotContains($escalation, $permissions, "$slug must not hold $escalation.");
            }
        }
    }
}

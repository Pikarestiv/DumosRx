<?php

namespace Tests\Feature;

use App\Models\Role;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleIsSystemColumnTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_defaults_is_system_to_true_for_existing_seeded_roles()
    {
        $superAdmin = Role::where('slug', 'super_admin')->first();
        $this->assertTrue($superAdmin->is_system);
    }

    public function test_allows_creating_a_custom_role_with_is_system_false()
    {
        $role = Role::create([
            'name' => 'Support Lead',
            'slug' => 'support_lead',
            'description' => 'Custom support lead role',
            'is_system' => false,
        ]);

        $this->assertFalse($role->fresh()->is_system);
    }
}

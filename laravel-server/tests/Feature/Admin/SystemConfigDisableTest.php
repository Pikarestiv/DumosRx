<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for "Disable Widget" in the superadmin Integrations tab
 * (IntegrationsTab::handleClear), which always 422'd. Root cause:
 * SystemConfigController::update validated 'value' => 'required', and
 * Laravel's `required` rule rejects an empty string — but disabling the
 * widget is exactly a PUT of value: "". Fixed to 'present', which only
 * requires the key to exist in the payload, not be non-empty.
 */
class SystemConfigDisableTest extends TestCase
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
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
    }

    public function test_setting_an_empty_string_value_succeeds_instead_of_422ing(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/smartsupp_key', ['value' => '']);

        $response->assertOk();
        $response->assertJson(['success' => true, 'data' => '']);
    }

    public function test_omitting_the_value_key_entirely_still_422s(): void
    {
        $response = $this->actingAs($this->superAdmin())
            ->putJson('/api/v1/admin/system-configs/smartsupp_key', []);

        $response->assertStatus(422);
    }
}

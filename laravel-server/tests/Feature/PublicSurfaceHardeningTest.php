<?php

namespace Tests\Feature;

use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * A-10. The three unauthenticated routes that sit outside every `throttle:*`
 * group: `GET /system-configs/{key}` (which used to hand back any stored key),
 * `POST /support` and `POST /logs/client-error`.
 *
 * Deliberately does NOT disable ThrottleRequests — the whole point of half
 * these cases is that the limiter is actually wired to the route. Same shape
 * as StorefrontThrottleTest, which exists for the same reason.
 */
class PublicSurfaceHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function routeFor(string $uri, string $method): \Illuminate\Routing\Route
    {
        $route = collect(Route::getRoutes()->getRoutes())
            ->first(fn ($r) => $r->uri() === $uri && in_array($method, $r->methods(), true));

        $this->assertNotNull($route, "No {$method} route registered for {$uri}");

        return $route;
    }

    // ---------------------------------------------------------------
    // System config allow-list
    // ---------------------------------------------------------------

    public function test_a_public_config_key_is_still_readable_without_auth()
    {
        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['active' => true]]]);

        $response = $this->getJson('/api/v1/system-configs/subscription_plans');

        $response->assertStatus(200);
        $this->assertSame(['tiers' => ['free' => ['active' => true]]], $response->json('data'));
    }

    public function test_a_non_public_config_key_is_not_readable_without_auth()
    {
        SystemConfig::setVal('referral_program', ['reward_amount' => 5000]);

        $response = $this->getJson('/api/v1/system-configs/referral_program');

        $response->assertStatus(404);
        $this->assertNull($response->json('data'));
        $this->assertStringNotContainsString('5000', $response->getContent());
    }

    public function test_an_unknown_config_key_is_not_readable_without_auth()
    {
        $response = $this->getJson('/api/v1/system-configs/some_future_admin_key');

        $response->assertStatus(404);
    }

    public function test_a_store_owner_token_does_not_unlock_a_non_public_key()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Config',
            'email' => 'config-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        SystemConfig::setVal('default_account_manager_id', 'user-123');

        $response = $this->actingAs($owner)
            ->getJson('/api/v1/system-configs/default_account_manager_id');

        $response->assertStatus(404);
    }

    public function test_a_super_admin_can_still_read_any_config_key()
    {
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Config',
            'email' => 'config-super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        SystemConfig::setVal('default_account_manager_id', 'user-123');

        $response = $this->actingAs($admin)
            ->getJson('/api/v1/system-configs/default_account_manager_id');

        $response->assertStatus(200);
        $this->assertSame('user-123', $response->json('data'));
    }

    // ---------------------------------------------------------------
    // Limiters
    // ---------------------------------------------------------------

    public function test_the_public_write_routes_carry_a_named_limiter()
    {
        $expected = [
            ['api/v1/support', 'POST', 'throttle:public-write'],
            ['api/v1/logs/client-error', 'POST', 'throttle:client-error-log'],
            ['api/v1/system-configs/{key}', 'GET', 'throttle:public-read'],
        ];

        foreach ($expected as [$uri, $method, $limiter]) {
            $this->assertContains(
                $limiter,
                $this->routeFor($uri, $method)->gatherMiddleware(),
                "{$method} {$uri} is missing {$limiter}.",
            );
        }
    }

    public function test_support_submission_returns_429_once_the_limiter_is_exhausted()
    {
        $payload = [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'subject' => 'Help',
            'message' => 'Something broke.',
        ];

        $sawThrottle = false;
        for ($i = 0; $i < 12; $i++) {
            if ($this->postJson('/api/v1/support', $payload)->status() === 429) {
                $sawThrottle = true;
                break;
            }
        }

        $this->assertTrue($sawThrottle, 'POST /support was never rate limited.');
    }

    public function test_client_error_logging_returns_429_once_the_limiter_is_exhausted()
    {
        $payload = [
            'method' => 'GET',
            'url' => 'https://api.dumosrx.com/api/v1/health',
            'message' => 'Network error',
        ];

        $sawThrottle = false;
        for ($i = 0; $i < 80; $i++) {
            if ($this->postJson('/api/v1/logs/client-error', $payload)->status() === 429) {
                $sawThrottle = true;
                break;
            }
        }

        $this->assertTrue($sawThrottle, 'POST /logs/client-error was never rate limited.');
    }

    // ---------------------------------------------------------------
    // Payload cap
    // ---------------------------------------------------------------

    public function test_an_oversized_client_error_details_payload_is_rejected()
    {
        $response = $this->postJson('/api/v1/logs/client-error', [
            'method' => 'GET',
            'url' => 'https://api.dumosrx.com/api/v1/health',
            'message' => 'Network error',
            'details' => ['blob' => str_repeat('A', 20000)],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('details');
    }

    public function test_an_oversized_client_error_message_is_rejected()
    {
        $response = $this->postJson('/api/v1/logs/client-error', [
            'method' => 'GET',
            'url' => 'https://api.dumosrx.com/api/v1/health',
            'message' => str_repeat('A', 5000),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
    }

    public function test_a_normal_client_error_report_is_still_accepted()
    {
        $response = $this->postJson('/api/v1/logs/client-error', [
            'method' => 'GET',
            'url' => 'https://api.dumosrx.com/api/v1/system-configs/subscription_plans',
            'status' => 500,
            'message' => 'Request failed with status code 500',
            'details' => ['attempt' => 1, 'offline' => false],
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'logged']);
    }
}

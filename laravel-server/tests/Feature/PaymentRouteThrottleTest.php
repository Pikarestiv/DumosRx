<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Deliberately does NOT disable ThrottleRequests, for the same reason
 * StorefrontThrottleTest doesn't. Covers PG-5 (the bank-account resolve
 * oracle) and PG-8 (unmetered payment webhooks).
 */
class PaymentRouteThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Throttle',
            'email' => 'pay-throttle-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Pay Throttle Store',
            'store_slug' => 'pay-throttle-store', 'device_id' => 'WEB-PAY-THROTTLE',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
        ]);
    }

    private function routeFor(string $uri, string $method): \Illuminate\Routing\Route
    {
        $route = collect(Route::getRoutes()->getRoutes())
            ->first(fn ($r) => $r->uri() === $uri && in_array($method, $r->methods(), true));

        $this->assertNotNull($route, "No {$method} route registered for {$uri}");

        return $route;
    }

    public function test_the_resolve_endpoint_carries_its_own_stricter_named_limiter()
    {
        $middleware = $this->routeFor('api/v1/stores/{store}/payment-account/resolve', 'POST')
            ->gatherMiddleware();

        $this->assertContains('throttle:bank-account-resolve', $middleware);
    }

    public function test_the_resolve_endpoint_is_rate_limited_well_below_sixty_a_minute()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
        ]);

        $attempts = 0;
        $throttledAt = null;
        while ($attempts < 40) {
            $attempts++;
            $response = $this->actingAs($this->owner)
                ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                    'account_number' => str_pad((string) $attempts, 10, '0', STR_PAD_LEFT),
                    'bank_code' => '058',
                    'country' => 'nigeria',
                ]);

            if ($response->status() === 429) {
                $throttledAt = $attempts;
                break;
            }
        }

        $this->assertNotNull($throttledAt, 'The resolve endpoint was never rate limited.');
        $this->assertLessThanOrEqual(
            15,
            $throttledAt,
            'The resolve limiter is too loose to close the name-lookup oracle.',
        );
    }

    public function test_the_payment_webhook_routes_carry_a_named_limiter()
    {
        foreach (['api/v1/webhooks/paystack', 'api/v1/webhooks/flutterwave'] as $uri) {
            $this->assertContains(
                'throttle:webhooks',
                $this->routeFor($uri, 'POST')->gatherMiddleware(),
                "POST {$uri} is missing throttle:webhooks.",
            );
        }
    }

    public function test_the_webhook_limiter_is_generous_enough_for_a_provider_burst()
    {
        $limiter = app(\Illuminate\Cache\RateLimiter::class)->limiter('webhooks');

        $this->assertNotNull($limiter, 'No `webhooks` rate limiter is registered.');

        $limit = $limiter(request());
        $this->assertGreaterThanOrEqual(
            200,
            $limit->maxAttempts,
            'The webhook limiter is tight enough to drop a legitimate provider replay.',
        );
    }
}

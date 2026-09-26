<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Deliberately does NOT disable ThrottleRequests, unlike
 * StorefrontControllerTest (which needs it off to make dozens of checkout
 * calls in one method). That's exactly why the missing limiters in
 * docs/STOREFRONT_REVIEW.md (SF-P1-3) were invisible to the suite: the public
 * storefront reads and the unauthenticated order-placement endpoint had no
 * limiter at all, and Laravel 11 applies no default `throttle:api` floor.
 */
class StorefrontThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Throttle',
            'email' => 'throttle-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $this->owner->id, 'name' => 'Throttle Store',
            'store_slug' => 'throttle-store', 'device_id' => 'WEB-THROTTLE',
            'online_store_enabled' => true,
        ]);
    }

    protected User $owner;

    private function routeFor(string $uri, string $method): \Illuminate\Routing\Route
    {
        $route = collect(Route::getRoutes()->getRoutes())
            ->first(fn ($r) => $r->uri() === $uri && in_array($method, $r->methods(), true));

        $this->assertNotNull($route, "No {$method} route registered for {$uri}");

        return $route;
    }

    public function test_order_placement_returns_429_once_the_limiter_is_exhausted()
    {
        $payload = [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => (string) \Illuminate\Support\Str::uuid(), 'quantity' => 1]],
        ];

        $sawThrottle = false;
        for ($i = 0; $i < 8; $i++) {
            $response = $this->postJson('/api/v1/storefront/throttle-store/checkout', $payload);
            if ($response->status() === 429) {
                $sawThrottle = true;
                break;
            }
        }

        $this->assertTrue($sawThrottle, 'Order placement was never rate limited.');
    }

    public function test_every_public_storefront_route_carries_a_named_limiter()
    {
        $expected = [
            ['api/v1/storefront-slugs', 'GET', 'throttle:storefront-read'],
            ['api/v1/storefront/{store_slug}', 'GET', 'throttle:storefront-read'],
            ['api/v1/storefront/{store_slug}/checkout', 'POST', 'throttle:storefront-order'],
            ['api/v1/storefront/{store_slug}/checkout/initialize', 'POST', 'throttle:storefront-checkout'],
        ];

        foreach ($expected as [$uri, $method, $limiter]) {
            $this->assertContains(
                $limiter,
                $this->routeFor($uri, $method)->gatherMiddleware(),
                "{$method} {$uri} is missing {$limiter}.",
            );
        }
    }
}

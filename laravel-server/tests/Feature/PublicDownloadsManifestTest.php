<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * A-94. The marketing Downloads page is anonymous, so its manifest source has
 * to be too - it used to call the super_admin-only admin endpoint.
 */
class PublicDownloadsManifestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::fake([
            'downloads.dumosrx.com/updater.json' => Http::response(['version' => 'v1.2.3'], 200),
            'downloads.dumosrx.com/*' => Http::response('', 200, ['Content-Length' => '1048576']),
        ]);
    }

    public function test_the_public_manifest_is_readable_without_authentication(): void
    {
        $response = $this->getJson('/api/v1/downloads/manifest');

        $response->assertStatus(200);
        $this->assertSame('v1.2.3', $response->json('version'));
        $this->assertTrue($response->json('platforms.windows.exists'));
        $this->assertSame(1048576, $response->json('platforms.windows.sizeBytes'));
        $this->assertStringContainsString('1.2.3', $response->json('platforms.macos.url'));
    }

    public function test_the_public_manifest_route_carries_a_named_limiter(): void
    {
        $route = Route::getRoutes()->getRoutes();
        $match = collect($route)->first(
            fn ($r) => $r->uri() === 'api/v1/downloads/manifest' && in_array('GET', $r->methods(), true)
        );

        $this->assertNotNull($match, 'No GET route registered for api/v1/downloads/manifest');
        $this->assertContains('throttle:public-read', $match->gatherMiddleware());
        $this->assertNotContains('auth:sanctum', $match->gatherMiddleware());
    }

    public function test_the_admin_manifest_stays_gated(): void
    {
        $response = $this->getJson('/api/v1/admin/downloads/manifest');

        $this->assertSame(401, $response->status());
    }

    public function test_the_public_manifest_is_cached_between_calls(): void
    {
        $this->getJson('/api/v1/downloads/manifest')->assertStatus(200);
        $this->getJson('/api/v1/downloads/manifest')->assertStatus(200);

        Http::assertSentCount(5);
    }
}

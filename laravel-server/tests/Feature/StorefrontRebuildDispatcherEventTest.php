<?php

namespace Tests\Feature;

use App\Services\Storefront\StorefrontRebuildDispatcher;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StorefrontRebuildDispatcherEventTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'dumos.github.token' => 'gh-test-token',
            'dumos.github.repo' => 'dumos/dumosrx',
        ]);
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
    }

    public function test_the_default_event_is_the_production_storefront_changed_event(): void
    {
        $this->assertNull(app(StorefrontRebuildDispatcher::class)->dispatch());

        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.github.com/repos/dumos/dumosrx/dispatches'
            && $request['event_type'] === 'storefront-changed');
    }

    public function test_the_configured_event_is_the_one_sent_to_github(): void
    {
        config(['dumos.github.storefront_event' => 'storefront-changed-dev']);

        $this->assertNull(app(StorefrontRebuildDispatcher::class)->dispatch());

        Http::assertSent(fn (Request $request) => $request['event_type'] === 'storefront-changed-dev');
        Http::assertNotSent(fn (Request $request) => $request['event_type'] === 'storefront-changed');
    }

    public function test_a_blank_configured_event_falls_back_to_the_production_event(): void
    {
        config(['dumos.github.storefront_event' => '']);

        $this->assertNull(app(StorefrontRebuildDispatcher::class)->dispatch());

        Http::assertSent(fn (Request $request) => $request['event_type'] === 'storefront-changed');
    }
}

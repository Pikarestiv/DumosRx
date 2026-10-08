<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * GET /admin/stores `demo` param, and its independence from `archived`.
 */
class AdminStoreDemoFilterTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeStore(string $name, bool $isDemo, bool $archived = false): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'name' => $name,
            'user_id' => $owner->id,
            'is_demo' => $isDemo,
            'device_id' => 'DEVICE-'.uniqid(),
        ]);

        if ($archived) {
            $store->delete();
        }

        return $store;
    }

    private function names(array $json): array
    {
        return collect($json['data'])->pluck('name')->sort()->values()->all();
    }

    #[Test]
    public function it_returns_every_store_when_no_demo_filter_is_given(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores');

        $response->assertOk();
        $this->assertSame(['Demo Pharmacy', 'Real Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_returns_only_demo_stores_for_demo_only(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores?demo=only');

        $response->assertOk();
        $this->assertSame(['Demo Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_excludes_demo_stores_for_demo_exclude(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores?demo=exclude');

        $response->assertOk();
        $this->assertSame(['Real Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_ignores_an_unrecognised_demo_value_rather_than_erroring(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores?demo=maybe');

        $response->assertOk();
        $this->assertSame(['Demo Pharmacy', 'Real Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_applies_the_demo_and_archived_filters_together(): void
    {
        $this->makeStore('Live Real', false);
        $this->makeStore('Live Demo', true);
        $this->makeStore('Archived Real', false, archived: true);
        $this->makeStore('Archived Demo', true, archived: true);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores?demo=only&archived=only');

        $response->assertOk();
        $this->assertSame(['Archived Demo'], $this->names($response->json()));
    }
}

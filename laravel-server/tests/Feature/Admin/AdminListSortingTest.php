<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminListSortingTest extends TestCase
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

    private function makeOwnerWithStore(string $first, string $last, string $storeName): Store
    {
        $owner = User::create([
            'first_name' => $first,
            'last_name' => $last,
            'email' => strtolower($first).'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'name' => $storeName,
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);
    }

    #[Test]
    public function it_sorts_stores_by_name_in_both_directions(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Zulu Pharmacy');
        $this->makeOwnerWithStore('Bola', 'Two', 'Alpha Pharmacy');
        $this->makeOwnerWithStore('Chidi', 'Three', 'Mike Pharmacy');

        $asc = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores?sort=name&direction=asc')
            ->json('data');
        $this->assertSame(
            ['Alpha Pharmacy', 'Mike Pharmacy', 'Zulu Pharmacy'],
            collect($asc)->pluck('name')->all(),
        );

        $desc = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores?sort=name&direction=desc')
            ->json('data');
        $this->assertSame(
            ['Zulu Pharmacy', 'Mike Pharmacy', 'Alpha Pharmacy'],
            collect($desc)->pluck('name')->all(),
        );
    }

    #[Test]
    public function it_sorts_users_by_name_across_first_then_last_name(): void
    {
        $this->makeOwnerWithStore('Ada', 'Zulu', 'Store A');
        $this->makeOwnerWithStore('Ada', 'Alpha', 'Store B');
        $this->makeOwnerWithStore('Bola', 'Alpha', 'Store C');

        $names = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/v1/admin/users?account_type=owners&sort=name&direction=asc')
                ->json('data'),
        )->pluck('name')->all();

        $this->assertSame(['Ada Alpha', 'Ada Zulu', 'Bola Alpha'], $names);
    }

    #[Test]
    public function it_sorts_users_by_email(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Store A');
        $this->makeOwnerWithStore('Bola', 'Two', 'Store B');

        $emails = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/v1/admin/users?account_type=owners&sort=email&direction=asc')
                ->json('data'),
        )->pluck('email')->all();

        $this->assertSame(collect($emails)->sort()->values()->all(), $emails);
    }

    #[Test]
    public function a_hostile_sort_value_falls_back_to_the_default_ordering(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Alpha Pharmacy');
        $this->makeOwnerWithStore('Bola', 'Two', 'Zulu Pharmacy');

        $hostile = [
            'name; DROP TABLE users',
            'users.password',
            '(SELECT 1)',
            'name,email',
            'NAME',
            str_repeat('a', 2000),
        ];

        foreach ($hostile as $value) {
            $stores = $this->actingAs($this->superAdmin)
                ->getJson('/api/v1/admin/stores?sort='.urlencode($value));
            $stores->assertOk();

            $users = $this->actingAs($this->superAdmin)
                ->getJson('/api/v1/admin/users?sort='.urlencode($value));
            $users->assertOk();
        }

        $this->assertNotNull(DB::table('users')->first(), 'users table must still exist');
        $this->assertSame(2, DB::table('stores')->count());
    }

    #[Test]
    public function an_array_sort_param_does_not_error(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Alpha Pharmacy');

        $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores?sort[]=name&sort[]=email')
            ->assertOk();

        $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?sort[]=name')
            ->assertOk();
    }

    #[Test]
    public function columns_computed_after_the_query_are_not_sortable(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Zulu Pharmacy');
        $this->makeOwnerWithStore('Bola', 'Two', 'Alpha Pharmacy');

        $byPlan = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/v1/admin/stores?sort=plan&direction=asc')
                ->json('data'),
        )->pluck('name')->all();

        $default = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/v1/admin/stores')
                ->json('data'),
        )->pluck('name')->all();

        $this->assertSame($default, $byPlan);
    }
}

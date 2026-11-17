<?php

namespace Tests\Feature\Admin;

use App\Models\AdminTillCode;
use App\Models\User;
use App\Services\Admin\AdminTillSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminTillCodeExpiryCompatTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private array $sqlSent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    }

    private function admin(string $role = 'platform_admin'): User
    {
        $user = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
            'is_active' => true,
        ]);

        $user->forceFill([
            'role_id' => \App\Models\Role::where('slug', $role)->value('id'),
        ])->save();

        return $user;
    }

    private function legacyCode(User $admin, string $code, string $label, int $daysOld): AdminTillCode
    {
        $this->travel(-$daysOld)->days();
        $row = AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make($code),
            'label' => $label,
        ]);
        $this->travelBack();

        return $row;
    }

    private function dropExpiresAt(): void
    {
        Schema::table('admin_till_codes', fn ($table) => $table->dropColumn('expires_at'));
    }

    public function test_every_till_code_path_works_before_the_expires_at_migration_has_run(): void
    {
        $this->dropExpiresAt();
        $admin = $this->admin();
        $service = app(AdminTillSessionService::class);
        DB::listen(function ($query) {
            if (str_contains($query->sql, 'admin_till_codes')) {
                $this->sqlSent[] = $query->sql;
            }
        });

        $issued = $this->actingAs($admin)
            ->postJson('/api/v1/admin/till-codes', ['label' => 'agidi'])
            ->assertOk();
        $this->assertSame($admin->id, $service->verify($admin->email, $issued->json('code'))?->id);

        $this->actingAs($admin)->getJson('/api/v1/admin/till-codes/mine')
            ->assertOk()
            ->assertJsonPath('codes.0.label', 'agidi');

        $this->actingAs($this->admin('super_admin'))->getJson('/api/v1/admin/till-codes/all')
            ->assertOk()
            ->assertJsonPath('codes.0.code', $issued->json('code'));

        $this->actingAs($admin)->deleteJson('/api/v1/admin/till-codes/'.$issued->json('id'))->assertOk();
        $this->assertSame(0, AdminTillCode::active()->where('admin_id', $admin->id)->count());

        $this->artisan('admin:till-code', ['email' => $admin->email])->assertExitCode(0);
        $this->artisan('admin:till-code', ['email' => $admin->email, '--revoke' => true])->assertExitCode(0);
        $this->assertSame(0, AdminTillCode::active()->where('admin_id', $admin->id)->count());

        $this->assertSame([], array_values(array_filter(
            $this->sqlSent,
            fn (string $sql) => str_contains($sql, 'expires_at'),
        )));
        $this->assertSame(
            now()->addDays(AdminTillSessionService::CODE_LIFETIME_DAYS)->toDateString(),
            substr((string) $issued->json('expires_at'), 0, 10),
        );
    }

    public function test_a_legacy_code_with_no_expiry_ages_out_a_lifetime_after_it_was_issued(): void
    {
        $admin = $this->admin();
        $service = app(AdminTillSessionService::class);
        $lifetime = AdminTillSessionService::CODE_LIFETIME_DAYS;

        $this->legacyCode($admin, '111111111111', 'fresh-legacy', $lifetime - 1);
        $this->legacyCode($admin, '222222222222', 'stale-legacy', $lifetime + 1);

        $this->assertSame($admin->id, $service->verify($admin->email, '111111111111')?->id);
        $this->assertNull($service->verify($admin->email, '222222222222'));

        $codes = $this->actingAs($admin)->getJson('/api/v1/admin/till-codes/mine')->assertOk()->json('codes');

        $this->assertSame(['fresh-legacy'], array_column($codes, 'label'));
        $this->assertSame(now()->addDay()->toDateString(), substr($codes[0]['expires_at'], 0, 10));
    }

    public function test_a_legacy_code_ages_out_the_same_way_before_the_migration_has_run(): void
    {
        $this->dropExpiresAt();
        $admin = $this->admin();
        $lifetime = AdminTillSessionService::CODE_LIFETIME_DAYS;

        $this->legacyCode($admin, '111111111111', 'fresh-legacy', $lifetime - 1);
        $this->legacyCode($admin, '222222222222', 'stale-legacy', $lifetime + 1);

        $revealed = $this->actingAs($this->admin('super_admin'))
            ->getJson('/api/v1/admin/till-codes/all')
            ->assertOk()
            ->json('codes');

        $this->assertSame(['fresh-legacy'], array_column($revealed, 'label'));
        $this->assertSame(now()->addDay()->toDateString(), substr($revealed[0]['expires_at'], 0, 10));
    }

    public function test_an_explicit_expiry_wins_over_the_legacy_age_rule(): void
    {
        $admin = $this->admin();
        $this->travel(-200)->days();
        AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make('333333333333'),
            'label' => 'old-but-extended',
            'expires_at' => now()->addDays(210),
        ]);
        $this->travelBack();

        $this->assertSame(['old-but-extended'], AdminTillCode::active()->pluck('label')->all());
    }
}

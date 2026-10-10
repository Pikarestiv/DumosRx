<?php

namespace Tests\Feature\App;

use App\Models\AdminTillCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminTillCodeCommandTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $role = 'platform_admin', ?string $email = null): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => $email ?? $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    public function test_issuing_a_code_stores_a_hash_and_a_recoverable_copy(): void
    {
        $admin = $this->admin('platform_admin', 'ops@dumosrx.com');

        $this->artisan('admin:till-code', ['email' => 'ops@dumosrx.com', '--label' => 'agidi'])
            ->assertExitCode(0);

        $row = AdminTillCode::where('admin_id', $admin->id)->firstOrFail();

        $this->assertSame('agidi', $row->label);
        $this->assertNotEmpty($row->code_hash);
        $this->assertNull($row->revoked_at);
        $this->assertSame(
            12,
            strlen(\Illuminate\Support\Facades\Crypt::decryptString($row->code_encrypted)),
        );
    }

    public function test_the_issued_code_is_twelve_digits_and_verifies_against_the_stored_hash(): void
    {
        $admin = $this->admin('platform_admin', 'ops@dumosrx.com');

        // Artisan::call, not $this->artisan: PendingCommand does not expose
        // the rendered output, and this test needs the printed code back.
        $exit = \Illuminate\Support\Facades\Artisan::call('admin:till-code', [
            'email' => 'ops@dumosrx.com',
        ]);
        $this->assertSame(0, $exit);

        $row = AdminTillCode::where('admin_id', $admin->id)->firstOrFail();

        // Recovered from the output rather than the row, so the assertion
        // proves the stored hash matches what the operator was shown.
        preg_match('/\b(\d{12})\b/', \Illuminate\Support\Facades\Artisan::output(), $matches);

        $this->assertNotEmpty($matches, 'the command must print a 12-digit code');
        $this->assertTrue(Hash::check($matches[1], $row->code_hash));
    }

    public function test_revoking_marks_every_active_code_for_that_admin(): void
    {
        $admin = $this->admin('platform_admin', 'ops@dumosrx.com');
        AdminTillCode::create(['admin_id' => $admin->id, 'code_hash' => Hash::make('111111111111')]);
        AdminTillCode::create(['admin_id' => $admin->id, 'code_hash' => Hash::make('222222222222')]);

        $this->artisan('admin:till-code', ['email' => 'ops@dumosrx.com', '--revoke' => true])
            ->assertExitCode(0);

        $this->assertSame(0, AdminTillCode::active()->where('admin_id', $admin->id)->count());
    }

    public function test_refuses_a_user_who_is_not_a_platform_admin(): void
    {
        $this->admin('store_owner', 'owner@shop.com');

        $this->artisan('admin:till-code', ['email' => 'owner@shop.com'])->assertExitCode(1);

        $this->assertSame(0, AdminTillCode::count());
    }

    public function test_refuses_an_unknown_email(): void
    {
        $this->artisan('admin:till-code', ['email' => 'nobody@dumosrx.com'])->assertExitCode(1);

        $this->assertSame(0, AdminTillCode::count());
    }

    public function test_a_super_admin_is_eligible(): void
    {
        $admin = $this->admin('super_admin', 'root@dumosrx.com');

        $this->artisan('admin:till-code', ['email' => 'root@dumosrx.com'])->assertExitCode(0);

        $this->assertSame(1, AdminTillCode::where('admin_id', $admin->id)->count());
    }

    public function test_the_command_still_issues_when_the_encrypted_column_is_missing(): void
    {
        \Illuminate\Support\Facades\Schema::table(
            'admin_till_codes',
            fn ($table) => $table->dropColumn('code_encrypted'),
        );

        $admin = $this->admin('platform_admin', 'ops@dumosrx.com');

        $this->artisan('admin:till-code', ['email' => 'ops@dumosrx.com'])
            ->assertExitCode(0);

        $row = AdminTillCode::where('admin_id', $admin->id)->firstOrFail();

        $this->assertNotEmpty($row->code_hash);
        $this->assertNull($row->revoked_at);
    }
}

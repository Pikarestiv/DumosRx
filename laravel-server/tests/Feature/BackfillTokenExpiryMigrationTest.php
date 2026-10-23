<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class BackfillTokenExpiryMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_tokens_without_an_expiry_get_created_at_plus_30_days_and_others_are_untouched()
    {
        $user = User::create([
            'first_name' => 'Owner', 'last_name' => 'A', 'email' => 'backfill-expiry@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $legacy = $user->createToken('Client App')->accessToken;
        $legacy->forceFill(['created_at' => '2026-09-01 08:30:00', 'expires_at' => null])->save();

        $rotated = $user->createToken('admin-refresh-rotated')->accessToken;
        $rotated->forceFill(['expires_at' => '2026-10-23 12:00:30'])->save();

        (require database_path('migrations/2026_10_23_000001_backfill_personal_access_token_expiry.php'))->up();

        $this->assertTrue(Carbon::parse('2026-10-01 08:30:00')->equalTo(PersonalAccessToken::find($legacy->id)->expires_at));
        $this->assertTrue(Carbon::parse('2026-10-23 12:00:30')->equalTo(PersonalAccessToken::find($rotated->id)->expires_at));
        $this->assertSame(0, PersonalAccessToken::whereNull('expires_at')->count());
    }
}

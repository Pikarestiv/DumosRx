<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class TillRelinkCodeTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-23 12:00:00');

        $this->owner = $this->makeUser('relink-owner@dumosrx.com', 'store_owner');
        $this->store = $this->makeStore($this->owner, 'relink-a');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeUser(string $email, string $role, array $extra = []): User
    {
        return User::create([
            'first_name' => 'T', 'last_name' => 'U', 'email' => $email,
            'password' => bcrypt('password'), 'role' => $role, 'is_active' => true,
            'email_verified_at' => now(),
        ] + $extra);
    }

    private function makeStore(User $owner, string $slug): Store
    {
        return Store::create([
            'user_id' => $owner->id, 'name' => "Store {$slug}",
            'store_slug' => $slug, 'device_id' => strtoupper($slug), 'status' => 'Active',
        ]);
    }

    private function generate(User $as, string $storeId, string $tokenName = 'web')
    {
        $token = $as->createToken($tokenName, ['*'], now()->addDay())->plainTextToken;
        $this->app['auth']->forgetGuards();

        return $this->withToken($token)->postJson('/api/v1/app/relink-code', ['store_id' => $storeId]);
    }

    private function issueCode(): string
    {
        return $this->generate($this->owner, $this->store->id)->assertOk()->json('code');
    }

    private function consume(string $code, ?string $storeId = null)
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders([
            'Authorization' => '',
            'X-Store-Id' => $storeId ?? $this->store->id,
            'X-Device-Label' => 'Chrome on Windows',
            'User-Agent' => 'RelinkTestAgent/1.0',
        ])->postJson('/api/v1/app/relink-code/consume', ['code' => $code]);
    }

    public function test_owner_generates_an_eight_character_unambiguous_code_valid_for_15_minutes()
    {
        $response = $this->generate($this->owner, $this->store->id)->assertOk();

        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{8}$/', $response->json('code'));
        $this->assertTrue(now()->addMinutes(15)->equalTo(Carbon::parse($response->json('expires_at'))));
    }

    public function test_staff_cannot_generate_a_code()
    {
        $staff = $this->makeUser('relink-staff@dumosrx.com', 'manager', ['store_id' => $this->store->id]);

        $this->generate($staff, $this->store->id)->assertForbidden();
    }

    public function test_another_owner_cannot_generate_a_code_for_a_store_they_do_not_own()
    {
        $other = $this->makeUser('relink-other@dumosrx.com', 'store_owner');
        $this->makeStore($other, 'relink-b');

        $this->generate($other, $this->store->id)->assertForbidden();
    }

    public function test_an_impersonation_session_cannot_generate_a_code()
    {
        $this->generate($this->owner, $this->store->id, 'Impersonation Token')->assertForbidden();
    }

    public function test_consume_mints_a_till_token_in_the_login_response_shape()
    {
        $code = $this->issueCode();

        $response = $this->consume(strtolower(" {$code} "))->assertOk();

        $response->assertJsonStructure(['message', 'user', 'token', 'role', 'require_email_verification']);
        $this->assertSame($this->owner->id, $response->json('user.id'));
        $this->assertArrayHasKey('effective_permissions', $response->json('user'));

        $token = PersonalAccessToken::findToken($response->json('token'));
        $this->assertSame('Client App', $token->name);
        $this->assertSame('RelinkTestAgent/1.0', $token->user_agent);
        $this->assertNotNull($token->ip_address);
        $this->assertTrue(now()->addDays(180)->equalTo($token->expires_at));

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $this->owner->id, 'store_id' => $this->store->id, 'action' => 'TILL_RELINKED',
        ]);
    }

    public function test_a_code_is_single_use()
    {
        $code = $this->issueCode();

        $this->consume($code)->assertOk();
        $this->consume($code)->assertStatus(422)->assertJson(['message' => 'Invalid or expired code.']);
    }

    public function test_a_code_whose_entry_is_read_twice_still_mints_only_one_token()
    {
        $code = $this->issueCode();
        $key = 'till_relink:'.hash('sha256', $code);
        $entry = \Illuminate\Support\Facades\Cache::get($key);

        $this->consume($code)->assertOk();
        \Illuminate\Support\Facades\Cache::put($key, $entry, now()->addMinutes(15));

        $this->consume($code)->assertStatus(422);
        $this->assertSame(1, PersonalAccessToken::where('name', 'Client App')->count());
    }

    public function test_issuing_a_code_is_audited_without_the_code()
    {
        $code = $this->issueCode();

        $log = \App\Models\ActivityLog::where('action', 'TILL_RELINK_CODE_ISSUED')->first();

        $this->assertNotNull($log);
        $this->assertSame($this->store->id, $log->store_id);
        $this->assertSame($this->owner->id, $log->user_id);
        $this->assertStringNotContainsString($code, json_encode($log->toArray()));
        $this->assertStringNotContainsString(hash('sha256', $code), json_encode($log->toArray()));
    }

    public function test_an_expired_code_is_rejected()
    {
        $code = $this->issueCode();
        Carbon::setTestNow(now()->addMinutes(16));

        $this->consume($code)->assertStatus(422);
    }

    public function test_a_code_for_another_store_is_rejected_generically_and_burned()
    {
        $code = $this->issueCode();
        $otherStore = $this->makeStore($this->makeUser('relink-x@dumosrx.com', 'store_owner'), 'relink-x');

        $wrong = $this->consume($code, $otherStore->id)->assertStatus(422);
        $unknown = $this->consume('ZZZZZZZZ')->assertStatus(422);

        $this->assertSame($unknown->json(), $wrong->json());
        $this->consume($code)->assertStatus(422);
    }

    public function test_a_suspended_store_is_refused()
    {
        $code = $this->issueCode();
        $this->store->forceFill(['status' => 'Suspended'])->save();

        $this->consume($code)->assertForbidden()->assertJson(['message' => 'ACCOUNT_SUSPENDED']);
        $this->assertSame(0, PersonalAccessToken::where('name', 'Client App')->count());
    }

    public function test_an_archived_store_is_refused()
    {
        $code = $this->issueCode();
        $this->store->delete();

        $this->consume($code)->assertForbidden()->assertJson(['message' => 'STORE_ARCHIVED']);
    }

    public function test_an_inactive_owner_is_refused()
    {
        $code = $this->issueCode();
        $this->owner->forceFill(['is_active' => false])->save();

        $this->consume($code)->assertForbidden()->assertJson(['message' => 'ACCOUNT_SUSPENDED']);
    }

    public function test_an_unverified_owner_is_refused_when_verification_is_required()
    {
        $code = $this->issueCode();
        SystemConfig::setVal('require_email_verification', true);
        $this->owner->forceFill(['email_verified_at' => null])->save();

        $this->consume($code)->assertForbidden()->assertJson(['error' => 'email_not_verified']);
    }

    public function test_consume_is_throttled_after_five_attempts_a_minute()
    {
        foreach (range(1, 5) as $_) {
            $this->consume('AAAAAAAA')->assertStatus(422);
        }

        $this->consume('AAAAAAAA')->assertStatus(429);
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\TillTokenRotator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class TillTokenRotationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'One', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
    }

    private function tillToken(): string
    {
        $issued = $this->owner->createToken('desktop');
        $issued->accessToken->forceFill(['device_id' => 'DRX-TILL-1'])->save();

        return $issued->plainTextToken;
    }

    private function asTill(string $method, string $uri, string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => "Bearer {$token}", 'User-Agent' => 'Till/1.0'])->json($method, $uri);
    }

    public function test_the_old_token_keeps_working_during_the_grace_window_and_the_new_one_works(): void
    {
        $old = $this->tillToken();
        $new = $this->asTill('POST', '/api/v1/refresh', $old)->assertOk()->json('token');

        $this->asTill('GET', '/api/v1/user', $old)->assertOk();
        $this->asTill('GET', '/api/v1/user', $new)->assertOk();
    }

    public function test_the_new_token_inherits_the_device_id_and_records_the_ip_and_user_agent(): void
    {
        $new = $this->asTill('POST', '/api/v1/refresh', $this->tillToken())->json('token');

        $token = PersonalAccessToken::findToken($new);
        $this->assertSame('DRX-TILL-1', $token->device_id);
        $this->assertSame('Till/1.0', $token->user_agent);
        $this->assertNotNull($token->ip_address);
    }

    public function test_the_old_token_stops_working_once_the_grace_window_passes(): void
    {
        $old = $this->tillToken();
        $this->asTill('POST', '/api/v1/refresh', $old)->assertOk();

        $this->travel(config('sanctum.till_rotation_grace_minutes') + 1)->minutes();

        $this->asTill('GET', '/api/v1/user', $old)->assertUnauthorized();
    }

    public function test_a_till_that_lost_the_refresh_response_can_refresh_again_from_the_old_token(): void
    {
        $old = $this->tillToken();
        $this->asTill('POST', '/api/v1/refresh', $old)->assertOk();

        $recovered = $this->asTill('POST', '/api/v1/refresh', $old)->assertOk()->json('token');

        $this->asTill('GET', '/api/v1/user', $recovered)->assertOk();
    }

    public function test_rotated_tokens_are_not_counted_as_active_sessions_or_listed(): void
    {
        $old = $this->tillToken();
        $new = $this->asTill('POST', '/api/v1/refresh', $old)->json('token');

        $this->assertSame(1, collect($this->asTill('GET', '/api/v1/sessions', $new)->assertOk()->json())->where('name', '!=', TillTokenRotator::ROTATED_NAME)->count());
        $this->assertSame(0, collect($this->asTill('GET', '/api/v1/sessions', $new)->json())->where('name', TillTokenRotator::ROTATED_NAME)->count());
    }

    public function test_expired_rotated_tokens_are_pruned_on_the_next_refresh(): void
    {
        $first = $this->asTill('POST', '/api/v1/refresh', $this->tillToken())->json('token');
        $this->travel(config('sanctum.till_rotation_grace_minutes') + 1)->minutes();
        $this->asTill('POST', '/api/v1/refresh', $first)->assertOk();

        $this->assertSame(1, PersonalAccessToken::where('name', TillTokenRotator::ROTATED_NAME)->count());
    }
}

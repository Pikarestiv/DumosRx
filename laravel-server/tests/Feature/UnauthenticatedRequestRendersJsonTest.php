<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for a Sentry-reported 500: an unauthenticated request
 * to a protected API route that doesn't send `Accept: application/json`
 * (curl's default wildcard Accept header, and some non-browser HTTP
 * clients) crashed with `RouteNotFoundException: Route [login] not defined`
 * instead of a
 * clean 401. This app is API-only — no "login" route exists anywhere — so
 * both of the framework's separate `route('login')` fallbacks (the
 * Authenticate middleware's redirect callback, and the default exception
 * Handler::unauthenticated()'s own fallback) needed to be overridden in
 * bootstrap/app.php.
 */
class UnauthenticatedRequestRendersJsonTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_without_accept_header_gets_json_401_not_500(): void
    {
        // Deliberately not using getJson()/withHeaders(['Accept' =>
        // 'application/json']) — the whole point is simulating a client
        // that never sends that header, which is what triggered the bug.
        $response = $this->get('/api/v1/admin/summary');

        $response->assertStatus(401);
        $response->assertJson(['message' => 'Unauthenticated.']);
    }
}

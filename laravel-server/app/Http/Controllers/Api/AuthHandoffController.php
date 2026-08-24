<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * One-time cross-origin auth handoff. dumosrx.com and app.dumosrx.com are
 * different origins with no shared localStorage, so a bearer token minted on
 * one can't just be read by JS on the other. `create` wraps an
 * already-possessed, already-valid token in a short-lived opaque code safe
 * to put in a redirect URL; `consume` redeems it exactly once. See
 * RestoreSessionTest for the same trust pattern (validate via
 * PersonalAccessToken::findToken, not raw string comparison).
 *
 * Credentials: both endpoints authenticate purely off the REQUEST BODY —
 * `create` off its `token` field, `consume` off its `code` field. Neither
 * reads or requires an `Authorization` header. `create` deliberately cannot
 * require header == body: impersonation legitimately mints a handoff code for
 * a token other than the caller's own (the impersonated user's), so tying the
 * mint to the caller's own bearer token would break it.
 */
class AuthHandoffController extends Controller
{
    private const TTL_SECONDS = 60;

    public function create(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string',
        ]);

        $accessToken = PersonalAccessToken::findToken($validated['token']);
        $user = $accessToken?->tokenable;

        if (!$user) {
            return response()->json(['error' => 'Invalid token.'], 403);
        }

        $code = Str::random(48);
        Cache::put("auth_handoff:{$code}", $validated['token'], self::TTL_SECONDS);

        return response()->json(['code' => $code, 'expires_in' => self::TTL_SECONDS]);
    }

    public function consume(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string',
        ]);

        // Cache::pull is atomic get-and-delete: the code is burned the instant
        // it's read, before any further validation below can fail and leave
        // it retryable.
        $token = Cache::pull("auth_handoff:{$validated['code']}");

        if (!$token) {
            return response()->json(['error' => 'Code expired or already used.'], 410);
        }

        $accessToken = PersonalAccessToken::findToken($token);
        $user = $accessToken?->tokenable;

        if (!$user) {
            return response()->json(['error' => 'Token no longer valid.'], 403);
        }

        return response()->json(['token' => $token, 'user' => $user]);
    }
}

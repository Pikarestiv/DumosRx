<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\FullAccessToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AuthHandoffController extends Controller
{
    private const TTL_SECONDS = 60;

    public function create(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string',
        ]);

        $accessToken = FullAccessToken::find($validated['token']);
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

        $token = Cache::pull("auth_handoff:{$validated['code']}");

        if (!$token) {
            return response()->json(['error' => 'Code expired or already used.'], 410);
        }

        $accessToken = FullAccessToken::find($token);
        $user = $accessToken?->tokenable;

        if (!$user) {
            return response()->json(['error' => 'Token no longer valid.'], 403);
        }

        return response()->json(['token' => $token, 'user' => $user->append('effective_permissions')]);
    }
}

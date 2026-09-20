<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\User;
use App\Services\SubscriptionService;
use App\Mail\NewDeviceLoginEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use Exception;
use OpenApi\Attributes as OA;

/**
 * Login/logout, token refresh, the cookie-backed admin session and the
 * authenticated-user lookup of AuthController.
 *
 * Extracted verbatim from AuthController purely to make that ~900-line file
 * navigable. It is a trait, NOT a separate controller, deliberately: every
 * AuthController route's middleware is assigned by route group in
 * routes/api.php (three different groups - throttle:auth,
 * throttle:session-refresh and the auth:sanctum protected group), so the
 * class name in those bindings must not change. Using traits keeps the
 * controller's identity, its route bindings and its middleware application
 * exactly as they were.
 */
trait AuthenticatesSessions
{
    #[OA\Post(
        path: '/login',
        summary: 'Log in and obtain a Sanctum bearer token',
        description: 'Also sets an HttpOnly `drx_admin_session` cookie when `device_name` is `"web"` or the user is `super_admin`. Sends a "new device" security email if this IP/user-agent combination hasn\'t been seen before for the account.',
        tags: ['Auth'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['email', 'password', 'device_name'],
            properties: [
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'password', type: 'string', format: 'password'),
                new OA\Property(property: 'device_name', type: 'string', description: 'Free-text device label; use "web" to also get the admin session cookie'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Logged in', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'user', type: 'object'),
                new OA\Property(property: 'token', type: 'string'),
                new OA\Property(property: 'role', type: 'string'),
                new OA\Property(property: 'require_email_verification', type: 'boolean'),
            ])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Invalid credentials or deactivated account (raised as a validation error on the `email` field).'),
        ],
    )]
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'device_name' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid credentials.'],
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['Account is deactivated.'],
            ]);
        }

        $user->last_login_at = now();
        $user->save();

        if (!$user->hasRole('super_admin')) {
            $subService = app(SubscriptionService::class);
            $owner = $subService->getSubscriptionOwner($user);
            $subService->enforceStaffLimits($owner);
        }

        $tokenResult = $user->createToken($request->device_name);
        $token = $tokenResult->plainTextToken;
        
        $tokenModel = $tokenResult->accessToken;
        $ipAddress = $request->ip();
        $userAgent = $request->userAgent();

        // Fingerprint check: Is this a completely new combination we haven't seen for this user?
        // Note: we don't alert on the very first token ever created (count == 0 before save)
        $priorTokensCount = $user->tokens()->count();
        $isNewDevice = false;

        if ($priorTokensCount > 1) {
            $isNewDevice = !$user->tokens()
                ->where('id', '!=', $tokenModel->id)
                ->where(function($query) use ($ipAddress, $userAgent) {
                    $query->where('ip_address', $ipAddress)
                          ->orWhere('user_agent', $userAgent); // Partial match avoids over-alerting
                })->exists();
        }

        $tokenModel->ip_address = $ipAddress;
        $tokenModel->user_agent = $userAgent;
        $tokenModel->save();

        // Dispatch security email if device is unrecognized. Best-effort:
        // authentication has already succeeded and the token is already
        // saved above, so a mail failure (bad address, SMTP rejection, etc.)
        // must not fail the whole login response. Previously unguarded, this
        // turned an undeliverable email on the account into a 500 on every
        // login from a new device, even though the user was in fact
        // authenticated (confirmed via Sentry: SMTP 550 "No Such User Here"
        // crashing the request past the point the token was already saved).
        if ($isNewDevice) {
            try {
                Mail::to($user->email)->send(
                    new NewDeviceLoginEmail($user, $userAgent, $ipAddress, now()->toDateTimeString())
                );
            } catch (Exception $e) {
                Log::error("Failed to send new-device login email to {$user->email}: " . $e->getMessage());
            }
        }

        $response = response()->json([
            'message' => 'Login successful',
            'user' => $user,
            'token' => $token,
            'role' => $user->role,
            'require_email_verification' => \App\Models\SystemConfig::getVal('require_email_verification', false) === true || \App\Models\SystemConfig::getVal('require_email_verification', false) === 'true'
        ]);

        if ($request->device_name === 'web') {
            // The browser admin panel never sees this token or stores it -
            // it exists only to let /admin/session/refresh mint a fresh
            // access token after a page reload (the access token itself
            // lives in JS memory only). Restricted to the 'refresh'
            // ability so it can't be used as a general bearer credential.
            $refreshToken = $user->createToken('admin-refresh', ['refresh'])->plainTextToken;
            $response->withCookie($this->buildAdminSessionCookie($request, $refreshToken));
        }

        return $response;
    }

    #[OA\Post(
        path: '/logout',
        summary: 'Revoke the current access token',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Logged out', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        $refreshTokenRaw = $request->cookie('drx_admin_session');
        if ($refreshTokenRaw) {
            PersonalAccessToken::findToken($refreshTokenRaw)?->delete();
        }

        return response()->json([
            'message' => 'Logged out successfully',
        ])->withCookie($this->forgetAdminSessionCookie($request));
    }

    #[OA\Post(
        path: '/refresh',
        summary: 'Rotate the current access token',
        description: 'Deletes the current token and issues a new one (also refreshes the `drx_admin_session` cookie).',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'New token issued', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'token', type: 'string'),
                new OA\Property(property: 'user', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function refresh(Request $request)
    {
        $user = $request->user();
        $user->currentAccessToken()->delete();
        $token = $user->createToken("web")->plainTextToken;

        return response()->json([
            "token" => $token,
            "user" => $user,
        ])->withCookie(cookie(
                    "drx_admin_session",
                    $token,
                    60 * 24,
                    "/",
                    $request->getHost() === "localhost" || filter_var($request->getHost(), FILTER_VALIDATE_IP) ? null : "." . implode(".", array_slice(explode(".", $request->getHost()), -2)),
                    $request->isSecure(),
                    true,
                    false,
                    $request->isSecure() ? "None" : "Lax"
                ));
    }

    #[OA\Post(
        path: '/admin/session/refresh',
        summary: 'Silently restore an admin browser session after a page reload',
        description: 'The admin panel keeps its access token in memory only (never localStorage), so it does not survive a reload. This reads the HttpOnly, SameSite=Strict `drx_admin_session` cookie directly - a token scoped to the `refresh` ability only, never a general bearer credential - and rotates it for a fresh access token + refresh cookie.',
        tags: ['Auth'],
        responses: [
            new OA\Response(response: 200, description: 'New access token issued', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'token', type: 'string'),
                new OA\Property(property: 'user', type: 'object'),
            ])),
            new OA\Response(response: 401, description: 'No/invalid/expired session', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
        ],
    )]
    public function refreshAdminSession(Request $request)
    {
        $raw = $request->cookie('drx_admin_session');
        if (!$raw) {
            return response()->json(['message' => 'No active session.'], 401);
        }

        $refreshToken = PersonalAccessToken::findToken($raw);
        if (!$refreshToken || !$refreshToken->can('refresh')) {
            return response()->json(['message' => 'Session expired.'], 401)
                ->withCookie($this->forgetAdminSessionCookie($request));
        }

        $user = $refreshToken->tokenable;
        if (!$user || !$user->is_active) {
            $refreshToken->delete();
            return response()->json(['message' => 'Session expired.'], 401)
                ->withCookie($this->forgetAdminSessionCookie($request));
        }

        // Rotate on every use: the old refresh token is single-use, limiting
        // the blast radius if it's ever intercepted.
        $refreshToken->delete();

        $accessToken = $user->createToken('web')->plainTextToken;
        $newRefreshToken = $user->createToken('admin-refresh', ['refresh'])->plainTextToken;

        return response()->json([
            'token' => $accessToken,
            'user' => $user,
        ])->withCookie($this->buildAdminSessionCookie($request, $newRefreshToken));
    }

    #[OA\Get(
        path: '/user',
        summary: 'Get the currently authenticated user',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'The user', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function user(Request $request)
    {
        return $request->user();
    }

    private function adminSessionCookieDomain(Request $request): ?string
    {
        return $request->getHost() === 'localhost' || filter_var($request->getHost(), FILTER_VALIDATE_IP)
            ? null
            : '.' . implode('.', array_slice(explode('.', $request->getHost()), -2));
    }

    private function buildAdminSessionCookie(Request $request, string $value)
    {
        return cookie(
            'drx_admin_session',
            $value,
            60 * 24,
            '/',
            $this->adminSessionCookieDomain($request),
            $request->isSecure(),
            true, // httpOnly
            false,
            // Strict: this cookie now only ever needs to be sent to our own
            // /admin/session/refresh endpoint from our own admin panel, so
            // it never needs to travel cross-site. Closes off the CSRF-shaped
            // hole the old SameSite=None + global cookie-to-header promotion
            // combination left open.
            'Strict'
        );
    }

    private function forgetAdminSessionCookie(Request $request)
    {
        return cookie(
            'drx_admin_session',
            '',
            -1,
            '/',
            $this->adminSessionCookieDomain($request),
            $request->isSecure(),
            true,
            false,
            'Strict'
        );
    }
}

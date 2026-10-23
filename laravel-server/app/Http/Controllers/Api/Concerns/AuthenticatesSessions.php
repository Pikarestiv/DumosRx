<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Http\Controllers\Concerns\ManagesAdminSessionCookie;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\TokenLifetime;
use App\Mail\NewDeviceLoginEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use Exception;
use OpenApi\Attributes as OA;

trait AuthenticatesSessions
{
    use ManagesAdminSessionCookie;

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

        if (!$user || $user->password === null || $user->password === '' || !Hash::check($request->password, $user->password)) {
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

        $tokenResult = $user->createToken($request->device_name, ['*'], TokenLifetime::forLogin($user, $request->device_name));
        $token = $tokenResult->plainTextToken;

        $tokenModel = $tokenResult->accessToken;
        $ipAddress = $request->ip();
        $userAgent = $request->userAgent();

        $priorTokensCount = $user->tokens()->count();
        $isNewDevice = false;

        if ($priorTokensCount > 1) {
            $isNewDevice = !$user->tokens()
                ->where('id', '!=', $tokenModel->id)
                ->where(function($query) use ($ipAddress, $userAgent) {
                    $query->where('ip_address', $ipAddress)
                          ->orWhere('user_agent', $userAgent);
                })->exists();
        }

        $tokenModel->ip_address = $ipAddress;
        $tokenModel->user_agent = $userAgent;
        $tokenModel->save();

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
            'user' => $user->append('effective_permissions'),
            'token' => $token,
            'role' => $user->role,
            'require_email_verification' => \App\Http\Middleware\EnsureEmailIsVerified::isRequired(),
        ]);

        if ($request->device_name === 'web') {
            $refreshToken = $user->createToken('admin-refresh', ['refresh'], TokenLifetime::admin())->plainTextToken;
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
        description: "Deletes the current token and issues a new one. This is client/'s bearer-token-only flow (see token-manager.ts's refreshTokenSilently) — it does not touch the drx_admin_session cookie; that belongs entirely to /admin/session/refresh's separate, ability-scoped refresh-cookie flow.",
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
        $token = $user->createToken('web', ['*'], TokenLifetime::forUser($user))->plainTextToken;

        return response()->json([
            "token" => $token,
            "user" => $user->append('effective_permissions'),
        ]);
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

        if (!$refreshToken || $this->adminRefreshTokenGraceHasLapsed($refreshToken)) {
            return response()->json(['message' => 'Session expired.'], 401);
        }

        if (!$refreshToken->can('refresh')) {
            return response()->json(['message' => 'Session expired.'], 401)
                ->withCookie($this->forgetAdminSessionCookie($request));
        }

        $user = $refreshToken->tokenable;
        if (!$user || !$user->is_active) {
            $refreshToken->delete();
            return response()->json(['message' => 'Session expired.'], 401)
                ->withCookie($this->forgetAdminSessionCookie($request));
        }

        if ($this->adminRefreshTokenWasRotated($refreshToken)) {
            return response()->json([
                'token' => $user->createToken('web', ['*'], TokenLifetime::admin())->plainTextToken,
                'user' => $user->append('effective_permissions'),
            ]);
        }

        $this->rotateAdminRefreshToken($refreshToken);

        $accessToken = $user->createToken('web', ['*'], TokenLifetime::admin())->plainTextToken;
        $newRefreshToken = $user->createToken('admin-refresh', ['refresh'], TokenLifetime::admin())->plainTextToken;

        return response()->json([
            'token' => $accessToken,
            'user' => $user->append('effective_permissions'),
        ])->withCookie($this->buildAdminSessionCookie($request, $newRefreshToken));
    }

    private function adminRefreshRotationGraceSeconds(): int
    {
        return 30;
    }

    private function rotateAdminRefreshToken(PersonalAccessToken $refreshToken): void
    {
        $refreshToken->forceFill([
            'name' => 'admin-refresh-rotated',
            'expires_at' => now()->addSeconds($this->adminRefreshRotationGraceSeconds()),
        ])->save();

        PersonalAccessToken::where('tokenable_type', $refreshToken->tokenable_type)
            ->where('tokenable_id', $refreshToken->tokenable_id)
            ->where('name', 'admin-refresh-rotated')
            ->where('expires_at', '<', now())
            ->delete();
    }

    private function adminRefreshTokenWasRotated(PersonalAccessToken $refreshToken): bool
    {
        return $refreshToken->name === 'admin-refresh-rotated';
    }

    private function adminRefreshTokenGraceHasLapsed(PersonalAccessToken $refreshToken): bool
    {
        return $refreshToken->expires_at !== null && $refreshToken->expires_at->isPast();
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
}

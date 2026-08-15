<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Role;
use App\Models\Store;
use App\Models\Notification;
use App\Models\ActivityLog;
use App\Services\SubscriptionService;
use App\Mail\WelcomeEmail;
use App\Mail\NewDeviceLoginEmail;
use App\Mail\PasswordResetEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Exception;
use OpenApi\Attributes as OA;

class AuthController extends Controller
{
    #[OA\Post(
        path: '/register',
        summary: 'Register a new user (optionally creating a store)',
        description: 'If `store_name` is provided, creates the user as a `store_owner` with a new store and a trial subscription. Otherwise creates a bare user account (e.g. a staff/specialist added later to a store). Returns a Sanctum token immediately unless email verification is required platform-wide.',
        tags: ['Auth'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['first_name', 'last_name', 'email', 'password'],
            properties: [
                new OA\Property(property: 'first_name', type: 'string'),
                new OA\Property(property: 'last_name', type: 'string'),
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'username', type: 'string', nullable: true),
                new OA\Property(property: 'pin', type: 'string', nullable: true, description: '4-digit POS unlock PIN'),
                new OA\Property(property: 'password', type: 'string', format: 'password', minLength: 8),
                new OA\Property(property: 'store_name', type: 'string', nullable: true, description: 'If set, a Store + trial subscription is created for this user'),
                new OA\Property(property: 'store_type', type: 'string', nullable: true, enum: ['pharmacy', 'supermarket', 'grocery', 'general']),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'ref', type: 'string', nullable: true, description: 'Referral code'),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Registered', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'user', type: 'object'),
                new OA\Property(property: 'token', type: 'string'),
            ])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function register(Request $request)
    {
        $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'username' => 'nullable|string|max:255|unique:users',
            'pin' => 'nullable|string|size:4',
            'password' => 'required|string|min:8',
            'store_name' => 'nullable|string|max:255',
            'store_type' => 'nullable|string|in:pharmacy,supermarket,grocery,general',
            'phone' => 'nullable|string|max:20',
            'ref' => 'nullable|string',
            'referrer' => 'nullable|string',
            'agent_ref' => 'nullable|string',
        ]);

        $referredById = null;
        $refCode = $request->ref ?? $request->referrer;
        if (!empty($refCode)) {
            $referrerUser = User::where('referral_code', $refCode)
                ->orWhere('username', $refCode)
                ->first();
            if ($referrerUser) {
                $referredById = $referrerUser->id;
            }
        }

        // Separate from the customer referral program above — attributes this
        // signup to the platform staff member (super_admin/platform_admin/agent)
        // whose link they used, tracked via registered_by_id rather than
        // referred_by_id so it can never surface in customer-facing referral UI
        // or credit logic.
        $registeredById = null;
        if (!empty($request->agent_ref)) {
            $agentUser = User::where('platform_referral_code', $request->agent_ref)->first();
            if ($agentUser) {
                $registeredById = $agentUser->id;
            }
        }

        $roleSlug = $request->filled('store_name') ? 'store_owner' : ($request->role ?? 'specialist');
        $roleObj = Role::where('slug', $roleSlug)->first();

        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'phone' => $request->phone,
            'username' => $request->username,
            'pin' => $request->pin,
            'password' => Hash::make($request->password),
            'role' => $roleSlug,
            'role_id' => $roleObj ? $roleObj->id : null,
            'is_active' => true,
            'referred_by_id' => $referredById,
            'registered_by_id' => $registeredById,
        ]);

        if ($request->filled('store_name')) {
            Store::create([
                'user_id' => $user->id,
                'name' => $request->store_name,
                'store_type' => $request->store_type ?? 'pharmacy',
                'device_id' => 'WEB-' . strtoupper(Str::random(8)),
                'auto_sync_enabled' => true,
            ]);

            // Create trial subscription
            app(SubscriptionService::class)->createTrial($user);

            $requireVerification = \App\Models\SystemConfig::getVal('require_email_verification', false) === true || \App\Models\SystemConfig::getVal('require_email_verification', false) === 'true';

            // Send Welcome Email if verification is NOT required
            if (!$requireVerification) {
                try {
                    Mail::to($user->email)->send(new WelcomeEmail($user, $request->store_name));
                } catch (Exception $e) {
                    Log::error("Failed to send welcome email: " . $e->getMessage());
                }
            }

            // Send Super Admin Alert
            try {
                \App\Services\AdminAlertService::send(
                    'New Registration: ' . $request->store_name,
                    [
                        "A new user has just registered on DumosRx.",
                        "Name: {$user->first_name} {$user->last_name}",
                        "Email: {$user->email}",
                        "Phone: {$user->phone}",
                        "Store Name: {$request->store_name}",
                        "Referred By: " . ($refCode ?? 'None')
                    ]
                );
            } catch (Exception $e) {
                Log::error("Failed to send super admin alert: " . $e->getMessage());
            }
        }

        if ($requireVerification) {
            $verifyToken = Str::random(64);
            DB::table('email_verification_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => Hash::make($verifyToken), 'created_at' => now()]
            );
            $verificationUrl = config('app.frontend_url', 'https://dumosrx.com') . "/verify-email?token=$verifyToken&email=" . urlencode($user->email);
            try {
                Mail::to($user->email)->send(new \App\Mail\EmailVerificationMail($user, $verificationUrl));
            } catch (Exception $e) {
                Log::error("Failed to send verification email: " . $e->getMessage());
            }
        } else {
            $user->email_verified_at = now();
            $user->save();
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'User registered successfully',
            'user' => $user,
            'token' => $token,
        ], 201);
    }

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

        // Dispatch security email if device is unrecognized
        if ($isNewDevice) {
            Mail::to($user->email)->send(
                new NewDeviceLoginEmail($user, $userAgent, $ipAddress, now()->toDateTimeString())
            );
        }

        $response = response()->json([
            'message' => 'Login successful',
            'user' => $user,
            'token' => $token,
            'role' => $user->role,
            'require_email_verification' => \App\Models\SystemConfig::getVal('require_email_verification', false) === true || \App\Models\SystemConfig::getVal('require_email_verification', false) === 'true'
        ]);

        if ($request->device_name === 'web' || $user->hasRole('super_admin')) {
            // Set an HttpOnly cookie for admin sessions
            // expire in 24 hours
            $response->withCookie(cookie(
                'drx_admin_session',
                $token,
                60 * 24,
                '/',
                $request->getHost() === 'localhost' || filter_var($request->getHost(), FILTER_VALIDATE_IP) ? null : '.' . implode('.', array_slice(explode('.', $request->getHost()), -2)),
                $request->isSecure(), // secure
                true, // httpOnly
                false,
                $request->isSecure() ? 'None' : 'Lax'
            ));
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

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

    #[OA\Post(
        path: '/verify-email',
        summary: 'Verify an account email address via token',
        description: 'Token is emailed to the user as part of `EmailVerificationMail`. Works whether or not the caller is authenticated (falls back to looking up the user by email).',
        tags: ['Auth'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['token', 'email'],
            properties: [
                new OA\Property(property: 'token', type: 'string'),
                new OA\Property(property: 'email', type: 'string', format: 'email'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Verified', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 400, description: 'Invalid or expired link', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function verifyEmail(Request $request)
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
        ]);

        $record = DB::table('email_verification_tokens')->where('email', $request->email)->first();

        if (!$record || !Hash::check($request->token, $record->token)) {
            return response()->json(['message' => 'Invalid or expired verification link.'], 400);
        }

        $user = $request->user();
        if (!$user) {
            $user = User::where('email', $request->email)->first();
        }

        if ($user) {
            $user->email_verified_at = now();
            $user->save();
            DB::table('email_verification_tokens')->where('email', $request->email)->delete();

            // Send Welcome Email upon successful verification
            try {
                $storeName = $user->store ? $user->store->name : 'DumosRx';
                Mail::to($user->email)->send(new \App\Mail\WelcomeEmail($user, $storeName));
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to send welcome email after verification: " . $e->getMessage());
            }

            return response()->json(['message' => 'Email verified successfully.', 'user' => $user]);
        }

        return response()->json(['message' => 'User not found.'], 404);
    }

    #[OA\Post(
        path: '/resend-verification',
        summary: 'Resend the email verification link',
        description: 'Uses the authenticated user if present, otherwise requires `email` in the body.',
        tags: ['Auth'],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Sent', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 400, description: 'Already verified', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function resendVerification(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            $request->validate(['email' => 'required|email']);
            $user = User::where('email', $request->email)->first();
        }

        if (!$user) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        if ($user->email_verified_at) {
            return response()->json(['message' => 'Email is already verified.'], 400);
        }

        $verifyToken = Str::random(64);
        DB::table('email_verification_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => Hash::make($verifyToken), 'created_at' => now()]
        );
        $verificationUrl = config('app.frontend_url', 'https://dumosrx.com') . "/verify-email?token=$verifyToken&email=" . urlencode($user->email);
        try {
            Mail::to($user->email)->send(new \App\Mail\EmailVerificationMail($user, $verificationUrl));
            return response()->json(['message' => 'Verification email sent.']);
        } catch (Exception $e) {
            Log::error("Failed to send verification email: " . $e->getMessage());
            return response()->json(['message' => 'Failed to send verification email.'], 500);
        }
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

    #[OA\Post(
        path: '/profile/update',
        summary: "Update the authenticated user's name/phone",
        tags: ['Auth'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['first_name', 'last_name'],
            properties: [
                new OA\Property(property: 'first_name', type: 'string'),
                new OA\Property(property: 'last_name', type: 'string'),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'user', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:20',
        ]);

        $user->update($request->only('first_name', 'last_name', 'phone'));

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user,
        ]);
    }

    #[OA\Post(
        path: '/profile/set-pin',
        summary: "Set/update the authenticated user's 4-digit POS unlock PIN",
        tags: ['Auth'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['pin'],
            properties: [new OA\Property(property: 'pin', type: 'string', minLength: 4, maxLength: 4)],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function updatePin(Request $request)
    {
        $user = $request->user();
        $request->validate([
            'pin' => 'required|string|size:4',
        ]);

        $user->pin = $request->pin;
        $user->save();

        return response()->json([
            'message' => 'PIN updated successfully',
        ]);
    }

    #[OA\Post(
        path: '/profile/change-password',
        summary: "Change the authenticated user's password",
        tags: ['Auth'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['current_password', 'new_password', 'new_password_confirmation'],
            properties: [
                new OA\Property(property: 'current_password', type: 'string', format: 'password'),
                new OA\Property(property: 'new_password', type: 'string', format: 'password', minLength: 8),
                new OA\Property(property: 'new_password_confirmation', type: 'string', format: 'password'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Current password mismatch, or new password fails rules.'),
        ],
    )]
    public function changePassword(Request $request)
    {
        $user = $request->user();
        $request->validate([
            'current_password' => 'required',
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        if (!Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The provided password does not match your current password.'],
            ]);
        }

        $user->password = Hash::make($request->new_password);
        $user->save();

        return response()->json([
            'message' => 'Password updated successfully',
        ]);
    }

    #[OA\Post(
        path: '/forgot-password',
        summary: 'Request a password reset email',
        description: 'Always returns 200 with a generic message, even if the email is unknown, to prevent user enumeration.',
        tags: ['Auth'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['email'],
            properties: [new OA\Property(property: 'email', type: 'string', format: 'email')],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Reset link sent (or silently ignored if unknown)', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            // We return success even if user not found to prevent email enumeration
            return response()->json(['message' => 'If your email is in our system, you will receive a reset link shortly.']);
        }

        $token = Str::random(64);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $request->email],
            [
                'token' => Hash::make($token),
                'created_at' => now(),
            ]
        );

        $resetUrl = config('app.frontend_url', 'https://dumosrx.com') . "/reset-password?token=$token&email=" . urlencode($request->email);

        try {
            Mail::to($user->email)->send(new PasswordResetEmail($user, $resetUrl));
        } catch (Exception $e) {
            Log::error("Failed to send password reset email: " . $e->getMessage());
            return response()->json([
                'message' => 'Unable to send password reset email. Please try again later.'
            ], 500);
        }

        return response()->json(['message' => 'If your email is in our system, you will receive a reset link shortly.']);
    }

    #[OA\Post(
        path: '/reset-password',
        summary: 'Reset a password using a forgot-password token',
        description: 'Token expires 60 minutes after it was issued.',
        tags: ['Auth'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['token', 'email', 'password', 'password_confirmation'],
            properties: [
                new OA\Property(property: 'token', type: 'string'),
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'password', type: 'string', format: 'password', minLength: 8),
                new OA\Property(property: 'password_confirmation', type: 'string', format: 'password'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Reset', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 400, description: 'Invalid/expired token', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $reset = DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->first();

        if (!$reset || !Hash::check($request->token, $reset->token)) {
            return response()->json(['message' => 'Invalid or expired token.'], 400);
        }

        // Check if token is older than 60 minutes
        if (now()->parse($reset->created_at)->addMinutes(60)->isPast()) {
            return response()->json(['message' => 'Reset token has expired.'], 400);
        }

        $user = User::where('email', $request->email)->first();
        if (!$user) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        $user->password = Hash::make($request->password);
        $user->save();

        DB::table('password_reset_tokens')->where('email', $request->email)->delete();

        // Send confirmation email
        \Illuminate\Support\Facades\Mail::to($user->email)->send(new \App\Mail\PasswordChangedEmail($user));

        return response()->json(['message' => 'Password has been reset successfully.']);
    }

    #[OA\Post(
        path: '/profile/request-deletion',
        summary: 'Request account deletion',
        description: 'Flags the account for deletion and notifies platform super admins; does not delete anything immediately.',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['reason'],
            properties: [new OA\Property(property: 'reason', type: 'string', maxLength: 1000)],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Requested', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function requestDeletion(Request $request)
    {
        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $user = $request->user();
        $user->deletion_requested_at = now();
        $user->deletion_reason = $request->reason;
        $user->save();

        // 1. Notify Super Admins & Requesting User
        $superAdmins = User::where('role', 'super_admin')->get();
        foreach ($superAdmins as $superAdmin) {
            Notification::create([
                'user_id' => $superAdmin->id,
                'title' => 'Account Deletion Requested',
                'message' => "User {$user->name} ({$user->email}) has requested account deletion. Reason: {$request->reason}",
                'type' => 'warning',
                'is_read' => false,
            ]);
        }

        // 2. Log Activity
        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'ACCOUNT_DELETION_REQUESTED',
            'description' => "Requested account deletion. Reason: {$request->reason}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Account deletion requested successfully.',
        ]);
    }

    #[OA\Post(
        path: '/profile/cancel-deletion',
        summary: 'Cancel a pending account deletion request',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Cancelled', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 400, description: 'No active deletion request', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function cancelDeletion(Request $request)
    {
        $user = $request->user();
        if (!$user->deletion_requested_at) {
            return response()->json([
                'message' => 'No active account deletion request found.'
            ], 400);
        }

        $user->deletion_requested_at = null;
        $user->deletion_reason = null;
        $user->save();

        // 1. Notify Super Admins & Requesting User
        $superAdmins = User::where('role', 'super_admin')->get();
        foreach ($superAdmins as $superAdmin) {
            Notification::create([
                'user_id' => $superAdmin->id,
                'title' => 'Account Deletion Cancelled',
                'message' => "User {$user->name} ({$user->email}) has cancelled their account deletion request.",
                'type' => 'info',
                'is_read' => false,
            ]);
        }

        // 2. Log Activity
        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'ACCOUNT_DELETION_CANCELLED',
            'description' => 'Cancelled account deletion request.',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Account deletion request cancelled successfully.',
        ]);
    }
}

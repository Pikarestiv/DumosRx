<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\User;
use App\Models\Role;
use App\Models\Store;
use App\Services\SubscriptionService;
use App\Mail\WelcomeEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Exception;
use OpenApi\Attributes as OA;

/**
 * Account creation and email-verification endpoints of AuthController.
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
trait RegistersAccounts
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

        // Separate from the customer referral program above. Attributes this
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
            // Hashed, never stored raw - see User::hashPin().
            'pin' => User::hashPin($request->pin),
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
}

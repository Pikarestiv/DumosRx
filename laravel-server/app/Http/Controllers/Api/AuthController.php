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

class AuthController extends Controller
{
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
        ]);

        if ($request->filled('store_name')) {
            Store::create([
                'user_id' => $user->id,
                'name' => $request->store_name,
                'store_type' => $request->store_type ?? 'pharmacy',
                'device_id' => 'WEB-' . strtoupper(Str::random(8)),
            ]);

            // Create trial subscription
            app(SubscriptionService::class)->createTrial($user);

            // Send Welcome Email
            try {
                Mail::to($user->email)->send(new WelcomeEmail($user, $request->store_name));
            } catch (Exception $e) {
                Log::error("Failed to send welcome email: " . $e->getMessage());
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

        $requireVerification = \App\Models\SystemConfig::getVal('require_email_verification', false) === true || \App\Models\SystemConfig::getVal('require_email_verification', false) === 'true';
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

        if ($user->role !== 'super_admin') {
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

        if ($request->device_name === 'web' || $user->role === 'super_admin') {
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

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

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
            return response()->json(['message' => 'Email verified successfully.', 'user' => $user]);
        }

        return response()->json(['message' => 'User not found.'], 404);
    }

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

    public function user(Request $request)
    {
        return $request->user();
    }

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

        return response()->json(['message' => 'Password has been reset successfully.']);
    }

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

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

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
            'pharmacy_name' => 'nullable|string|max:255',
        ]);

        $user = User::create([
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
            'username' => $request->username,
            'pin' => $request->pin,
            'password' => Hash::make($request->password),
            'role' => $request->filled('pharmacy_name') ? 'admin' : ($request->role ?? 'pharmacist'),
            'is_active' => true,
        ]);

        if ($request->filled('pharmacy_name')) {
            \App\Models\Store::create([
                'user_id' => $user->id,
                'name' => $request->pharmacy_name,
                'device_id' => 'WEB-' . strtoupper(Str::random(8)),
            ]);

            // Create trial subscription
            app(\App\Services\SubscriptionService::class)->createTrial($user);

            // Send Welcome Email
            try {
                Mail::to($user->email)->send(new \App\Mail\WelcomeEmail($user, $request->pharmacy_name));
            } catch (\Exception $e) {
                \Log::error("Failed to send welcome email: " . $e->getMessage());
            }
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

        $token = $user->createToken($request->device_name)->plainTextToken;

        $response = response()->json([
            'message' => 'Login successful',
            'user' => $user,
            'token' => $token,
            'role' => $user->role,
        ]);

        if ($request->device_name === 'web' || $user->role === 'super_admin') {
            // Set an HttpOnly cookie for admin sessions
            // expire in 24 hours
            $response->withCookie(cookie(
                'drx_admin_session',
                $token,
                60 * 24,
                '/',
                $request->getHost() === 'localhost' ? null : '.rx.dumostech.com',
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
                    $request->getHost() === "localhost" ? null : ".rx.dumostech.com",
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

        $resetUrl = "https://rx.dumostech.com/reset-password?token=$token&email=" . urlencode($request->email);

        try {
            Mail::to($user->email)->send(new \App\Mail\PasswordResetEmail($user, $resetUrl));
        } catch (\Exception $e) {
            \Log::error("Failed to send password reset email: " . $e->getMessage());
            // In a production environment, you might want to return an error, 
            // but for now we'll just log it.
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
}

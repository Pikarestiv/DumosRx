<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\User;
use App\Mail\PasswordResetEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Exception;
use OpenApi\Attributes as OA;

/**
 * The forgotten-password / reset-token flow of AuthController.
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
trait RecoversPasswords
{
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

        // Send confirmation email. Best-effort: the password is already
        // changed and saved above, so a mail failure must not turn a
        // successful reset into a 500 (same class of bug as the new-device
        // login email below).
        try {
            \Illuminate\Support\Facades\Mail::to($user->email)->send(new \App\Mail\PasswordChangedEmail($user));
        } catch (Exception $e) {
            Log::error("Failed to send password-changed confirmation email to {$user->email}: " . $e->getMessage());
        }

        return response()->json(['message' => 'Password has been reset successfully.']);
    }
}

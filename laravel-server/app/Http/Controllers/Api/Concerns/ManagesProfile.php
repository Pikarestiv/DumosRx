<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\User;
use App\Models\Notification;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

/**
 * Profile, PIN/password change and account-deletion endpoints of
 * AuthController.
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
trait ManagesProfile
{
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

        // Hashed, never stored raw - see User::hashPin(). Verification is
        // client-side/offline, so only the hash ever needs to leave here.
        $user->pin = \App\Models\User::hashPin($request->pin);
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
        path: '/profile/request-deletion',
        summary: 'Request account deletion',
        description: 'Flags the account for deletion and notifies platform super admins; does not delete anything immediately.',
        tags: ['Auth'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['reason', 'password'],
            properties: [
                new OA\Property(property: 'reason', type: 'string', maxLength: 1000),
                new OA\Property(property: 'password', type: 'string', description: "The user's current password, required to confirm this destructive action"),
            ],
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
            'password' => 'required|string',
        ]);

        $user = $request->user();

        if (!Hash::check($request->password, $user->password)) {
            return response()->json([
                'error' => 'Invalid Password',
                'message' => 'The password you entered is incorrect.',
            ], 403);
        }

        $user->deletion_requested_at = now();
        $user->deletion_reason = $request->reason;
        $user->save();

        // 1. Notify Super Admins & Requesting User
        $superAdminIds = User::where('role', 'super_admin')->pluck('id');
        Notification::bulkCreateFor($superAdminIds, [
            'title' => 'Account Deletion Requested',
            'message' => "User {$user->name} ({$user->email}) has requested account deletion. Reason: {$request->reason}",
            'type' => 'warning',
        ]);

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
        $superAdminIds = User::where('role', 'super_admin')->pluck('id');
        Notification::bulkCreateFor($superAdminIds, [
            'title' => 'Account Deletion Cancelled',
            'message' => "User {$user->name} ({$user->email}) has cancelled their account deletion request.",
            'type' => 'info',
        ]);

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

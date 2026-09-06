<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminUserService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class AdminUserController extends AdminBaseController
{
    protected $adminUserService;

    public function __construct(AdminUserService $adminUserService)
    {
        $this->adminUserService = $adminUserService;
    }

    #[OA\Get(
        path: '/admin/users',
        summary: 'List/search users platform-wide',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'role', in: 'query', description: 'Filter by exact role slug (e.g. super_admin, store_owner, specialist, sales_staff)', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Users', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function users(Request $request)
    {
        return $this->withErrorResponse('Users', 'Failed to fetch users', function () use ($request) {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $role = $request->query('role');
            return response()->json($this->adminUserService->getGlobalUsers($page, $search, $role));
        });
    }

    #[OA\Get(
        path: '/admin/my-referrals',
        summary: "Accounts the caller registered or that signed up via the caller's referral link",
        description: 'Available to super_admin/platform_admin/agent (the manage_platform gate on this whole route group already covers that). Defaults to the caller\'s own attribution; super_admin may pass user_id to view any platform user\'s.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'user_id', in: 'query', description: 'super_admin only: view another platform user\'s referrals', schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Referral code + attributed accounts', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, description: 'Requested another user\'s referrals without being super_admin'),
        ],
    )]
    public function myReferrals(Request $request)
    {
        $caller = $request->user();
        $targetId = $caller->id;

        if ($request->filled('user_id') && $request->query('user_id') !== $caller->id) {
            if (!$caller->hasRole('super_admin')) {
                return response()->json(['error' => 'Unauthorized'], 403);
            }
            $targetId = $request->query('user_id');
        }

        return $this->withErrorResponse('My Referrals', 'Failed to fetch referrals', function () use ($targetId) {
            return response()->json($this->adminUserService->getReferralsFor($targetId));
        });
    }

    #[OA\Get(
        path: '/admin/referral-code/check',
        summary: 'Check whether a custom platform referral code is available',
        description: 'Available to super_admin/platform_admin/agent. Normalizes the same way updateReferralCode does, so what\'s reported available is exactly what would be saved.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'code', in: 'query', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'user_id', in: 'query', description: 'Exclude this user\'s own current code from the collision check (i.e. re-saving your own code as-is)', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Availability + normalized code', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'available', type: 'boolean'),
                new OA\Property(property: 'code', type: 'string'),
            ])),
        ],
    )]
    public function checkReferralCode(Request $request)
    {
        $request->validate(['code' => 'required|string']);

        return response()->json(
            $this->adminUserService->checkReferralCodeAvailable($request->query('code'), $request->query('user_id'))
        );
    }

    #[OA\Post(
        path: '/admin/referral-code',
        summary: 'Set a custom platform referral code',
        description: 'Self-service: defaults to the caller\'s own code. super_admin may pass user_id to set another platform user\'s.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['code'],
            properties: [
                new OA\Property(property: 'code', type: 'string', minLength: 3, maxLength: 32),
                new OA\Property(property: 'user_id', type: 'string', nullable: true, description: 'super_admin only'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'platform_referral_code', type: 'string'),
            ])),
            new OA\Response(response: 403, description: 'Tried to edit another user\'s code without being super_admin'),
            new OA\Response(response: 422, description: 'Invalid format or already taken'),
        ],
    )]
    public function updateReferralCode(Request $request)
    {
        $request->validate(['code' => 'required|string']);
        $caller = $request->user();
        $targetId = $request->filled('user_id') ? $request->input('user_id') : $caller->id;

        try {
            $code = $this->adminUserService->updateReferralCode($targetId, $request->input('code'), $caller->id);
            return response()->json(['platform_referral_code' => $code]);
        } catch (\Exception $e) {
            $status = str_contains($e->getMessage(), 'super_admin') ? 403 : 422;
            return response()->json(['error' => $e->getMessage()], $status);
        }
    }

    #[OA\Post(
        path: '/admin/users/{id}/grant-trial',
        summary: 'Grant a user (rather than a store) a trial subscription',
        description: 'Same semantics as `/admin/stores/{id}/grant-trial`: pass either `duration` or `end_date`.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', description: 'User ID', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['plan'],
            properties: [
                new OA\Property(property: 'plan', type: 'string', enum: ['starter', 'pro', 'enterprise']),
                new OA\Property(property: 'duration', type: 'string', nullable: true, example: '14 days'),
                new OA\Property(property: 'end_date', type: 'string', format: 'date', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Granted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function grantUserTrial(Request $request, $id)
    {
        if (!$request->user()->hasRole('super_admin') && !$request->user()->hasPermission('grant_trials')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'plan' => 'required|string|in:starter,pro,enterprise',
            'duration' => 'required_without:end_date|nullable|string',
            'end_date' => 'required_without:duration|nullable|date|after:today',
        ]);

        try {
            $this->adminUserService->grantUserTrial($id, $validated['plan'], $validated['duration'] ?? null, $validated['end_date'] ?? null);
            return response()->json(['message' => 'Trial granted successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Grant User Trial Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to grant trial: ' . $e->getMessage()], 500);
        }
    }

    #[OA\Post(
        path: '/admin/users',
        summary: 'Create a new platform-level account (super_admin, platform_admin, or agent)',
        description: 'super_admin-only: creating platform-level accounts (including other super_admins) is a privilege-escalation-sensitive action kept exclusive to super_admin, unlike account creation for customers (create_accounts permission, shared with platform_admin/agent).',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['first_name', 'last_name', 'email', 'password'],
            properties: [
                new OA\Property(property: 'first_name', type: 'string', minLength: 2),
                new OA\Property(property: 'last_name', type: 'string', minLength: 2),
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'phone', type: 'string', nullable: true),
                new OA\Property(property: 'password', type: 'string', format: 'password', minLength: 8),
                new OA\Property(property: 'role', type: 'string', enum: ['super_admin', 'platform_admin', 'agent'], default: 'platform_admin'),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Created', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function createPlatformAdmin(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|min:2',
            'last_name' => 'required|string|min:2',
            'email' => 'required|email|unique:users,email',
            'phone' => 'nullable|string',
            'password' => 'required|string|min:8',
            'role' => 'nullable|string|in:super_admin,platform_admin,agent',
        ]);

        return $this->withErrorResponse('Create Platform Admin', 'Failed to create platform account', function () use ($request, $validated) {
            $user = $this->adminUserService->createPlatformAdmin($validated, $request->user()->id);
            return response()->json([
                'message' => 'Platform account created successfully',
                'user' => $user
            ], 201);
        });
    }

    #[OA\Post(
        path: '/admin/users/{id}/deactivate',
        summary: 'Deactivate a user account',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deactivated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function deactivateUser(Request $request, $id)
    {
        return $this->withErrorResponse('Deactivate User', 'Failed to deactivate user', function () use ($id) {
            $this->adminUserService->deactivateUser($id);
            return response()->json(['message' => 'User deactivated successfully']);
        });
    }

    #[OA\Post(
        path: '/admin/users/{id}/reactivate',
        summary: 'Reactivate a deactivated user account',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Reactivated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function reactivateUser(Request $request, $id)
    {
        return $this->withErrorResponse('Reactivate User', 'Failed to reactivate user', function () use ($id) {
            $this->adminUserService->reactivateUser($id);
            return response()->json(['message' => 'User reactivated successfully']);
        });
    }

    #[OA\Delete(
        path: '/admin/users/{id}',
        summary: 'Permanently delete a user and all associated data',
        description: 'Irreversible; not a soft delete.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function deleteUser(Request $request, $id)
    {
        return $this->withErrorResponse('Delete User', 'Failed to delete user', function () use ($id) {
            $this->adminUserService->deleteUser($id);
            return response()->json(['message' => 'User and associated data permanently deleted']);
        });
    }

    #[OA\Post(
        path: '/admin/users/{id}/reset-password',
        summary: "Force-reset a user's password to a temporary one",
        description: 'Returns the temp password in the response; surface it to the admin so they can relay it out-of-band.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Reset', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'temp_password', type: 'string'),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function forcePasswordReset(Request $request, $id)
    {
        return $this->withErrorResponse('Force Reset', 'Failed to force password reset', function () use ($id) {
            $result = $this->adminUserService->forcePasswordReset($id);
            return response()->json([
                'message' => 'Password reset forced successfully',
                'temp_password' => $result['temp_password']
            ]);
        });
    }

    #[OA\Post(
        path: '/admin/users/{id}/notify',
        summary: 'Send an in-app notification to a single user',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['title', 'message'],
            properties: [
                new OA\Property(property: 'title', type: 'string', minLength: 3, maxLength: 100),
                new OA\Property(property: 'message', type: 'string', minLength: 5),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Sent', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function notifyUser(Request $request, $id)
    {
        $validated = $request->validate([
            'title' => 'required|string|min:3|max:100',
            'message' => 'required|string|min:5',
        ]);

        return $this->withErrorResponse('Notify', 'Failed to send notification', function () use ($id, $validated) {
            $this->adminUserService->notifyUser($id, $validated['message'], $validated['title']);
            return response()->json(['message' => 'Notification sent successfully']);
        });
    }

    #[OA\Post(
        path: '/admin/users/bulk-notify',
        summary: 'Send an in-app notification to a filtered set of users',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['title', 'message'],
            properties: [
                new OA\Property(property: 'title', type: 'string', minLength: 3, maxLength: 100),
                new OA\Property(property: 'message', type: 'string', minLength: 5),
                new OA\Property(property: 'filters', type: 'object', nullable: true, description: 'Recipient filter criteria (plan, status, etc.); see AdminUserService::bulkNotify'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Sent', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'count', type: 'integer'),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function bulkNotify(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|min:3|max:100',
            'message' => 'required|string|min:5',
            'filters' => 'nullable|array'
        ]);

        return $this->withErrorResponse('Bulk Notify', 'Failed to send bulk notifications', function () use ($validated) {
            $count = $this->adminUserService->bulkNotify($validated['filters'] ?? [], $validated['message'], $validated['title']);
            return response()->json([
                'message' => "Notification sent to {$count} users successfully",
                'count' => $count
            ]);
        });
    }
}

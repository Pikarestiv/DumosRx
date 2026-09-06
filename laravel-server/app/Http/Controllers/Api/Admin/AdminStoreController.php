<?php

namespace App\Http\Controllers\Api\Admin;

use App\Models\ActivityLog;
use App\Services\Admin\AdminStoreService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use OpenApi\Attributes as OA;

class AdminStoreController extends AdminBaseController
{
    protected $adminStoreService;

    public function __construct(AdminStoreService $adminStoreService)
    {
        $this->adminStoreService = $adminStoreService;
    }

    #[OA\Get(
        path: '/admin/stores',
        summary: 'List/search stores platform-wide',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'status', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'plan', in: 'query', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Stores', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function stores(Request $request)
    {
        return $this->withErrorResponse('Stores', 'Failed to fetch stores', function () use ($request) {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $status = $request->query('status');
            $plan = $request->query('plan');
            return response()->json($this->adminStoreService->getStores($page, $search, $status, $plan));
        });
    }

    #[OA\Post(
        path: '/admin/stores',
        summary: 'Register a new store + owner on behalf of a customer',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['store_name', 'first_name', 'last_name', 'email', 'username', 'phone', 'password'],
            properties: [
                new OA\Property(property: 'store_name', type: 'string', minLength: 2),
                new OA\Property(property: 'first_name', type: 'string', minLength: 2),
                new OA\Property(property: 'last_name', type: 'string', minLength: 2),
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'username', type: 'string', minLength: 3, description: 'Local terminal login username, same field the self-serve register flow collects.'),
                new OA\Property(property: 'phone', type: 'string', minLength: 10),
                new OA\Property(property: 'password', type: 'string', format: 'password', minLength: 8),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Created', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Caller lacks create_accounts permission'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function registerStore(Request $request)
    {
        // hasRole('super_admin') checks the raw `role` string column, so it
        // can't be blocked by stale/missing role_id or permission_role data
        // the way hasPermission() can. Matches the bypass the route's own
        // `permission:manage_platform` middleware already grants super_admin.
        if (!$request->user()->hasRole('super_admin') && !$request->user()->hasPermission('create_accounts')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'store_name' => 'required|string|min:2',
            'first_name' => 'required|string|min:2',
            'last_name' => 'required|string|min:2',
            'email' => 'required|email|unique:users,email',
            'username' => 'required|string|max:255|unique:users,username',
            'phone' => 'required|string|min:10',
            'password' => 'required|string|min:8',
            'pin' => 'nullable|string|size:4',
            'is_demo' => 'nullable|boolean',
        ]);

        return $this->withErrorResponse('Register Store', 'Failed to register store', function () use ($request, $validated) {
            $store = $this->adminStoreService->registerStore($validated, $request->user()->id);
            return response()->json([
                'message' => 'Store registered successfully',
                'store' => $store
            ], 201);
        });
    }

    #[OA\Get(
        path: '/admin/stores/{id}/billing-history',
        summary: "Admin-scoped billing/payment-transaction history for an arbitrary store's owner",
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Billing history', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 404, description: 'Store not found'),
        ],
    )]
    public function billingHistory(Request $request, string $id)
    {
        return $this->withErrorResponse('Billing History', 'Failed to fetch billing history', function () use ($id) {
            $data = $this->adminStoreService->getBillingHistoryForStore($id);
            if ($data === null) {
                return response()->json(['error' => 'Store not found'], 404);
            }
            return response()->json($data);
        });
    }

    #[OA\Post(
        path: '/admin/stores/{id}/suspend',
        summary: 'Suspend a store',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'reason', type: 'string', maxLength: 1000, nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Suspended', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function suspendStore(Request $request, $id)
    {
        $validated = $request->validate([
            'reason' => 'nullable|string|max:1000',
        ]);

        return $this->withErrorResponse('Suspend', 'Failed to suspend store', function () use ($id, $validated) {
            $this->adminStoreService->suspendStore($id, $validated['reason'] ?? null);
            return response()->json(['message' => 'Store suspended successfully']);
        });
    }

    #[OA\Post(
        path: '/admin/stores/{id}/unsuspend',
        summary: 'Re-activate a suspended store',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Re-activated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function unsuspendStore(Request $request, $id)
    {
        return $this->withErrorResponse('Unsuspend', 'Failed to unsuspend store', function () use ($id) {
            $this->adminStoreService->unsuspendStore($id);
            return response()->json(['message' => 'Store re-activated successfully']);
        });
    }

    #[OA\Post(
        path: '/admin/stores/{id}/mark-demo',
        summary: 'Flag a store as a demo account',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Marked', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function markStoreDemo(Request $request, $id)
    {
        return $this->withErrorResponse('Mark Demo', 'Failed to mark store as demo', function () use ($id) {
            $this->adminStoreService->markStoreDemo($id);
            return response()->json(['message' => 'Store marked as demo']);
        });
    }

    #[OA\Post(
        path: '/admin/stores/{id}/unmark-demo',
        summary: 'Remove the demo flag from a store',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Unmarked', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function unmarkStoreDemo(Request $request, $id)
    {
        return $this->withErrorResponse('Unmark Demo', 'Failed to remove demo flag', function () use ($id) {
            $this->adminStoreService->unmarkStoreDemo($id);
            return response()->json(['message' => 'Demo flag removed']);
        });
    }

    #[OA\Post(
        path: '/admin/stores/{id}/grant-trial',
        summary: 'Grant a store a trial subscription',
        description: 'Pass either `duration` (a preset like "14 days", "1 month", "1 year") or an explicit `end_date`; exactly one is required. `end_date` always wins if both are somehow present.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', description: 'Store ID', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['plan'],
            properties: [
                new OA\Property(property: 'plan', type: 'string', enum: ['starter', 'pro', 'enterprise']),
                new OA\Property(property: 'duration', type: 'string', nullable: true, example: '14 days', description: 'One of: 1 day, 3 days, 7 days, 14 days, 21 days, 30 days, 1 month, 3 months, 6 months, 1 year'),
                new OA\Property(property: 'end_date', type: 'string', format: 'date', nullable: true, description: 'Must be after today. Use instead of `duration` for an exact expiry date.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Granted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function grantTrial(Request $request, $id)
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
            $this->adminStoreService->grantTrial($id, $validated['plan'], $validated['duration'] ?? null, $validated['end_date'] ?? null);
            return response()->json(['message' => 'Trial granted successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Grant Trial Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to grant trial: ' . $e->getMessage()], 500);
        }
    }

    #[OA\Put(
        path: '/admin/stores/{id}/account-manager',
        summary: "Reassign a store account's contact specialist / account manager",
        description: 'Separate from registered_by_id (referral attribution) - see User::accountManager(). Pass account_manager_id: null to clear the explicit assignment and fall back to registered_by_id / the platform default.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            properties: [new OA\Property(property: 'account_manager_id', type: 'string', format: 'uuid', nullable: true)],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Reassigned', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Get(
        path: '/admin/account-managers',
        summary: 'List platform staff eligible to be a contact specialist / account manager',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'List', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'data', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        ],
    )]
    public function accountManagerCandidates(Request $request)
    {
        return response()->json(['data' => $this->adminStoreService->getAccountManagerCandidates()]);
    }

    public function updateAccountManager(Request $request, $id)
    {
        $validated = $request->validate([
            'account_manager_id' => 'nullable|exists:users,id',
        ]);

        $store = \App\Models\Store::findOrFail($id);
        $owner = $store->user;
        if (!$owner) {
            return response()->json(['error' => 'Store owner not found.'], 404);
        }

        $owner->account_manager_id = $validated['account_manager_id'] ?? null;
        $owner->save();

        return response()->json(['message' => 'Account manager updated successfully']);
    }

    #[OA\Post(
        path: '/admin/stores/{id}/impersonate',
        summary: "Start impersonating a store's owner session",
        description: 'Sets the `drx_admin_session` cookie to the impersonated user\'s token; use `/admin/restore-session` to end it.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', description: 'Store ID', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Impersonation session started', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function impersonateStore(Request $request, $id)
    {
        try {
            $data = $this->adminStoreService->impersonateStore($id);

            $response = response()->json($data);

            // Set the session cookie to the impersonated user's token
            $response->withCookie(cookie(
                'drx_admin_session',
                $data['token'],
                60 * 24,
                '/',
                $request->getHost() === 'localhost' || filter_var($request->getHost(), FILTER_VALIDATE_IP) ? null : '.' . implode('.', array_slice(explode('.', $request->getHost()), -2)),
                $request->isSecure(),
                true,
                false,
                $request->isSecure() ? 'None' : 'Lax'
            ));

            return $response;
        } catch (\Exception $e) {
            Log::error("Admin Impersonate Error: " . $e->getMessage());
            return response()->json(['error' => 'Impersonation failed: ' . $e->getMessage()], 500);
        }
    }

    #[OA\Post(
        path: '/admin/restore-session',
        summary: "End impersonation and restore the admin's own session",
        description: 'The supplied token must resolve to a real Sanctum token owned by a super_admin; it is not trusted blindly, since this cookie doubles as the bearer token for every subsequent request (see AuthenticateFromCookie middleware).',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['token'],
            properties: [new OA\Property(property: 'token', type: 'string', description: "The admin's own token to restore")],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Restored', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Token does not belong to a super_admin', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function restoreSession(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string'
        ]);

        $accessToken = PersonalAccessToken::findToken($validated['token']);
        $admin = $accessToken?->tokenable;

        if (!$admin || !$admin->hasRole('super_admin')) {
            return response()->json(['error' => 'Invalid restore token.'], 403);
        }

        // Log the end of impersonation
        ActivityLog::create([
            'user_id' => $admin->id,
            'action' => 'ADMIN_IMPERSONATION_END',
            'description' => "Admin ended impersonation session",
            'status' => 'success'
        ]);

        $response = response()->json(['message' => 'Session restored']);

        $response->withCookie(cookie(
            'drx_admin_session',
            $validated['token'],
            60 * 24,
            '/',
            $request->getHost() === 'localhost' || filter_var($request->getHost(), FILTER_VALIDATE_IP) ? null : '.' . implode('.', array_slice(explode('.', $request->getHost()), -2)),
            $request->isSecure(),
            true,
            false,
            $request->isSecure() ? 'None' : 'Lax'
        ));

        return $response;
    }
}

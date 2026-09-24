<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\ManagesAdminSessionCookie;
use App\Models\ActivityLog;
use App\Services\Admin\AdminStoreService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use OpenApi\Attributes as OA;

class AdminStoreController extends AdminBaseController
{
    use ManagesAdminSessionCookie;

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

    #[OA\Post(
        path: '/admin/stores/{id}/activate-plan',
        summary: 'Manually activate a paid subscription for a store (e.g. after a bank transfer)',
        description: 'For payments settled outside the automated checkout flow. Creates a non-trial active Subscription and a matching PaymentTransaction (provider=bank_transfer) so it appears in billing history and platform revenue reporting.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', description: 'Store ID', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['plan', 'billing_cycle', 'amount'],
            properties: [
                new OA\Property(property: 'plan', type: 'string', enum: ['starter', 'pro', 'enterprise']),
                new OA\Property(property: 'billing_cycle', type: 'string', enum: ['monthly', 'yearly']),
                new OA\Property(property: 'amount', type: 'number', description: 'Amount paid, in naira'),
                new OA\Property(property: 'reference', type: 'string', nullable: true, description: 'Bank reference/note for the transfer'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Activated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function activatePlan(Request $request, $id)
    {
        if (!$request->user()->hasRole('super_admin') && !$request->user()->hasPermission('grant_trials')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'plan' => 'required|string|in:starter,pro,enterprise',
            'billing_cycle' => 'required|string|in:monthly,yearly',
            'amount' => 'required|numeric|min:0',
            'reference' => 'nullable|string|max:255',
        ]);

        try {
            $this->adminStoreService->activatePaidPlan($id, $validated['plan'], $validated['billing_cycle'], $validated['amount'], $validated['reference'] ?? null);
            return response()->json(['message' => 'Plan activated successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Activate Plan Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to activate plan: ' . $e->getMessage()], 500);
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
        description: "Returns the impersonated user's token in the JSON body; the admin panel passes it straight to /admin/handoff's createHandoffCode() for cross-origin transfer to app.dumosrx.com (see AuthHandoffController) — it never uses a cookie.",
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

            // Previously also set drx_admin_session here, to the
            // impersonated user's own full-ability token, with the
            // pre-2026-08-26-redesign SameSite=None pattern. The admin
            // panel's actual impersonation flow (app/admin/stores/page.tsx)
            // never reads this cookie — it uses the JSON body's `token`
            // directly for the handoff-code exchange — so this write served
            // no purpose except silently overwriting the calling admin's
            // own Strict, refresh-scoped drx_admin_session cookie with the
            // impersonated user's unscoped one on every impersonation,
            // breaking the admin's own dumosrx.com session on next reload.
            // Removed rather than fixed-in-place, since nothing needs it.
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Admin Impersonate Error: " . $e->getMessage());
            return response()->json(['error' => 'Impersonation failed: ' . $e->getMessage()], 500);
        }
    }

    #[OA\Post(
        path: '/admin/restore-session',
        summary: "End impersonation and restore the admin's own session",
        description: 'Dead code from the current UI\'s perspective (useRestoreSessionMutation is defined but never called — impersonation return uses the handoff-code flow instead) — kept working and hardened rather than removed, in case it is wired up later. The supplied token must resolve to a real Sanctum token owned by a super_admin; it is not trusted blindly.',
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

        // Previously hand-rolled its own SameSite=None cookie call, AND put
        // the raw validated token (a general-ability access token) directly
        // into it. Fixed to route through the same hardened (Strict,
        // HttpOnly) cookie builder login()/refreshAdminSession() use, per
        // AGENTS.md's own note that this needs that treatment before it's
        // ever wired up — but an independent review pass after that first
        // fix caught that the cookie's VALUE was still wrong: this cookie
        // must only ever hold a `refresh`-ability-scoped token (that's what
        // refreshAdminSession()'s `$refreshToken->can('refresh')` gate
        // checks), never a general one, so a cookie built from
        // $validated['token'] as-is would fail that gate and get the
        // session cleared on the very next reload. Mints a fresh
        // refresh-scoped token for the same admin instead, exactly like
        // login()/refreshAdminSession() do.
        $refreshToken = $admin->createToken('admin-refresh', ['refresh'])->plainTextToken;

        return response()->json(['message' => 'Session restored'])
            ->withCookie($this->buildAdminSessionCookie($request, $refreshToken));
    }
}

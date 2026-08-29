<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Product;
use App\Services\Admin\AdminService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use OpenApi\Attributes as OA;

class AdminController extends Controller
{
    /**
     * @var \App\Services\Admin\AdminService
     */
    protected $adminService;

    public function __construct(AdminService $adminService)
    {
        $this->adminService = $adminService;
    }

    #[OA\Get(
        path: '/admin/summary',
        summary: 'Platform-wide summary metrics',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Summary', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function summary(Request $request)
    {
        // Ensure only super_admin can access
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $summary = $this->adminService->getGlobalSummary();
            return response()->json($summary);
        } catch (\Exception $e) {
            Log::error("Admin Dashboard Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch admin summary'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $status = $request->query('status');
            $plan = $request->query('plan');
            $data = $this->adminService->getStores($page, $search, $status, $plan);
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Admin Stores Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch stores'], 500);
        }
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

        try {
            $store = $this->adminService->registerStore($validated, $request->user()->id);
            return response()->json([
                'message' => 'Store registered successfully',
                'store' => $store
            ], 201);
        } catch (\Exception $e) {
            Log::error("Admin Register Store Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to register store'], 500);
        }
    }

    #[OA\Get(
        path: '/admin/products',
        summary: 'Global product catalog view (across all stores) + catalog metrics',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'category', in: 'query', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Products + metrics + distinct generic-name categories', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'products', type: 'object'),
                new OA\Property(property: 'metrics', type: 'object'),
                new OA\Property(property: 'categories', type: 'array', items: new OA\Items(type: 'string')),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        ],
    )]
    public function products(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $page = $request->get('page', 1);
        $search = $request->get('search');
        $category = $request->get('category');
        
        return response()->json([
            'products' => $this->adminService->getGlobalProducts($page, $search, $category),
            'metrics' => $this->adminService->getProductMetrics(),
            'categories' => Product::select('generic_name')
                ->whereNotNull('generic_name')
                ->distinct()
                ->pluck('generic_name')
        ]);
    }

    #[OA\Post(
        path: '/admin/products/standardize',
        summary: 'Run catalog standardization (dedupe/normalize product names) across all stores',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Standardization result', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function standardize(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $result = $this->adminService->standardizeCatalog();
            return response()->json($result);
        } catch (\Exception $e) {
            Log::error("Admin Standardize Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to standardize catalog'], 500);
        }
    }

    #[OA\Get(
        path: '/admin/health',
        summary: 'Platform system health snapshot',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Health data', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function health(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $data = $this->adminService->getSystemHealth();
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Admin Health Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch system health'], 500);
        }
    }

    #[OA\Get(
        path: '/admin/errors',
        summary: 'Recent unresolved Sentry issues across client + server projects',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Issues', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function errors(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $data = $this->adminService->getRecentErrors();
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Admin Errors Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch recent errors'], 500);
        }
    }

    #[OA\Get(
        path: '/admin/users',
        summary: 'List/search users platform-wide',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Users', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function users(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $page = $request->query('page', 1);
            $search = $request->query('search');
            $data = $this->adminService->getGlobalUsers($page, $search);
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Admin Users Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch users'], 500);
        }
    }

    #[OA\Get(
        path: '/admin/activity-logs',
        summary: 'Platform-wide activity/audit log',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'action', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'store_id', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'user_id', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'date_from', in: 'query', schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'date_to', in: 'query', schema: new OA\Schema(type: 'string', format: 'date')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Activity logs', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function activityLogs(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $data = $this->adminService->getActivityLogs(
                $request->query('page', 1),
                $request->query('search'),
                $request->query('action'),
                $request->query('store_id'),
                $request->query('user_id'),
                $request->query('date_from'),
                $request->query('date_to'),
            );
            return response()->json($data);
        } catch (\Exception $e) {
            Log::error("Admin Activity Logs Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch activity logs'], 500);
        }
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

        try {
            return response()->json($this->adminService->getReferralsFor($targetId));
        } catch (\Exception $e) {
            Log::error("Admin My Referrals Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch referrals'], 500);
        }
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
            $this->adminService->checkReferralCodeAvailable($request->query('code'), $request->query('user_id'))
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
            $code = $this->adminService->updateReferralCode($targetId, $request->input('code'), $caller->id);
            return response()->json(['platform_referral_code' => $code]);
        } catch (\Exception $e) {
            $status = str_contains($e->getMessage(), 'super_admin') ? 403 : 422;
            return response()->json(['error' => $e->getMessage()], $status);
        }
    }

    #[OA\Get(
        path: '/admin/search',
        summary: 'Global platform search (stores, users, etc.)',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'query', in: 'query', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Search results (empty array if no query given)', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function search(Request $request)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $query = $request->query('query');
            if (!$query) return response()->json([]);

            $results = $this->adminService->globalSearch($query);
            return response()->json($results);
        } catch (\Exception $e) {
            Log::error("Admin Search Error: " . $e->getMessage());
            return response()->json(['error' => 'Search failed'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:1000',
        ]);

        try {
            $this->adminService->suspendStore($id, $validated['reason'] ?? null);
            return response()->json(['message' => 'Store suspended successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Suspend Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to suspend store'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->unsuspendStore($id);
            return response()->json(['message' => 'Store re-activated successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Unsuspend Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to unsuspend store'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->markStoreDemo($id);
            return response()->json(['message' => 'Store marked as demo']);
        } catch (\Exception $e) {
            Log::error("Admin Mark Demo Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to mark store as demo'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->unmarkStoreDemo($id);
            return response()->json(['message' => 'Demo flag removed']);
        } catch (\Exception $e) {
            Log::error("Admin Unmark Demo Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to remove demo flag'], 500);
        }
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
            $this->adminService->grantTrial($id, $validated['plan'], $validated['duration'] ?? null, $validated['end_date'] ?? null);
            return response()->json(['message' => 'Trial granted successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Grant Trial Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to grant trial: ' . $e->getMessage()], 500);
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
            $this->adminService->grantUserTrial($id, $validated['plan'], $validated['duration'] ?? null, $validated['end_date'] ?? null);
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|min:2',
            'last_name' => 'required|string|min:2',
            'email' => 'required|email|unique:users,email',
            'phone' => 'nullable|string',
            'password' => 'required|string|min:8',
            'role' => 'nullable|string|in:super_admin,platform_admin,agent',
        ]);

        try {
            $user = $this->adminService->createPlatformAdmin($validated, $request->user()->id);
            return response()->json([
                'message' => 'Platform account created successfully',
                'user' => $user
            ], 201);
        } catch (\Exception $e) {
            Log::error("Admin Create Platform Admin Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to create platform account'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->deactivateUser($id);
            return response()->json(['message' => 'User deactivated successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Deactivate User Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to deactivate user'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->reactivateUser($id);
            return response()->json(['message' => 'User reactivated successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Reactivate User Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to reactivate user'], 500);
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        return response()->json(['data' => $this->adminService->getAccountManagerCandidates()]);
    }

    public function updateAccountManager(Request $request, $id)
    {
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $this->adminService->deleteUser($id);
            return response()->json(['message' => 'User and associated data permanently deleted']);
        } catch (\Exception $e) {
            Log::error("Admin Delete User Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to delete user'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $result = $this->adminService->forcePasswordReset($id);
            return response()->json([
                'message' => 'Password reset forced successfully',
                'temp_password' => $result['temp_password']
            ]);
        } catch (\Exception $e) {
            Log::error("Admin Force Reset Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to force password reset'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|min:3|max:100',
            'message' => 'required|string|min:5',
        ]);

        try {
            $this->adminService->notifyUser($id, $validated['message'], $validated['title']);
            return response()->json(['message' => 'Notification sent successfully']);
        } catch (\Exception $e) {
            Log::error("Admin Notify Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to send notification'], 500);
        }
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
                new OA\Property(property: 'filters', type: 'object', nullable: true, description: 'Recipient filter criteria (plan, status, etc.); see AdminService::bulkNotify'),
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|min:3|max:100',
            'message' => 'required|string|min:5',
            'filters' => 'nullable|array'
        ]);

        try {
            $count = $this->adminService->bulkNotify($validated['filters'] ?? [], $validated['message'], $validated['title']);
            return response()->json([
                'message' => "Notification sent to {$count} users successfully",
                'count' => $count
            ]);
        } catch (\Exception $e) {
            Log::error("Admin Bulk Notify Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to send bulk notifications'], 500);
        }
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
        if (!$request->user()->hasRole('super_admin')) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $data = $this->adminService->impersonateStore($id);
            
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

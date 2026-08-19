<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

class StaffController extends Controller
{
    #[OA\Get(
        path: '/staff',
        summary: "List staff accounts for the caller's store(s)",
        description: '`super_admin` sees all non-super_admin users platform-wide (optionally filtered by `store_id`); everyone else sees only their own store\'s staff.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store_id', in: 'query', description: 'Filter to one store, or "all"', schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Staff users', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    /**
     * Query scoped to staff the caller is allowed to see: super_admin sees
     * everyone (optionally filtered to one store), everyone else sees only
     * their own store's staff (or themselves). Shared by index() and show()
     * so a staff record invisible to index() can't be fetched directly by
     * ID via show() either.
     */
    private function visibleStaffQuery(Request $request)
    {
        $user = $request->user();

        if ($user->hasRole('super_admin')) {
            $query = User::where('role', '!=', 'super_admin');

            if ($request->has('store_id') && $request->store_id !== 'all') {
                $query->where('store_id', $request->store_id);
            }
        } else {
            $subscriptionService = app(\App\Services\SubscriptionService::class);
            $owner = $subscriptionService->getSubscriptionOwner($user);

            $storeIds = \App\Models\Store::where('user_id', $owner->id)->pluck('id')->toArray();

            $query = User::where(function($q) use ($storeIds, $owner) {
                $q->whereIn('store_id', $storeIds)
                  ->orWhere('id', $owner->id);
            });

            if ($request->has('store_id') && $request->store_id !== 'all') {
                if (in_array($request->store_id, $storeIds)) {
                    $query->where('store_id', $request->store_id);
                } else {
                    $query->whereNull('id');
                }
            }
        }

        return $query;
    }

    public function index(Request $request)
    {
        return $this->visibleStaffQuery($request)->get();
    }

    #[OA\Get(
        path: '/staff/{staff}',
        summary: 'Get a staff account',
        description: 'Same visibility rules as the list endpoint — a staff member outside the caller\'s scope 404s rather than leaking whether the ID exists.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'staff', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'The staff user', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function show(Request $request, $id)
    {
        $staff = $this->visibleStaffQuery($request)->findOrFail($id);
        return response()->json($staff);
    }

    #[OA\Post(
        path: '/staff',
        summary: 'Create a staff account',
        description: 'Blocked (422) if the store\'s plan staff limit is already reached. If no password is given, one is derived from the PIN (or "1234" if no PIN either) — not secure, treat staff accounts as PIN-first.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['first_name', 'last_name', 'username', 'role', 'store_id'],
            properties: [
                new OA\Property(property: 'first_name', type: 'string'),
                new OA\Property(property: 'last_name', type: 'string'),
                new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true, description: 'Auto-generated as `{username}@local.dumosrx.com` if omitted'),
                new OA\Property(property: 'username', type: 'string', description: 'Unique per store'),
                new OA\Property(property: 'role', type: 'string', enum: ['admin', 'manager', 'specialist', 'sales_staff', 'auditor']),
                new OA\Property(property: 'password', type: 'string', nullable: true, minLength: 8),
                new OA\Property(property: 'pin', type: 'string', nullable: true, minLength: 4, maxLength: 4),
                new OA\Property(property: 'store_id', type: 'string'),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Created', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Validation failure, or staff limit reached for the plan'),
        ],
    )]
    public function store(Request $request)
    {
        if (!app(\App\Services\SubscriptionService::class)->checkLimit($request->user(), 'staff')) {
            return response()->json([
                'message' => 'Staff limit reached for your current plan. Please upgrade your plan to add more staff.'
            ], 422);
        }

        $request->validate([
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'email' => 'nullable|email|unique:users',
            'username' => ['required', 'string', Rule::unique('users', 'username')->where('store_id', $request->store_id)],
            'role' => 'required|string|in:admin,manager,specialist,sales_staff,auditor',
            'password' => 'nullable|min:8',
            'pin' => 'nullable|string|size:4',
            'store_id' => 'required|exists:stores,id',
        ]);

        $email = $request->email;
        if (empty($email)) {
            $email = $request->username . '@local.dumosrx.com';
        }

        $roleObj = \App\Models\Role::where('slug', $request->role)->first();

        $pin = $request->pin ?: '1234';
        $password = $request->password ? Hash::make($request->password) : Hash::make($pin);

        $user = User::create([
            'store_id' => $request->store_id,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $email,
            'username' => $request->username,
            'role' => $request->role,
            'role_id' => $roleObj ? $roleObj->id : null,
            'password' => $password,
            'pin' => $pin,
            'is_active' => true,
        ]);

        return response()->json($user, 201);
    }

    #[OA\Patch(
        path: '/staff/{staff}',
        summary: 'Update a staff account (PATCH alias of PUT)',
        description: 'Re-activating a previously deactivated staff member (`is_active: true`) is blocked (422) if it would exceed the plan\'s staff limit.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'staff', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'first_name', type: 'string'),
            new OA\Property(property: 'last_name', type: 'string'),
            new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
            new OA\Property(property: 'username', type: 'string'),
            new OA\Property(property: 'role', type: 'string', enum: ['admin', 'manager', 'specialist', 'sales_staff', 'auditor']),
            new OA\Property(property: 'password', type: 'string', nullable: true),
            new OA\Property(property: 'pin', type: 'string'),
            new OA\Property(property: 'store_id', type: 'string'),
            new OA\Property(property: 'is_active', type: 'boolean'),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    #[OA\Put(
        path: '/staff/{staff}',
        summary: 'Update a staff account',
        description: 'Re-activating a previously deactivated staff member (`is_active: true`) is blocked (422) if it would exceed the plan\'s staff limit.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'staff', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'first_name', type: 'string'),
            new OA\Property(property: 'last_name', type: 'string'),
            new OA\Property(property: 'email', type: 'string', format: 'email', nullable: true),
            new OA\Property(property: 'username', type: 'string'),
            new OA\Property(property: 'role', type: 'string', enum: ['admin', 'manager', 'specialist', 'sales_staff', 'auditor']),
            new OA\Property(property: 'password', type: 'string', nullable: true),
            new OA\Property(property: 'pin', type: 'string'),
            new OA\Property(property: 'store_id', type: 'string'),
            new OA\Property(property: 'is_active', type: 'boolean'),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request, User $staff)
    {
        $request->validate([
            'first_name' => 'string',
            'last_name' => 'string',
            'email' => ['nullable', 'email', Rule::unique('users', 'email')->ignore($staff->id)],
            'username' => [
                'string',
                Rule::unique('users', 'username')
                    ->where('store_id', $request->store_id ?? $staff->store_id)
                    ->ignore($staff->id),
            ],
            // 'store_owner' is included here (unlike the create rule above)
            // because this same endpoint is also used to edit the owner's
            // own "Main Account" row — the web staff table explicitly
            // supports that (see isMainAccount in staff-table.tsx). The
            // dropdown has no option for it (you can't promote a random
            // staff member TO owner from here), but since formData.role
            // defaults to the row's real current role, any edit to that
            // row that doesn't touch the role field re-submits
            // "store_owner" verbatim — rejecting it here broke every other
            // field edit (e.g. adding a username) on the owner's own row.
            'role' => 'string|in:admin,manager,specialist,sales_staff,auditor,store_owner',
            'pin' => 'string|size:4',
            // A store owner's own row legitimately has a null store_id (they
            // aren't tied to one store the way staff are) — without
            // `nullable` here, editing that "Main Account" row for any
            // reason fails this check whenever store_id ends up null/empty,
            // and Laravel's default `exists` message ("The selected store id
            // is invalid") is identical in shape to the `in` rule's message
            // above, so it reads as if whatever field was actually being
            // changed (e.g. role) was the problem.
            'store_id' => 'nullable|exists:stores,id',
        ]);

        $data = $request->only(['first_name', 'last_name', 'email', 'username', 'role', 'pin', 'store_id', 'is_active']);
        
        if (isset($data['is_active']) && $data['is_active'] == true && !$staff->is_active) {
            if (!app(\App\Services\SubscriptionService::class)->checkLimit($request->user(), 'staff')) {
                return response()->json([
                    'message' => 'Staff limit reached for your current plan. Please upgrade your plan to reactivate staff.'
                ], 422);
            }
        }
        if ($request->has('password') && !empty($request->password)) {
            $data['password'] = Hash::make($request->password);
        }

        if ($request->has('role')) {
            $roleObj = \App\Models\Role::where('slug', $request->role)->first();
            $data['role_id'] = $roleObj ? $roleObj->id : null;
        }

        if ($request->has('email') && empty($request->email)) {
            $username = $request->username ?? $staff->username;
            $data['email'] = $username . '@local.dumosrx.com';
        }

        $staff->update($data);

        return response()->json($staff);
    }

    #[OA\Delete(
        path: '/staff/{staff}',
        summary: 'Deactivate a staff account',
        description: 'Soft "delete" — sets `is_active: false` rather than removing the record.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'staff', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deactivated', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(User $staff)
    {
        $staff->update(['is_active' => false]);
        return response()->json(['message' => 'Staff deactivated']);
    }
}

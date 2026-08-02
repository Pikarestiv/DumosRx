<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class CouponController extends Controller
{
    #[OA\Get(
        path: '/admin/coupons',
        summary: 'List all subscription coupons',
        tags: ['Admin: Coupons'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Coupons, with assigned user and usage count', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index()
    {
        $coupons = Coupon::with('assignedUser')->withCount('usages')->orderBy('created_at', 'desc')->get();
        return response()->json($coupons);
    }

    #[OA\Post(
        path: '/admin/coupons',
        summary: 'Create a subscription coupon',
        tags: ['Admin: Coupons'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['code', 'type', 'value'],
            properties: [
                new OA\Property(property: 'code', type: 'string'),
                new OA\Property(property: 'type', type: 'string', enum: ['discount_percent', 'discount_amount', 'trial_extension']),
                new OA\Property(property: 'value', type: 'integer', minimum: 0),
                new OA\Property(property: 'max_uses', type: 'integer', nullable: true),
                new OA\Property(property: 'max_uses_per_user', type: 'integer', nullable: true, description: 'Defaults to 1'),
                new OA\Property(property: 'assigned_to_user_id', type: 'string', format: 'uuid', nullable: true),
                new OA\Property(property: 'target_plan', type: 'string', nullable: true),
                new OA\Property(property: 'target_interval', type: 'string', enum: ['monthly', 'yearly'], nullable: true),
                new OA\Property(property: 'expires_at', type: 'string', format: 'date-time', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 201, description: 'Created', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string|unique:coupons,code',
            'type' => 'required|in:discount_percent,discount_amount,trial_extension',
            'value' => 'required|integer|min:0',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_user' => 'nullable|integer|min:1',
            'assigned_to_user_id' => 'nullable|uuid|exists:users,id',
            'target_plan' => 'nullable|string',
            'target_interval' => 'nullable|in:monthly,yearly',
            'expires_at' => 'nullable|date|after:now',
        ]);

        $validated['created_by'] = $request->user()->id;
        if (!isset($validated['max_uses_per_user'])) {
            $validated['max_uses_per_user'] = 1;
        }

        $coupon = Coupon::create($validated);

        return response()->json($coupon, 201);
    }

    /**
     * Update the specified coupon in storage.
     */
    public function update(Request $request, Coupon $coupon)
    {
        $validated = $request->validate([
            'code' => 'required|string|unique:coupons,code,' . $coupon->id,
            'type' => 'required|in:discount_percent,discount_amount,trial_extension',
            'value' => 'required|integer|min:0',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_user' => 'nullable|integer|min:1',
            'assigned_to_user_id' => 'nullable|uuid|exists:users,id',
            'target_plan' => 'nullable|string',
            'target_interval' => 'nullable|in:monthly,yearly',
            'expires_at' => 'nullable|date',
        ]);

        if (!isset($validated['max_uses_per_user'])) {
            $validated['max_uses_per_user'] = 1;
        }

        $coupon->update($validated);

        return response()->json($coupon);
    }

    #[OA\Put(
        path: '/admin/coupons/{coupon}/toggle',
        summary: 'Toggle a coupon active/inactive',
        tags: ['Admin: Coupons'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'coupon', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Updated coupon', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function toggleActive(Coupon $coupon)
    {
        $coupon->update(['is_active' => !$coupon->is_active]);
        return response()->json($coupon);
    }

    #[OA\Get(
        path: '/admin/coupons/{coupon}/usages',
        summary: 'List redemptions of a coupon',
        tags: ['Admin: Coupons'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'coupon', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Usages, with user eager-loaded', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function usages(Coupon $coupon)
    {
        $usages = $coupon->usages()->with('user')->orderBy('used_at', 'desc')->get();
        return response()->json($usages);
    }

    #[OA\Delete(
        path: '/admin/coupons/{coupon}',
        summary: 'Delete a coupon',
        tags: ['Admin: Coupons'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'coupon', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(Coupon $coupon)
    {
        $coupon->delete();
        return response()->json(['message' => 'Coupon deleted']);
    }
}

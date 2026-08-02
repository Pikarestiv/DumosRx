<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Broadcast;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use OpenApi\Attributes as OA;

class BroadcastController extends Controller
{
    #[OA\Get(
        path: '/announcements',
        summary: 'Get active broadcast announcements targeted at the caller',
        description: 'Public, but targeting narrows based on the caller: authenticated users see "all", announcements naming their user ID, and (for store_owner/admin) "pharmacies"/"stores"-targeted ones. Unauthenticated callers with an `X-Store-ID` header see "all" plus store-targeted ones naming that store. Everyone else just sees "all".',
        tags: ['Announcements'],
        parameters: [new OA\HeaderParameter(name: 'X-Store-ID', schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Announcements', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'data', type: 'array', items: new OA\Items(type: 'object')),
            ])),
        ],
    )]
    public function index(Request $request)
    {
        $user = auth('sanctum')->user();
        $storeId = $request->header('X-Store-ID');

        $query = Broadcast::active()->orderBy('created_at', 'desc');

        if ($user) {
            $query->where(function ($q) use ($user) {
                // Show to all users
                $q->where('target_type', 'all');

                // Show to specific users
                $q->orWhere(function ($q2) use ($user) {
                    $q2->where('target_type', 'specific')
                       ->whereJsonContains('user_ids', $user->id);
                });

                // Show to store owners (admin/store_owner)
                if ($user->role === 'store_owner' || $user->role === 'admin') {
                    $q->orWhereIn('target_type', ['pharmacies', 'stores']);
                }
            });
        } elseif ($storeId) {
            $query->where(function ($q) use ($storeId) {
                // Show to all
                $q->where('target_type', 'all');

                // Show to specific stores
                $q->orWhere(function ($q2) use ($storeId) {
                    $q2->where('target_type', 'specific')
                       ->whereJsonContains('user_ids', $storeId);
                });
            });
        } else {
            $query->where('target_type', 'all');
        }

        $broadcasts = $query->get();

        return response()->json([
            'success' => true,
            'data' => $broadcasts
        ]);
    }

    #[OA\Get(
        path: '/admin/announcements',
        summary: 'List all broadcast announcements (admin)',
        tags: ['Announcements'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'All announcements, active or not', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'data', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function adminIndex()
    {
        $broadcasts = Broadcast::orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $broadcasts
        ]);
    }

    #[OA\Post(
        path: '/admin/announcements',
        summary: 'Create a broadcast announcement',
        tags: ['Announcements'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['title', 'message', 'type', 'target_type'],
            properties: [
                new OA\Property(property: 'title', type: 'string', maxLength: 255),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'type', type: 'string', enum: ['info', 'warning', 'danger', 'success']),
                new OA\Property(property: 'target_type', type: 'string', enum: ['all', 'pharmacies', 'stores', 'specific']),
                new OA\Property(property: 'user_ids', type: 'array', items: new OA\Items(type: 'string'), nullable: true, description: 'Required when target_type=specific'),
                new OA\Property(property: 'expires_at', type: 'string', format: 'date-time', nullable: true),
                new OA\Property(property: 'is_active', type: 'boolean'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Created', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'data', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'type' => 'required|string|in:info,warning,danger,success',
            'target_type' => 'required|string|in:all,pharmacies,stores,specific',
            'user_ids' => 'nullable|array',
            'expires_at' => 'nullable|date',
            'is_active' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $broadcast = Broadcast::create($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Broadcast created successfully',
            'data' => $broadcast
        ]);
    }

    #[OA\Put(
        path: '/admin/announcements/{id}',
        summary: 'Update a broadcast announcement',
        tags: ['Announcements'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'title', type: 'string', maxLength: 255),
            new OA\Property(property: 'message', type: 'string'),
            new OA\Property(property: 'type', type: 'string', enum: ['info', 'warning', 'danger', 'success']),
            new OA\Property(property: 'target_type', type: 'string', enum: ['all', 'pharmacies', 'stores', 'specific']),
            new OA\Property(property: 'user_ids', type: 'array', items: new OA\Items(type: 'string'), nullable: true),
            new OA\Property(property: 'expires_at', type: 'string', format: 'date-time', nullable: true),
            new OA\Property(property: 'is_active', type: 'boolean'),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'data', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, description: 'Broadcast not found', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean', example: false),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request, $id)
    {
        $broadcast = Broadcast::find($id);

        if (!$broadcast) {
            return response()->json(['success' => false, 'message' => 'Broadcast not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'title' => 'string|max:255',
            'message' => 'string',
            'type' => 'string|in:info,warning,danger,success',
            'target_type' => 'string|in:all,pharmacies,stores,specific',
            'user_ids' => 'nullable|array',
            'expires_at' => 'nullable|date',
            'is_active' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $broadcast->update($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Broadcast updated successfully',
            'data' => $broadcast
        ]);
    }

    #[OA\Patch(
        path: '/admin/announcements/{id}/toggle',
        summary: 'Toggle a broadcast announcement active/inactive',
        tags: ['Announcements'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Toggled', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'data', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, description: 'Broadcast not found'),
        ],
    )]
    public function toggle($id)
    {
        $broadcast = Broadcast::find($id);

        if (!$broadcast) {
            return response()->json(['success' => false, 'message' => 'Broadcast not found'], 404);
        }

        $broadcast->is_active = !$broadcast->is_active;
        $broadcast->save();

        return response()->json([
            'success' => true,
            'message' => 'Broadcast status toggled',
            'data' => $broadcast
        ]);
    }

    #[OA\Delete(
        path: '/admin/announcements/{id}',
        summary: 'Delete a broadcast announcement',
        tags: ['Announcements'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Deleted', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, description: 'Broadcast not found'),
        ],
    )]
    public function destroy($id)
    {
        $broadcast = Broadcast::find($id);

        if (!$broadcast) {
            return response()->json(['success' => false, 'message' => 'Broadcast not found'], 404);
        }

        $broadcast->delete();

        return response()->json([
            'success' => true,
            'message' => 'Broadcast deleted successfully'
        ]);
    }
}

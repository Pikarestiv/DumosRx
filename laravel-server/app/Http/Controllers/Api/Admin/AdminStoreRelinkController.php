<?php

namespace App\Http\Controllers\Api\Admin;

use App\Models\Store;
use App\Services\TillRelinkService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class AdminStoreRelinkController extends AdminBaseController
{
    #[OA\Post(
        path: '/admin/stores/{id}/relink-code',
        summary: "Generate an 8-character till re-link code for a store on behalf of its owner",
        description: "Creates a single-use 15-minute re-link code that staff can enter at the till to re-authenticate offline or unlinked devices without needing the owner's credentials.",
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', description: 'Store ID', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Code generated', content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'code', type: 'string', example: 'A3K9XP2W'),
                    new OA\Property(property: 'expires_at', type: 'string', example: '2026-11-11T12:15:00+00:00'),
                ]
            )),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden'),
            new OA\Response(response: 404, description: 'Store or owner not found'),
        ],
    )]
    public function generate(Request $request, string $id, TillRelinkService $relinks)
    {
        $store = Store::findOrFail($id);

        if (! $store->user) {
            return response()->json(['message' => 'Store owner not found.'], 404);
        }

        $result = $relinks->generateForAdmin($request->user(), $store, [
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json($result);
    }
}

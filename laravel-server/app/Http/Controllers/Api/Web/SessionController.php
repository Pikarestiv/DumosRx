<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Jenssegers\Agent\Agent;
use OpenApi\Attributes as OA;

class SessionController extends Controller
{
    #[OA\Get(
        path: '/sessions',
        summary: "List the caller's active login sessions (Sanctum tokens)",
        tags: ['Sessions'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Sessions, newest-used first', content: new OA\JsonContent(type: 'array', items: new OA\Items(properties: [
                new OA\Property(property: 'id', type: 'string'),
                new OA\Property(property: 'name', type: 'string', description: 'Device name given at login'),
                new OA\Property(property: 'ip_address', type: 'string', nullable: true),
                new OA\Property(property: 'user_agent', type: 'string', nullable: true),
                new OA\Property(property: 'last_used_at', type: 'string', format: 'date-time', nullable: true),
                new OA\Property(property: 'created_at', type: 'string', format: 'date-time'),
                new OA\Property(property: 'is_current', type: 'boolean'),
            ]))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $user = $request->user();
        $tokens = $user->tokens()->orderBy('last_used_at', 'desc')->get();

        $currentProvider = $user->currentAccessToken();

        $sessions = $tokens->map(function ($token) use ($currentProvider) {
            $isCurrent = $currentProvider && $currentProvider->id === $token->id;

            return [
                'id' => $token->id,
                'name' => $token->name,
                'ip_address' => $token->ip_address,
                'user_agent' => $token->user_agent,
                'last_used_at' => $token->last_used_at,
                'created_at' => $token->created_at,
                'is_current' => $isCurrent,
            ];
        });

        return response()->json($sessions);
    }

    #[OA\Delete(
        path: '/sessions/{id}',
        summary: 'Revoke a specific session (log another device out)',
        description: 'Cannot revoke the session making the request; use `/logout` for that.',
        tags: ['Sessions'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Revoked', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Attempted to revoke the current session', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function destroy(Request $request, $id)
    {
        $token = $request->user()->tokens()->where('id', $id)->first();

        if (!$token) {
            return response()->json(['message' => 'Session not found'], 404);
        }

        // Prevent deleting the current session using this endpoint
        if ($request->user()->currentAccessToken()->id === $token->id) {
            return response()->json(['message' => 'Cannot revoke current session. Use logout instead.'], 403);
        }

        $token->delete();

        return response()->json(['message' => 'Session revoked successfully']);
    }

    #[OA\Post(
        path: '/sessions/revoke-all',
        summary: 'Revoke every other session, keeping only the current one',
        tags: ['Sessions'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Revoked', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function revokeAll(Request $request)
    {
        $currentTokenId = $request->user()->currentAccessToken()->id;

        $request->user()->tokens()->where('id', '!=', $currentTokenId)->delete();

        return response()->json(['message' => 'All other sessions revoked successfully']);
    }
}

<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Jenssegers\Agent\Agent;

class SessionController extends Controller
{
    /**
     * Get all active sessions (tokens) for the authenticated user.
     */
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

    /**
     * Revoke a specific session (token) by ID.
     */
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

    /**
     * Revoke all sessions (tokens) except the current one.
     */
    public function revokeAll(Request $request)
    {
        $currentTokenId = $request->user()->currentAccessToken()->id;

        $request->user()->tokens()->where('id', '!=', $currentTokenId)->delete();

        return response()->json(['message' => 'All other sessions revoked successfully']);
    }
}

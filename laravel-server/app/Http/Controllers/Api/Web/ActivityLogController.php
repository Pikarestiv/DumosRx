<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class ActivityLogController extends Controller
{
    #[OA\Get(
        path: '/logs',
        summary: "List the caller's store activity log (owner + all staff)",
        tags: ['Activity Logs'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Paginated logs, with user eager-loaded, excluding client-error entries', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        $admin = $request->user();
        
        // Get all stores owned by the admin
        $storeIds = Store::where('user_id', $admin->id)->pluck('id');
        
        // Get all staff users in those stores
        $userIds = clone $storeIds; // wait, storeIds is a collection of UUIDs
        $staffIds = User::whereIn('store_id', $storeIds)->pluck('id');
        
        // Include the admin's own ID
        $staffIds->push($admin->id);

        $logs = ActivityLog::with('user')
            ->whereIn('user_id', $staffIds)
            ->where('action', '!=', 'CLIENT_API_ERROR')
            ->latest()
            ->paginate(50);

        return response()->json($logs);
    }

    #[OA\Post(
        path: '/logs/client-error',
        summary: 'Log a client-side API/fetch failure',
        description: 'Public and deliberately unauthenticated so it can capture failures that happen before login (e.g. the system-config fetch on app boot). Logs to `laravel.log` always; also writes an `ActivityLog` row if a valid Sanctum token happens to be present.',
        tags: ['Activity Logs'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['method', 'url', 'message'],
            properties: [
                new OA\Property(property: 'method', type: 'string'),
                new OA\Property(property: 'url', type: 'string'),
                new OA\Property(property: 'status', nullable: true),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'details', type: 'object', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Logged', content: new OA\JsonContent(properties: [new OA\Property(property: 'status', type: 'string', example: 'logged')])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function logClientError(Request $request)
    {
        $request->validate([
            'method' => 'required|string',
            'url' => 'required|string',
            'status' => 'nullable',
            'message' => 'required|string',
            'details' => 'nullable|array',
            'deviceId' => 'nullable|string',
        ]);

        // No auth middleware guards this route (it needs to capture failures
        // that happen before login, e.g. the system-config fetch on app boot),
        // so the caller may or may not be authenticated.
        $user = $request->user('sanctum');
        $userLabel = $user ? "{$user->id} ({$user->email})" : 'guest';
        $deviceId = $request->input('deviceId', 'unknown');

        // Log to laravel.log
        Log::error("Client API Error [User: {$userLabel}] [Device: {$deviceId}]: {$request->input('method')} {$request->input('url')} - Status: {$request->input('status')} - Message: {$request->input('message')}", [
            'details' => $request->input('details'),
            'device_id' => $deviceId,
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        // Log to ActivityLog table (requires a user; guest errors only go to laravel.log)
        if ($user) {
            ActivityLog::create([
                'user_id' => $user->id,
                'action' => 'CLIENT_API_ERROR',
                'description' => "Failed: {$request->input('method')} {$request->input('url')} ({$request->input('status')})",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'properties' => [
                    'error_message' => $request->input('message'),
                    'details' => $request->input('details'),
                    'device_id' => $deviceId,
                ]
            ]);
        }

        return response()->json(['status' => 'logged']);
    }
}

<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class NotificationController extends Controller
{
    #[OA\Get(
        path: '/alerts',
        summary: 'Get merged in-app notifications + recent relevant activity for the caller',
        description: 'For `super_admin`, activity entries are global security alerts (login failures, unauthorized access, deletions) across all users. For everyone else, it\'s their own non-technical activity log. Never errors to the client — failures degrade to an empty array.',
        tags: ['Notifications'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Merged, unsorted-by-date list (up to 10 notifications + 10 activity entries)', content: new OA\JsonContent(type: 'array', items: new OA\Items(properties: [
                new OA\Property(property: 'id', type: 'string'),
                new OA\Property(property: 'title', type: 'string'),
                new OA\Property(property: 'description', type: 'string'),
                new OA\Property(property: 'time', type: 'string', description: 'Human-relative, e.g. "3 hours ago"'),
                new OA\Property(property: 'type', type: 'string', enum: ['success', 'info', 'warning', 'error']),
                new OA\Property(property: 'isRead', type: 'boolean'),
                new OA\Property(property: 'category', type: 'string', enum: ['system', 'log']),
                new OA\Property(property: 'link', type: 'string', nullable: true),
            ]))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function index(Request $request)
    {
        try {
            $user = $request->user();
            $userId = $user->id;

            // Fetch actual notifications from the new table
            $systemNotifications = Notification::where('user_id', $userId)
                ->latest()
                ->limit(10)
                ->get()
                ->map(function ($notif) {
                    $link = null;
                    if (str_contains($notif->title, 'Account Deletion')) {
                        if (preg_match('/\(([^)]+)\)/', $notif->message, $matches)) {
                            $link = "/admin/users?search=" . urlencode($matches[1]);
                        }
                    }
                    return [
                        'id' => $notif->id,
                        'title' => $notif->title,
                        'description' => $notif->message,
                        'time' => $notif->created_at->diffForHumans(),
                        'type' => $notif->type ?? 'info',
                        'isRead' => $notif->is_read,
                        'category' => 'system',
                        'link' => $link
                    ];
                });

            // Fetch activity logs
            if ($user->role === 'super_admin') {
                // Super admins see global system security alerts from all users
                $activityLogs = ActivityLog::whereIn('action', [
                    'LOGIN_FAILURE',
                    'UNAUTHORIZED_ACCESS',
                    'DATA_EXPORT',
                    'ACCOUNT_DELETION_REQUESTED',
                    'ACCOUNT_DELETION_CANCELLED'
                ])
                    ->with('user')
                    ->latest()
                    ->limit(10)
                    ->get()
                    ->map(function ($log) {
                        $link = null;
                        if (in_array($log->action, ['ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELLED']) && $log->user) {
                            $link = "/admin/users?search=" . urlencode($log->user->email);
                        }
                        return [
                            'id' => $log->id,
                            'title' => $this->getGlobalAlertTitle($log->action),
                            'description' => $log->description,
                            'time' => $log->created_at->diffForHumans(),
                            'type' => $this->inferType($log->action),
                            'isRead' => true,
                            'category' => 'log',
                            'link' => $link
                        ];
                    });
            } else {
                // Regular users only see their own non-technical activities
                $activityLogs = ActivityLog::where('user_id', $userId)
                    ->whereNotIn('action', ['CLIENT_API_ERROR', 'FRONTEND_ERROR', 'UNAUTHORIZED_ACCESS', 'LOGIN_FAILURE'])
                    ->latest()
                    ->limit(10)
                    ->get()
                    ->map(function ($log) {
                        return [
                            'id' => $log->id,
                            'title' => $log->action,
                            'description' => $log->description,
                            'time' => $log->created_at->diffForHumans(),
                            'type' => $this->inferType($log->action),
                            'isRead' => true,
                            'category' => 'log',
                            'link' => null
                        ];
                    });
            }

            // Merge and sort
            $merged = $systemNotifications->concat($activityLogs)->values();

            return response()->json($merged);
        } catch (\Exception $e) {
            Log::error("Notification Fetch Error: " . $e->getMessage());
            return response()->json([]);
        }
    }

    private function getGlobalAlertTitle($action)
    {
        $map = [
            'LOGIN_FAILURE' => 'Multiple 401s',
            'UNAUTHORIZED_ACCESS' => 'Unauthorized Access Attempt',
            'DATA_EXPORT' => 'Large Export Initiated',
            'ACCOUNT_DELETION_REQUESTED' => 'Account Deletion Requested',
            'ACCOUNT_DELETION_CANCELLED' => 'Account Deletion Cancelled'
        ];
        return $map[$action] ?? $action;
    }

    private function inferType($action)
    {
        $action = strtolower($action);
        if (str_contains($action, 'sale') || str_contains($action, 'payment')) return 'success';
        if (str_contains($action, 'stock') || str_contains($action, 'inventory') || str_contains($action, 'cancelled')) return 'info';
        if (str_contains($action, 'error') || str_contains($action, 'failed') || str_contains($action, 'failure') || str_contains($action, 'unauthorized')) return 'error';
        if (str_contains($action, 'deletion') || str_contains($action, 'delete')) return 'warning';
        return 'info';
    }

    #[OA\Post(
        path: '/alerts/{id}/read',
        summary: 'Mark a notification as read',
        tags: ['Notifications'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Marked', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function markAsRead(Request $request, $id)
    {
        Notification::where('user_id', $request->user()->id)
            ->where('id', $id)
            ->update(['is_read' => true]);

        return response()->json(['message' => 'Notification marked as read']);
    }
}

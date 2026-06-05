<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class NotificationController extends Controller
{
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

    public function markAsRead(Request $request, $id)
    {
        Notification::where('user_id', $request->user()->id)
            ->where('id', $id)
            ->update(['is_read' => true]);

        return response()->json(['message' => 'Notification marked as read']);
    }
}

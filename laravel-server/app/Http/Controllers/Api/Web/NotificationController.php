<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        try {
            $userId = $request->user()->id;

            // Fetch actual notifications from the new table
            $systemNotifications = Notification::where('user_id', $userId)
                ->latest()
                ->limit(10)
                ->get()
                ->map(function ($notif) {
                    return [
                        'id' => $notif->id,
                        'title' => $notif->title,
                        'description' => $notif->message,
                        'time' => $notif->created_at->diffForHumans(),
                        'type' => $notif->type ?? 'info',
                        'isRead' => $notif->is_read,
                        'category' => 'system'
                    ];
                });

            // Fetch recent activity logs
            $activityLogs = ActivityLog::where('user_id', $userId)
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
                        'category' => 'log'
                    ];
                });

            // Merge and sort
            $merged = $systemNotifications->concat($activityLogs)->values();

            return response()->json($merged);
        } catch (\Exception $e) {
            \Log::error("Notification Fetch Error: " . $e->getMessage());
            return response()->json([]);
        }
    }

    private function inferType($action)
    {
        $action = strtolower($action);
        if (str_contains($action, 'sale') || str_contains($action, 'payment')) return 'success';
        if (str_contains($action, 'stock') || str_contains($action, 'inventory')) return 'warning';
        if (str_contains($action, 'error') || str_contains($action, 'failed')) return 'error';
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

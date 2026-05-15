<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->user()->id;

        // Fetch recent activity logs as notifications
        $notifications = ActivityLog::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'title' => $log->action,
                    'description' => $log->description,
                    'time' => $log->created_at->diffForHumans(),
                    'type' => $this->inferType($log->action),
                    'isRead' => false, // We don't have read status yet, so defaulting to false
                ];
            });

        return response()->json($notifications);
    }

    private function inferType($action)
    {
        $action = strtolower($action);
        if (str_contains($action, 'sale') || str_contains($action, 'payment'))
            return 'success';
        if (str_contains($action, 'stock') || str_contains($action, 'inventory'))
            return 'warning';
        if (str_contains($action, 'error') || str_contains($action, 'failed'))
            return 'error';
        return 'info';
    }
}

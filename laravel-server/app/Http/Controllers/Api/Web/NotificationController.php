<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        try {
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
                        'isRead' => false,
                    ];
                });

            return response()->json($notifications);
        } catch (\Exception $e) {
            \Log::error("Notification Fetch Error: " . $e->getMessage());
            return response()->json([]); // Return empty array instead of 500
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
}

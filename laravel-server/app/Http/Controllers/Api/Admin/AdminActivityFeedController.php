<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminActivityFeedService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AdminActivityFeedController extends AdminBaseController
{
    public function __construct(private AdminActivityFeedService $feed) {}

    public function index(Request $request)
    {
        $validated = $request->validate([
            'type' => 'nullable|string',
            'cursor' => 'nullable|date',
            'limit' => 'nullable|integer|min:1|max:'.AdminActivityFeedService::MAX_LIMIT,
        ]);

        try {
            return response()->json($this->feed->feed(
                Auth::user(),
                $validated['type'] ?? null,
                $validated['cursor'] ?? null,
                (int) ($validated['limit'] ?? AdminActivityFeedService::MAX_LIMIT),
            ));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}

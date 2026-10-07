<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\SyncCommandService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AdminSyncCommandController extends AdminBaseController
{
    public function __construct(private SyncCommandService $commands) {}

    public function index(string $id)
    {
        return response()->json(['commands' => $this->commands->forStore($id)]);
    }

    public function store(Request $request, string $id)
    {
        $validated = $request->validate([
            'device_id' => 'required|string|max:191',
            'action' => 'required|string|max:32',
            'table_name' => 'nullable|string|max:64',
            'record_id' => 'nullable|string|max:64',
        ]);

        try {
            $command = $this->commands->issue(
                $id,
                $validated['device_id'],
                $validated['action'],
                $validated['table_name'] ?? null,
                $validated['record_id'] ?? null,
                Auth::id(),
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['command' => ['id' => $command->id, 'status' => $command->status]], 201);
    }
}

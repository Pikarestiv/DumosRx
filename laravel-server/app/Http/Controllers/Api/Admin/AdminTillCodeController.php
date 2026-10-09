<?php

namespace App\Http\Controllers\Api\Admin;

use App\Models\AdminTillCode;
use App\Services\Admin\AdminTillSessionService;
use Illuminate\Http\Request;

class AdminTillCodeController extends AdminBaseController
{
    public function __construct(private AdminTillSessionService $sessions)
    {
    }

    public function mine(Request $request)
    {
        $codes = AdminTillCode::active()
            ->where('admin_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get(['id', 'label', 'last_used_at', 'created_at']);

        return response()->json(['codes' => $codes]);
    }

    public function issue(Request $request)
    {
        $validated = $request->validate(['label' => 'nullable|string|max:64']);

        $adminId = $request->user()->id;

        if (AdminTillCode::active()->where('admin_id', $adminId)->count()
            >= AdminTillSessionService::EQUALIZED_CHECKS) {
            return response()->json([
                'error' => 'Revoke an existing code first; three active codes is the maximum.',
            ], 422);
        }

        $code = $this->sessions->generateCode();

        $row = AdminTillCode::create([
            'admin_id' => $adminId,
            'code_hash' => $this->sessions->hashCode($code),
            'label' => $validated['label'] ?? null,
        ]);

        return response()->json(['id' => $row->id, 'code' => $code]);
    }

    public function revoke(Request $request, string $id)
    {
        $row = AdminTillCode::active()
            ->where('admin_id', $request->user()->id)
            ->where('id', $id)
            ->firstOrFail();

        $row->update(['revoked_at' => now()]);

        return response()->json(['ok' => true]);
    }
}

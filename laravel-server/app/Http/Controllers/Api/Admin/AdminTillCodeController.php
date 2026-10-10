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

    public function all(Request $request)
    {
        return response()->json(['codes' => $this->sessions->revealAll($request->user())]);
    }

    public function issue(Request $request)
    {
        $validated = $request->validate(['label' => 'nullable|string|max:64']);

        $adminId = $request->user()->id;

        if (AdminTillCode::active()->where('admin_id', $adminId)->count()
            >= AdminTillSessionService::EQUALIZED_CHECKS) {
            $refusal = 'Revoke an existing code first; three active codes is the maximum.';

            // `message` is what the web client's axios interceptor promotes
            // onto the thrown error; `error` is kept for any older bundle.
            return response()->json(['message' => $refusal, 'error' => $refusal], 422);
        }

        $code = $this->sessions->generateCode();

        $row = AdminTillCode::create([
            'admin_id' => $adminId,
            'code_hash' => $this->sessions->hashCode($code),
            'code_encrypted' => $this->sessions->encryptCode($code),
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

<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Services\Admin\AdminTillSessionService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminTillSessionController extends Controller
{
    public const REJECTION = ['error' => 'Wrong password.'];

    private const MAX_FIELD_BYTES = 64;

    public function __construct(private AdminTillSessionService $sessions)
    {
    }

    public function create(Request $request)
    {
        $email = $request->input('email');
        $code = $request->input('code');
        $deviceId = $request->input('device_id');

        // is_string rather than a (string) cast: an array input would raise
        // "Array to string conversion" and surface as a 500, which is itself a
        // distinguishable response.
        foreach ([$email, $code, $deviceId] as $field) {
            if (!is_string($field) || $field === '') {
                return response()->json(self::REJECTION, 401);
            }
        }

        if (strlen($code) > self::MAX_FIELD_BYTES || strlen($deviceId) > self::MAX_FIELD_BYTES) {
            return response()->json(self::REJECTION, 401);
        }

        $admin = $this->sessions->verify($email, $code);

        if (!$admin) {
            return response()->json(self::REJECTION, 401);
        }

        $storeId = $request->input('store_id');

        return response()->json($this->sessions->issue(
            $admin,
            is_string($storeId) && Str::isUuid($storeId) ? $storeId : null,
            $deviceId,
        ));
    }

    /**
     * Server time, but only for a live inspection session. The clock override
     * needs an authoritative clock anyway, so this doubles as the server-side
     * authorisation it would otherwise lack: the client flag in sessionStorage
     * is forgeable, a row in admin_till_sessions is not.
     */
    public function serverTime(Request $request)
    {
        $sessionId = $request->input('session_id');

        if (!is_string($sessionId) || $sessionId === '') {
            return response()->json(['error' => 'No inspection session.'], 401);
        }

        $session = $this->sessions->liveSession($sessionId);

        if (!$session) {
            return response()->json(['error' => 'No inspection session.'], 401);
        }

        return response()->json([
            'timestamp' => now()->toIso8601String(),
            'session_id' => $session->id,
        ]);
    }

    public function end(Request $request)
    {
        $sessionId = $request->input('session_id');
        $reason = $request->input('reason');

        $endReason = match ($reason) {
            'idle' => 'idle',
            'expired' => 'expired',
            default => 'signed_out',
        };

        if (is_string($sessionId) && $sessionId !== '') {
            $this->sessions->end($sessionId, $endReason);
        }

        return response()->json(['ok' => true]);
    }
}

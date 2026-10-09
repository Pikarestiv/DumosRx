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

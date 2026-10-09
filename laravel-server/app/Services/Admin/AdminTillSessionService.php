<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\AdminTillCode;
use App\Models\AdminTillSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class AdminTillSessionService
{
    public const ELIGIBLE_ROLES = ['platform_admin', 'super_admin'];

    public const CODE_LENGTH = 12;

    public const EQUALIZED_CHECKS = 3;

    public const MAX_SESSION_HOURS = 4;

    private static ?string $equalizerHash = null;

    public function generateCode(): string
    {
        return str_pad(
            (string) random_int(0, (10 ** self::CODE_LENGTH) - 1),
            self::CODE_LENGTH,
            '0',
            STR_PAD_LEFT,
        );
    }

    public function hashCode(string $code): string
    {
        return Hash::make($code);
    }

    public function verify(string $email, string $code): ?User
    {
        $admin = User::where('email', $email)->first();

        // is_active as well as role: deactivating an admin is the documented
        // off-boarding path (AdminUserController::deactivate), and it does not
        // cascade to their till codes — so without this an off-boarded admin
        // kept read access to every store till, the fold and the clock
        // override until somebody separately remembered to revoke the codes.
        if ($admin && (!$admin->is_active || !$admin->hasRole(self::ELIGIBLE_ROLES))) {
            $admin = null;
        }

        $codes = $admin
            ? AdminTillCode::active()
                ->where('admin_id', $admin->id)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(self::EQUALIZED_CHECKS)
                ->get()
            : collect();

        $matched = null;

        for ($i = 0; $i < self::EQUALIZED_CHECKS; $i++) {
            $row = $codes[$i] ?? null;
            $hash = $row->code_hash ?? $this->equalizerHash();

            if (Hash::check($code, $hash) && $row && !$matched) {
                $matched = $row;
            }
        }

        if (!$matched) {
            return null;
        }

        $matched->update(['last_used_at' => now()]);

        return $admin;
    }

    public function issue(User $admin, ?string $storeId, string $deviceId): array
    {
        $session = AdminTillSession::create([
            'admin_id' => $admin->id,
            'store_id' => $storeId,
            'device_id' => $deviceId,
            'started_at' => now(),
            'expires_at' => now()->addHours(self::MAX_SESSION_HOURS),
        ]);

        $this->log($admin, $storeId, $deviceId, 'admin_till_session_started', []);

        return [
            'session_id' => $session->id,
            'expires_in' => self::MAX_SESSION_HOURS * 3600,
            'expires_at' => $session->expires_at->toIso8601String(),
            'admin' => $admin->only(['id', 'first_name', 'last_name', 'email', 'role']),
        ];
    }

    /** A session that is open AND still inside its hard cap. */
    public function liveSession(string $sessionId): ?AdminTillSession
    {
        return AdminTillSession::live()
            ->where('id', $sessionId)
            ->where('expires_at', '>', now())
            ->first();
    }

    public function end(string $sessionId, string $reason = 'signed_out'): bool
    {
        $session = AdminTillSession::live()->where('id', $sessionId)->first();

        if (!$session) {
            return false;
        }

        $session->update(['ended_at' => now(), 'end_reason' => $reason]);

        // withTrashed: User uses SoftDeletes, and an admin deleted mid-session
        // would otherwise make the relation null and the typed log() throw.
        $admin = $session->admin()->withTrashed()->first();

        if (!$admin) {
            return true;
        }

        $this->log(
            $admin,
            $session->store_id,
            $session->device_id,
            'admin_till_session_ended',
            [
                'duration_seconds' => $session->started_at->diffInSeconds($session->ended_at),
                'reason' => $reason,
            ],
        );

        return true;
    }

    // Built at the app's configured bcrypt cost rather than a literal: Hash::check
    // uses the cost embedded in each hash, so a literal at a different cost would
    // make "admin with codes" distinguishable from "no admin" by timing.
    private function equalizerHash(): string
    {
        return self::$equalizerHash ??= Hash::make('equaliser');
    }

    private function log(
        User $admin,
        ?string $storeId,
        string $deviceId,
        string $action,
        array $extra,
    ): void {
        ActivityLog::create([
            'user_id' => $admin->id,
            'store_id' => $storeId,
            'action' => $action,
            'description' => "Read-only admin inspection on device {$deviceId}",
            'properties' => ['device_id' => $deviceId] + $extra,
        ]);
    }
}

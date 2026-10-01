<?php

namespace App\Services\Admin\Concerns;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The super-admin profile edit (PUT /admin/users/{id}) used by
 * AdminUserService. Split into its own concern, alongside
 * ResolvesTrialDuration, so AdminUserService does not keep growing past the
 * size its sibling admin services settled at.
 */
trait UpdatesUserProfiles
{
    public const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'agent'];

    public const EDITABLE_PROFILE_FIELDS = ['first_name', 'last_name', 'phone', 'email', 'role'];

    public static function platformRoleSlugs(): array
    {
        return array_merge(
            self::PLATFORM_ROLES,
            Role::where('is_system', false)->pluck('slug')->all(),
        );
    }

    public function updateUserProfile($id, array $data, $actorId)
    {
        return DB::transaction(function () use ($id, $data, $actorId) {
            $user = User::findOrFail($id);
            $changes = $this->resolveProfileChanges($user, $data);

            if (array_key_exists('role', $changes)) {
                $this->assertNotSelfRoleChange($user, $actorId);
                $this->assertNotLastActiveSuperAdmin($user);
            }

            if (empty($changes)) {
                return $user;
            }

            $this->applyProfileChanges($user, $changes);
            $this->logProfileUpdate($user, $changes, $actorId);

            return $user->refresh();
        });
    }

    /** Only the fields the caller actually sent whose value really differs,
     * so both the write and the audit diff stay to what changed. */
    private function resolveProfileChanges(User $user, array $data): array
    {
        $changes = [];

        foreach (self::EDITABLE_PROFILE_FIELDS as $field) {
            if (!array_key_exists($field, $data)) {
                continue;
            }

            $incoming = is_string($data[$field]) ? trim($data[$field]) : $data[$field];
            if ($incoming === $user->{$field}) {
                continue;
            }

            $changes[$field] = ['before' => $user->{$field}, 'after' => $incoming];
        }

        return $changes;
    }

    private function assertNotSelfRoleChange(User $user, $actorId): void
    {
        if ($user->id === $actorId) {
            throw ValidationException::withMessages([
                'role' => 'You cannot change your own role.',
            ]);
        }
    }

    private function assertNotLastActiveSuperAdmin(User $user): void
    {
        if ($user->role !== 'super_admin') {
            return;
        }

        $remaining = User::where('role', 'super_admin')
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->count();

        if ($remaining === 0) {
            throw ValidationException::withMessages([
                'role' => 'You cannot demote the last active super admin.',
            ]);
        }
    }

    private function applyProfileChanges(User $user, array $changes): void
    {
        foreach ($changes as $field => $change) {
            $user->{$field} = $change['after'];
        }

        if (array_key_exists('role', $changes)) {
            $user->role_id = Role::where('slug', $changes['role']['after'])->value('id');
        }

        $user->save();
    }

    private function logProfileUpdate(User $user, array $changes, $actorId): void
    {
        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'USER_PROFILE_UPDATED',
            'description' => 'Updated profile fields ('.implode(', ', array_keys($changes)).") for {$user->email} ({$user->id})",
            'properties' => [
                'before' => array_map(fn ($change) => $change['before'], $changes),
                'after' => array_map(fn ($change) => $change['after'], $changes),
            ],
        ]);
    }
}

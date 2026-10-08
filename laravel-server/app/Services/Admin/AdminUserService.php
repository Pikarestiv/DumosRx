<?php

namespace App\Services\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Mail\AdminNotification;
use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\Concerns\ResolvesTrialDuration;
use App\Services\Admin\Concerns\UpdatesUserProfiles;
use App\Services\Admin\Filters\UserListFilters;
use App\Services\Admin\Support\ListSortResolver;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * User-domain admin actions: the platform-wide users list, platform referral
 * codes/attribution, creating platform-level accounts, deactivate/reactivate/
 * delete/reset-password, and single/bulk notifications. Split out of the
 * original AdminService, alongside AdminStoreService and the
 * AdminSummary/Health/Catalog/Activity services, so each admin sub-domain
 * owns a service roughly the size of the others.
 */
class AdminUserService
{
    use ResolvesTrialDuration;
    use UpdatesUserProfiles;

    public function __construct(private AdminUserDeviceService $deviceService)
    {
    }

    /** Accounts a platform user (super_admin/platform_admin/agent) either
     * registered directly (AdminStoreController::registerStore) or that
     * signed up themselves using that user's platform_referral_code link. */
    public function getReferralsFor($userId)
    {
        $user = User::findOrFail($userId);

        $referredUsers = User::where('registered_by_id', $userId)
            ->with('store')
            ->orderByDesc('created_at')
            ->get(['id', 'first_name', 'last_name', 'email', 'role', 'store_id', 'created_at']);

        return [
            'platform_referral_code' => $user->platform_referral_code,
            'referral_link' => $user->platform_referral_code
                ? (config('app.frontend_url') . '/register?agent_ref=' . $user->platform_referral_code)
                : null,
            'total' => $referredUsers->count(),
            'accounts' => $referredUsers->map(function ($u) {
                return [
                    'id' => $u->id,
                    'name' => trim($u->first_name . ' ' . $u->last_name),
                    'email' => $u->email,
                    'role' => $u->role,
                    'store_name' => $u->store->name ?? null,
                    'registered_at' => $u->created_at,
                ];
            }),
        ];
    }

    /** Normalizes a candidate platform_referral_code to lowercase-alphanumeric
     * + hyphens the same way StoreController::checkSlug normalizes store
     * slugs, so both "Pika Restiv" and "pika_restiv" land on "pika-restiv". */
    public static function normalizeReferralCode($code)
    {
        return Str::slug($code);
    }

    public function checkReferralCodeAvailable($code, $ignoreUserId = null)
    {
        $normalized = self::normalizeReferralCode($code);

        $query = User::where('platform_referral_code', $normalized);
        if ($ignoreUserId) {
            $query->where('id', '!=', $ignoreUserId);
        }

        return [
            'available' => strlen($normalized) >= 3 && strlen($normalized) <= 32 && !$query->exists(),
            'code' => $normalized,
        ];
    }

    /** $callerId edits their own code unless they're super_admin, in which
     * case $targetUserId can be anyone's. Enforced in the controller too
     * (defense in depth) but re-checked here since this is the actual write. */
    public function updateReferralCode($targetUserId, $code, $callerId)
    {
        $caller = User::findOrFail($callerId);
        if ($targetUserId !== $callerId && !$caller->hasRole('super_admin')) {
            throw new \Exception('Only super_admin can edit another user\'s referral code.');
        }

        $target = User::findOrFail($targetUserId);
        if (!in_array($target->role, ['super_admin', 'platform_admin', 'agent'])) {
            throw new \Exception('Referral codes are only for platform-level accounts.');
        }

        $normalized = self::normalizeReferralCode($code);
        if (strlen($normalized) < 3 || strlen($normalized) > 32) {
            throw new \Exception('Referral code must be 3-32 characters (letters, numbers, hyphens).');
        }

        $taken = User::where('platform_referral_code', $normalized)->where('id', '!=', $targetUserId)->exists();
        if ($taken) {
            throw new \Exception('That referral code is already taken.');
        }

        $target->platform_referral_code = $normalized;
        $target->save();

        ActivityLog::create([
            'user_id' => $callerId,
            'action' => 'REFERRAL_CODE_UPDATED',
            'description' => "Set referral code for {$target->email} ({$target->id}) to \"{$normalized}\"",
        ]);

        return $target->platform_referral_code;
    }

    public const ACCOUNT_TYPE_OWNERS = 'owners';

    public const ACCOUNT_TYPE_STAFF = 'staff';

    public const ACCOUNT_TYPE_PLATFORM = 'platform';

    public const ACCOUNT_TYPES = [
        self::ACCOUNT_TYPE_OWNERS,
        self::ACCOUNT_TYPE_STAFF,
        self::ACCOUNT_TYPE_PLATFORM,
    ];

    private function constrainToAccountType($query, $accountType)
    {
        switch ($accountType) {
            case self::ACCOUNT_TYPE_OWNERS:
                return $query->whereHas('stores');
            case self::ACCOUNT_TYPE_STAFF:
                return $query->whereNotNull('store_id')->whereDoesntHave('stores');
            case self::ACCOUNT_TYPE_PLATFORM:
                return $query->whereNull('store_id')->whereDoesntHave('stores');
            default:
                return $query;
        }
    }

    /**
     * A single user's effective_permissions, for the per-admin
     * permission-override form — deliberately not folded into
     * getGlobalUsers()'s per-row mapping, which would re-run this N+1-prone
     * accessor for every row of a paginated list (see b7a39eea).
     */
    public function getEffectivePermissions(string $id): array
    {
        return User::findOrFail($id)->effective_permissions;
    }

    public function getGlobalUsers(UserListFilters $filters)
    {
        $query = User::query();

        $this->constrainToAccountType($query, $filters->accountType);

        if ($filters->storeId) {
            $query->where(function ($q) use ($filters) {
                $q->where('users.store_id', $filters->storeId)
                    ->orWhereHas('stores', fn ($sq) => $sq->where('stores.id', $filters->storeId));
            });
        }

        if ($filters->search) {
            $query->where(function ($q) use ($filters) {
                $search = $filters->search;
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('id', 'like', "%{$search}%");
            });
        }

        if ($filters->role) {
            $query->where('role', $filters->role);
        }

        $sortColumns = ListSortResolver::userColumns($filters->sort);

        if ($sortColumns === []) {
            $query->latest();
        } else {
            $direction = ListSortResolver::direction($filters->direction);
            foreach ($sortColumns as $column) {
                $query->orderBy($column, $direction);
            }
        }

        $paginator = $query->with(['store', 'employerStore'])->paginate(10, ['*'], 'page', $filters->page);

        $latestDeviceByUser = $this->deviceService->latestDevicePerUser(
            collect($paginator->items())->pluck('id'),
        );

        return [
            'data' => collect($paginator->items())->map(function ($user) use ($latestDeviceByUser) {
                $device = $latestDeviceByUser->get($user->id);

                return [
                    'id' => $user->id,
                    'name' => $user->first_name.' '.$user->last_name,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'phone' => $user->phone,
                    'email' => $user->email,
                    'role' => ucwords(str_replace('_', ' ', $user->role)),
                    // Raw slug alongside the humanized label above. The
                    // frontend was comparing against display-text literals
                    // like 'Store Admin' that ucwords() never actually
                    // produces for the 'admin' role slug (it produces
                    // 'Admin'), silently breaking role-gated UI for every
                    // admin-role user. Logic should key off this, not text.
                    'role_slug' => $user->role,
                    'store' => $user->displayStore ? $user->displayStore->name : 'Platform Admin',
                    'store_id' => $user->displayStore?->id,
                    'is_store_owner' => $user->store !== null,
                    'lastActive' => $user->last_login_at ? $user->last_login_at->diffForHumans() : 'Never',
                    'status' => $user->is_active ? 'Active' : 'Inactive',
                    'joinedAt' => $user->created_at->format('M d, Y'),
                    'deletionRequested' => $user->deletion_requested_at ? true : false,
                    'deletionReason' => $user->deletion_reason,
                    'lastSyncedAt' => $device ? $device->last_synced_at?->diffForHumans() : null,
                    'lastSyncDevice' => $device ? ($device->device_label ?: $device->device_id) : null,
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
            ],
        ];
    }

    public function grantUserTrial($userId, $plan, $durationString = null, $endDate = null)
    {
        return DB::transaction(function () use ($userId, $plan, $durationString, $endDate) {
            $user = User::findOrFail($userId);

            $resolvedEndDate = $this->resolveTrialEndDate($durationString, $endDate);

            // Refuse to silently discard remaining time on an existing
            // active (non-trial) subscription that runs past what this
            // trial would cover -- e.g. granting a 14-day goodwill trial
            // must not void the remaining months of an annual plan.
            $wouldShortenExisting = $user->subscriptions()
                ->where('status', 'active')
                ->where('end_date', '>', $resolvedEndDate)
                ->exists();

            if ($wouldShortenExisting) {
                throw new \Exception('User has an active subscription that extends beyond the requested trial period. Granting this trial would shorten their remaining paid time; extend or cancel it first.');
            }

            // Optional: Mark previous active subscriptions as expired or just leave them
            $user->subscriptions()->where('status', 'active')->update(['status' => 'expired']);

            // Create new trial subscription
            \App\Models\Subscription::create([
                'user_id' => $user->id,
                'plan_name' => strtolower($plan),
                'start_date' => now(),
                'end_date' => $resolvedEndDate,
                'status' => 'active',
                'is_trial' => true,
                'license_key' => 'DRX-TRIAL-'.strtoupper(Str::random(12)),
            ]);

            // Log activity
            $durationLabel = $endDate ? "until {$resolvedEndDate->toDateString()}" : $durationString;
            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'GRANT_FREE_TRIAL',
                'description' => "Granted {$durationLabel} {$plan} Free Trial to user {$user->email} ({$user->id})",
            ]);

            $this->notifyUser(
                $user->id,
                "You've been granted a ".ucfirst($plan)." Free Trial, valid until {$resolvedEndDate->format('d/m/Y')}. Enjoy!",
                'Free Trial Granted'
            );

            return true;
        });
    }

    /**
     * User-scoped counterpart of AdminStoreService::activatePaidPlan() -
     * manually activates a paid (non-trial) subscription for a payment
     * settled outside the automated checkout flow (e.g. bank transfer).
     */
    public function activatePaidPlan($userId, $plan, $billingCycle, $amount, $reference = null)
    {
        return DB::transaction(function () use ($userId, $plan, $billingCycle, $amount, $reference) {
            $user = User::findOrFail($userId);

            $endDate = $billingCycle === 'yearly' ? now()->addYear() : now()->addMonth();

            // Same guard as grantUserTrial(): don't let manually activating
            // a new paid plan silently expire an existing active
            // subscription that runs further into the future.
            $wouldShortenExisting = $user->subscriptions()
                ->where('status', 'active')
                ->where('end_date', '>', $endDate)
                ->exists();

            if ($wouldShortenExisting) {
                throw new \Exception('User already has an active subscription that extends beyond this billing cycle. Activating this plan would shorten their remaining paid time; extend or cancel it first.');
            }

            $user->subscriptions()->where('status', 'active')->update(['status' => 'expired']);

            $subscription = \App\Models\Subscription::create([
                'user_id' => $user->id,
                'plan_name' => strtolower($plan),
                'start_date' => now(),
                'end_date' => $endDate,
                'status' => 'active',
                'is_trial' => false,
                'license_key' => 'DRX-'.strtoupper(Str::random(12)),
            ]);

            \App\Models\PaymentTransaction::create([
                'subscription_id' => $subscription->id,
                'provider' => 'bank_transfer',
                'provider_reference' => $reference ?: 'MANUAL-'.strtoupper(Str::random(10)),
                'amount' => $amount,
                'currency' => 'NGN',
                'status' => 'success',
                'metadata' => [
                    'plan_name' => ucfirst($plan),
                    'billing_cycle' => $billingCycle,
                    'recorded_by' => Auth::id(),
                    'user_id' => $user->id,
                ],
            ]);

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'ACTIVATE_PAID_PLAN',
                'description' => "Activated {$plan} plan ({$billingCycle}) for user {$user->email} ({$user->id}) via bank transfer".($reference ? ", ref {$reference}" : ''),
            ]);

            $this->notifyUser(
                $user->id,
                "Your ".ucfirst($plan)." plan has been activated, valid until {$endDate->format('d/m/Y')}.",
                'Subscription Activated'
            );

            return true;
        });
    }

    public function createPlatformAdmin($data, $createdById = null)
    {
        return DB::transaction(function () use ($data, $createdById) {
            $roleSlug = $data['role'] ?? 'platform_admin';
            $roleObj = Role::where('slug', $roleSlug)->first();

            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => Hash::make($data['password']),
                'role' => $roleSlug,
                'role_id' => $roleObj ? $roleObj->id : null,
                'is_active' => true,
                'registered_by_id' => $createdById,
            ]);

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'PLATFORM_ACCOUNT_CREATED',
                'description' => "Created new {$roleSlug} account: {$user->email} ({$user->id})",
            ]);

            return $user;
        });
    }

    public function deactivateUser($id)
    {
        $user = User::findOrFail($id);
        $user->is_active = false;
        $user->save();

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'USER_DEACTIVATION',
            'description' => "Deactivated user account: {$user->email} ({$user->id})",
        ]);

        return true;
    }

    public function reactivateUser($id)
    {
        $user = User::findOrFail($id);
        $user->is_active = true;
        $user->save();

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'USER_REACTIVATION',
            'description' => "Reactivated user account: {$user->email} ({$user->id})",
        ]);

        return true;
    }

    public function deleteUser($id)
    {
        return DB::transaction(function () use ($id) {
            $user = User::findOrFail($id);

            $this->assertDeletionAllowed($user);

            $userEmail = $user->email;

            foreach ($user->stores as $store) {
                $store->forceFill([
                    'deleted_by_id' => Auth::id(),
                    'deletion_reason' => "Owner account deleted: {$userEmail} ({$user->id})",
                ])->save();

                $store->delete();
            }

            $user->delete();

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'USER_DELETION',
                'description' => "Deleted user account: {$userEmail} ({$id}). Their stores were archived with them.",
            ]);

            return true;
        });
    }

    private function assertDeletionAllowed(User $user): void
    {
        $actorId = Auth::id();

        if ($actorId === null) {
            throw new StoreActionBlockedException('No authenticated admin is performing this deletion.');
        }

        if ($user->id === $actorId) {
            throw new StoreActionBlockedException('You cannot delete your own account.');
        }

        $platformRoleSlugs = self::platformRoleSlugs();
        $resolvedRole = $user->userRole?->slug;
        $displayRole = $resolvedRole ?? $user->role;

        if (in_array($user->role, $platformRoleSlugs, true) || ($resolvedRole !== null && in_array($resolvedRole, $platformRoleSlugs, true))) {
            throw new StoreActionBlockedException(
                "This is a platform account ({$displayRole}). Platform accounts cannot be deleted from the users directory."
            );
        }
    }

    public function forcePasswordReset($id)
    {
        $user = User::findOrFail($id);

        // Generate a random temporary password
        $tempPassword = Str::random(12);
        $user->password = Hash::make($tempPassword);
        $user->save();

        // Send via email
        try {
            Mail::to($user->email)->send(new AdminNotification(
                "Your password has been reset by an administrator. Your temporary password is: <b>{$tempPassword}</b>. Please change it immediately.",
                'DumosRx: Password Reset'
            ));
        } catch (\Exception $e) {
            Log::error('Email Sending Failed for password reset: '.$e->getMessage());
        }

        $this->notifyUser($id, "Your password has been reset by an administrator. Your temporary password is: {$tempPassword}. Please change it immediately.", 'Security Alert');

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'PASSWORD_RESET_FORCE',
            'description' => "Forced password reset for user: {$user->email} ({$user->id})",
        ]);

        return ['temp_password' => $tempPassword];
    }

    public function notifyUser($id, $message, $title = 'Administrative Message')
    {
        $user = User::findOrFail($id);

        // Create actual notification record
        \App\Models\Notification::create([
            'user_id' => $user->id,
            'title' => $title,
            'message' => $message,
            'type' => 'urgent',
            'is_read' => false,
        ]);

        // Send via email
        try {
            Mail::to($user->email)->send(new AdminNotification($message, $title));
        } catch (\Exception $e) {
            Log::error('Email Sending Failed for notifyUser: '.$e->getMessage());
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'ADMIN_NOTIFICATION',
            'description' => "Sent notification to user {$user->email}: {$message}",
        ]);

        return true;
    }

    public function bulkNotify($filters, $message, $title)
    {
        $query = User::query();

        if (! empty($filters['account_type'])) {
            $this->constrainToAccountType($query, $filters['account_type']);
        }

        if (! empty($filters['role']) && $filters['role'] !== 'all') {
            $query->where('role', $filters['role']);
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->get();
        $count = $users->count();

        \App\Models\Notification::bulkCreateFor($users->pluck('id'), [
            'title' => $title,
            'message' => $message,
            'type' => 'urgent',
        ]);

        foreach ($users as $user) {
            // Send via email
            try {
                Mail::to($user->email)->send(new AdminNotification($message, $title));
            } catch (\Exception $e) {
                Log::error("Email Sending Failed for bulkNotify user {$user->id}: ".$e->getMessage());
            }
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'BULK_ADMIN_NOTIFICATION',
            'description' => "Sent bulk notification '{$title}' to {$count} users.",
        ]);

        return $count;
    }
}

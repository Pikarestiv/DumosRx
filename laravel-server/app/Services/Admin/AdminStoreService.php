<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\PaymentTransaction;
use App\Models\Role;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Admin\Concerns\ResolvesTrialDuration;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Store-domain admin actions: the platform-wide stores list, registering a
 * store on a customer's behalf, suspend/unsuspend, demo flagging, trial
 * grants, billing history, account-manager assignment, and impersonation.
 * Split out of the original AdminService, alongside AdminPlatformService and
 * AdminUserService, so each admin sub-domain owns a service roughly the
 * size of the others instead of one 1300-line class.
 */
class AdminStoreService
{
    use ResolvesTrialDuration;

    /**
     * Admin-scoped equivalent of SubscriptionController::billingHistory,
     * which is store-owner-self-service (scoped to Auth::id(), the
     * currently-authenticated user's own subscriptions/transactions) and
     * therefore unusable by a superadmin viewing an arbitrary other store.
     * Same underlying PaymentTransaction query, but scoped to the given
     * store's owner (Store::user_id — "the user who owns this store",
     * distinct from staff assigned via users.store_id) instead of the
     * authenticated user.
     *
     * Returns null if no store with this id exists, so the controller can
     * 404 instead of silently returning an empty transaction list.
     */
    public function getBillingHistoryForStore(string $storeId): ?array
    {
        $store = Store::find($storeId);
        if (!$store) {
            return null;
        }

        $ownerId = $store->user_id;

        $subscriptionIds = Subscription::where('user_id', $ownerId)->pluck('id');

        $transactions = PaymentTransaction::whereIn('subscription_id', $subscriptionIds)
            ->orWhere('metadata->user_id', $ownerId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($txn) {
                return [
                    'id' => $txn->id,
                    'date' => $txn->created_at->format('M j, Y'),
                    'desc' => ($txn->metadata['plan_name'] ?? 'Subscription') . ' Plan',
                    'amount' => '₦' . number_format($txn->amount, 0),
                    'status' => ucfirst($txn->status),
                    'reference' => $txn->provider_reference,
                    'receipt_url' => $txn->metadata['verification_data']['receipt_url'] ?? null,
                ];
            });

        return [
            'store_id' => $store->id,
            'store_name' => $store->name,
            'transactions' => $transactions,
        ];
    }

    public function getStores($page = 1, $search = null, $status = null, $plan = null)
    {
        // Correlated subquery instead of a plain withSum('sales', ...), for
        // two reasons:
        //
        // 1. No payment_status filter, matching every other revenue figure
        //    in the app (the platform-wide total above, and the store
        //    owner's own dashboard in DashboardService). Filtering to only
        //    'completed' here silently dropped pending and partial-payment
        //    credit sales (a real, actively-used status; see the sales
        //    payment_status enum migration).
        //
        // 2. Sales are matched by sales.store_id when present (the
        //    sync-populated, unambiguous scoping; see Store::sales()'s
        //    doc comment), falling back to the legacy cashier-based match
        //    (store staff, or the store owner's own sales) only for rows
        //    synced before the store_id column existed and still null.
        //    Without this fallback, a store's revenue depends entirely on
        //    whether Sale::sales() alone is used, which used to miss
        //    every owner-rung-up sale outright.
        $query = Store::with(['user.subscriptions', 'user.accountManager', 'user.registeredBy'])
            ->addSelect(['total_revenue' => DB::table('sales')
                ->selectRaw('COALESCE(SUM(sales.total_amount), 0)')
                ->where(function ($q) {
                    $q->whereColumn('sales.store_id', 'stores.id')
                        ->orWhere(function ($fallback) {
                            $fallback->whereNull('sales.store_id')
                                ->where(function ($cashierMatch) {
                                    $cashierMatch->whereColumn('sales.cashier_id', 'stores.user_id')
                                        ->orWhereIn('sales.cashier_id', function ($staffIds) {
                                            $staffIds->select('id')
                                                ->from('users')
                                                ->whereColumn('users.store_id', 'stores.id');
                                        });
                                });
                        });
                }),
            ]);

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('id', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($uq) use ($search) {
                        $uq->where('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        if ($status && $status !== 'all') {
            // Capitalize status if needed or check directly (e.g. Active, Suspended)
            $query->where('status', ucwords(strtolower($status)));
        }

        if ($plan && $plan !== 'all') {
            $query->whereHas('user.subscriptions', function ($sq) use ($plan) {
                $sq->where('status', 'active')
                    ->where('end_date', '>', now())
                    ->where('plan_name', $plan);
            });
        }

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($store) {
                $plan = 'free';
                if ($store->user && $store->user->subscriptions->isNotEmpty()) {
                    $sub = $store->user->subscriptions->sortByDesc('created_at')->first();
                    $plan = $sub->plan_name;
                }

                $manager = \App\Http\Controllers\Api\AccountManagerController::resolveFor($store->user);

                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name.' '.$store->user->last_name : 'N/A',
                    'email' => $store->user ? $store->user->email : 'N/A',
                    'plan' => $plan,
                    'status' => $store->status ?: 'Active',
                    'stores' => 1,
                    'revenue' => '₦'.number_format($store->total_revenue ?? 0),
                    'date' => $store->created_at->format('M d, Y'),
                    'is_demo' => (bool) $store->is_demo,
                    'account_manager' => $manager ? [
                        'id' => $manager->id,
                        'name' => trim("{$manager->first_name} {$manager->last_name}"),
                    ] : null,
                    // Whether account_manager above came from an explicit
                    // reassignment vs. falling back to registered_by_id/the
                    // platform default - lets the admin UI show "(default)"
                    // instead of implying every store was manually assigned.
                    'account_manager_is_explicit' => (bool) ($store->user?->account_manager_id),
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

    /** Platform staff eligible to be a store's "contact specialist" /
     * account manager - unpaginated (platform headcount is small), unlike
     * AdminUserService::getGlobalUsers() which lists every account on the
     * platform. */
    public function getAccountManagerCandidates()
    {
        return User::whereIn('role', ['super_admin', 'platform_admin', 'agent'])
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email', 'phone', 'role'])
            ->map(fn ($u) => [
                'id' => $u->id,
                'name' => trim("{$u->first_name} {$u->last_name}"),
                'email' => $u->email,
                'phone' => $u->phone,
                'role' => $u->role,
            ]);
    }

    public function registerStore($data, $registeredById = null)
    {
        return DB::transaction(function () use ($data, $registeredById) {
            // Create the owner user with role 'store_owner', matching the role
            // self-serve signup assigns (AuthController::register), so an
            // admin-registered store reads identically to one a customer
            // signed up for themselves. Permissions are the same either way
            // (RolesAndPermissionsSeeder grants 'admin' and 'store_owner'
            // an identical permission set); this only fixes the label.
            $roleObj = Role::where('slug', 'store_owner')->first();
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'username' => $data['username'],
                'phone' => $data['phone'],
                'password' => Hash::make($data['password']),
                'pin' => $data['pin'] ?? null,
                'role' => 'store_owner',
                'role_id' => $roleObj ? $roleObj->id : null,
                'registered_by_id' => $registeredById,
            ]);

            // Create the store
            $store = Store::create([
                'user_id' => $user->id,
                'name' => $data['store_name'],
                'device_id' => 'WEB-'.strtoupper(Str::random(8)),
                'status' => 'Active',
                'auto_sync_enabled' => true,
                'is_demo' => !empty($data['is_demo']),
            ]);

            // Create trial subscription
            app(\App\Services\SubscriptionService::class)->createTrial($user);

            if ($registeredById) {
                ActivityLog::create([
                    'user_id' => $registeredById,
                    'action' => 'ACCOUNT_REGISTERED_BY_STAFF',
                    'description' => "Registered store account: {$store->name} ({$store->id}) for {$user->email}",
                    'status' => 'success',
                ]);
            }

            return $store;
        });
    }

    /**
     * Shared by suspendStore/unsuspendStore - toggles status +
     * suspension_reason on the store and is_active on its owner together.
     */
    private function toggleStoreSuspension(string $id, bool $suspend, ?string $reason = null): bool
    {
        return DB::transaction(function () use ($id, $suspend, $reason) {
            $store = Store::findOrFail($id);
            $store->status = $suspend ? 'Suspended' : 'Active';
            $store->suspension_reason = $suspend
                ? ($reason ?: 'Your store account has been suspended for violating our terms of usage. Please contact administrative support.')
                : null;
            $store->save();

            // Also toggle the owner account
            if ($store->user) {
                $store->user->is_active = ! $suspend;
                $store->user->save();
            }

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => $suspend ? 'ACCOUNT_SUSPENSION' : 'ACCOUNT_UNSUSPENSION',
                'description' => $suspend
                    ? "Suspended store account: {$store->name} ({$store->id}). Reason: ".($reason ?: 'N/A')
                    : "Unsuspended store account: {$store->name} ({$store->id})",
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function suspendStore($id, $reason = null)
    {
        return $this->toggleStoreSuspension($id, true, $reason);
    }

    public function unsuspendStore($id)
    {
        return $this->toggleStoreSuspension($id, false);
    }

    /**
     * Shared by markStoreDemo/unmarkStoreDemo.
     */
    private function toggleStoreDemo(string $id, bool $isDemo): bool
    {
        return DB::transaction(function () use ($id, $isDemo) {
            $store = Store::findOrFail($id);
            $store->is_demo = $isDemo;
            $store->save();

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => $isDemo ? 'STORE_MARKED_DEMO' : 'STORE_UNMARKED_DEMO',
                'description' => ($isDemo ? 'Marked' : 'Unmarked')." store account as demo: {$store->name} ({$store->id})",
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function markStoreDemo($id)
    {
        return $this->toggleStoreDemo($id, true);
    }

    public function unmarkStoreDemo($id)
    {
        return $this->toggleStoreDemo($id, false);
    }

    public function grantTrial($storeId, $plan, $durationString = null, $endDate = null)
    {
        return DB::transaction(function () use ($storeId, $plan, $durationString, $endDate) {
            $store = Store::findOrFail($storeId);
            $user = $store->user;

            if (! $user) {
                throw new \Exception('Store has no owner.');
            }

            $resolvedEndDate = $this->resolveTrialEndDate($durationString, $endDate);

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

            // Update store plan in UI cache / trigger sync
            $store->last_sync_at = now();
            $store->save();

            // Log activity
            $durationLabel = $endDate ? "until {$resolvedEndDate->toDateString()}" : $durationString;
            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'GRANT_FREE_TRIAL',
                'description' => "Granted {$durationLabel} {$plan} Free Trial to {$store->name} ({$store->id})",
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function impersonateStore($id)
    {
        $store = Store::findOrFail($id);
        $user = $store->user;

        if (! $user) {
            throw new \Exception('Store owner not found.');
        }

        // Generate impersonation token
        $token = $user->createToken('Impersonation Token')->plainTextToken;

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'ADMIN_IMPERSONATION',
            'description' => "Admin impersonating store owner: {$user->email} ({$store->name})",
            'status' => 'success',
        ]);

        return [
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->first_name.' '.$user->last_name,
                'email' => $user->email,
                'role' => $user->role,
                'store' => $store->name,
            ],
        ];
    }
}

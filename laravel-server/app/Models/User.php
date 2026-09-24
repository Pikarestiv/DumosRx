<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Support\Str;
use Exception;

/**
 * @mixin IdeHelperUser
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasUuids, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'password',
        'store_id',
        'username',
        'pin',
        'role',
        'is_active',
        'last_login_at',
        'referred_by_id',
        'referral_code',
        'referral_credits',
        'platform_referral_code',
        'registered_by_id',
        'account_manager_id',
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var array
     */
    protected $appends = ['name', 'require_email_verification'];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        // The POS unlock PIN (bcrypt-hashed since
        // 2026_09_24_000000_widen_users_pin_column). Hidden so no endpoint
        // that returns a User model (GET /user, GET /staff, ...) serializes
        // it - defense in depth on top of the hashing itself.
        //
        // The ONE consumer that legitimately needs it is the sync pull,
        // which ships the hash down to each device so local (fully offline)
        // PIN login can verify against it; SyncController::mapPullRowForClient
        // re-exposes it for the 'users' table only.
        'pin',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'last_login_at' => 'datetime',
        'is_active' => 'boolean',
        'password' => 'hashed',
    ];

    /**
     * Hashes a POS unlock PIN for storage in `users.pin`.
     *
     * PINs used to be stored in plaintext and were serialized straight out
     * to every client; they're bcrypt-hashed now, by the same mechanism as
     * `password`. Verification happens CLIENT-side (POS login is fully
     * offline and never reaches the server), so the hash is what syncs down
     * to devices.
     *
     * Idempotent: a value that is already a bcrypt hash is returned
     * untouched, so a re-save of an existing user, or a hashed PIN arriving
     * from a client, never gets double-hashed. Null/empty passes through so
     * "no PIN set" stays distinguishable from "PIN set to empty string".
     */
    public static function hashPin(?string $pin): ?string
    {
        if ($pin === null || $pin === '') {
            return $pin;
        }

        // Hash::isHashed() (== password_get_info()) only recognizes PHP's
        // own $2y$/$2a$ prefixes - it returns FALSE for a $2b$ hash, which
        // is exactly what the client's bcryptjs produces. A client-hashed
        // PIN reaching this method would therefore fail the idempotency
        // check and get hashed a second time (hash-of-a-hash), silently
        // breaking that PIN forever. Not reachable today (the sync push
        // path writes `pin` without calling this, and every controller that
        // does call it validates `pin` as size:4, which a 60-char hash
        // fails) - but one relaxed validation rule away from a real lockout,
        // so detect all three real bcrypt prefixes directly instead of
        // trusting PHP's narrower notion of "hashed".
        if (preg_match('/^\$2[aby]\$\d{2}\$/', $pin) === 1) {
            return $pin;
        }

        return \Illuminate\Support\Facades\Hash::make($pin);
    }

    public function userRole()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function getNameAttribute()
    {
        return "{$this->first_name} {$this->last_name}";
    }

    public function getRequireEmailVerificationAttribute()
    {
        return \App\Models\SystemConfig::getVal('require_email_verification', false) === true || \App\Models\SystemConfig::getVal('require_email_verification', false) === 'true';
    }

    public function store()
    {
        return $this->hasOne(Store::class);
    }

    public function stores()
    {
        return $this->hasMany(Store::class, 'user_id');
    }

    /**
     * The store this user works AT as staff (users.store_id), as opposed
     * to store()/stores() above which resolve the store(s) this user
     * OWNS (stores.user_id pointing back at them). A store owner's own
     * store_id column is never set to their own store (see Store::sales()
     * doc block and StaffController::store), so this relation is null for
     * owners even though store()/stores() cover that case; the two are
     * complementary, not overlapping.
     */
    public function employerStore()
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    /**
     * The store name to display for this user: the store they OWN if
     * they own one, else the store they're STAFF AT if they have one,
     * else 'Platform Admin' for genuine platform-level users with no
     * store affiliation at all. Shared by AdminService::getGlobalUsers()
     * and ::getActivityLogs() so the "staff show as Platform Admin" bug
     * (users.store_id vs. the ownership-only store()/stores() relations)
     * isn't fixed in one place and left broken in the other.
     */
    public function getDisplayStoreAttribute()
    {
        return $this->store ?? $this->employerStore;
    }

    public function subscriptions()
    {
        return $this->hasMany(Subscription::class);
    }
    public function permissions()
    {
        return $this->belongsToMany(Permission::class);
    }

    public function hasRole($role)
    {
        if (is_string($role)) {
            $actualRole = $this->role === 'store_owner' ? 'admin' : $this->role;
            return ($this->userRole !== null && ($this->userRole->slug === $role || ($this->userRole->slug === 'store_owner' && $role === 'admin')))
                || $this->role === $role 
                || $actualRole === $role;
        }

        if (is_array($role)) {
            $hasRoleMatch = false;
            foreach ($role as $r) {
                if ($this->hasRole($r)) {
                    $hasRoleMatch = true;
                    break;
                }
            }
            return $hasRoleMatch;
        }

        return false;
    }

    public function hasPermission($permissionSlug)
    {
        // Check direct permission first
        if ($this->permissions()->where('slug', $permissionSlug)->exists()) {
            return true;
        }

        // Check through role relation
        if ($this->userRole) {
            if ($this->userRole->permissions()->where('slug', $permissionSlug)->exists()) {
                return true;
            }
            if ($this->userRole->slug === 'store_owner') {
                $adminRole = Role::where('slug', 'admin')->first();
                if ($adminRole && $adminRole->permissions()->where('slug', $permissionSlug)->exists()) {
                    return true;
                }
            }
        }

        // Fallback to role string column
        if ($this->role) {
            $roleSlug = $this->role === 'store_owner' ? 'admin' : $this->role;
            $role = Role::where('slug', $roleSlug)->first();
            if ($role) {
                return $role->permissions()->where('slug', $permissionSlug)->exists();
            }
        }

        return false;
    }

    public function givePermissionTo($permissionSlug)
    {
        $permission = Permission::where('slug', $permissionSlug)->first();
        if ($permission) {
            $this->permissions()->syncWithoutDetaching([$permission->id]);
        }
    }

    public function revokePermissionTo($permissionSlug)
    {
        $permission = Permission::where('slug', $permissionSlug)->first();
        if ($permission) {
            $this->permissions()->detach($permission->id);
        }
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($user) {
            // Generate unique referral code for store owners
            if (in_array($user->role, ['admin', 'store_owner'])) {
                $user->referral_code = self::generateUniqueReferralCode();
            }

            // Platform-level referral code, separate program from the customer
            // one above. Every super_admin/platform_admin/agent gets one so
            // stores they onboard (in person via "Register Store", or self-serve
            // via their link) can be attributed to them.
            if (in_array($user->role, ['super_admin', 'platform_admin', 'agent'])) {
                $user->platform_referral_code = self::generateUniquePlatformReferralCode();
            }
        });

        static::deleting(function ($user) {
            if (! $user->isForceDeleting()) {
                $suffix = '_del_' . time();
                $user->email = $user->email . $suffix;
                if ($user->username) {
                    $user->username = $user->username . $suffix;
                }
                $user->save();
            }
        });
    }

    public static function generateUniqueReferralCode()
    {
        do {
            $code = 'DRX-' . strtoupper(Str::random(6));
        } while (self::where('referral_code', $code)->exists());

        return $code;
    }

    public function referredBy()
    {
        return $this->belongsTo(User::class, 'referred_by_id');
    }

    public function referrals()
    {
        return $this->hasMany(User::class, 'referred_by_id');
    }

    public static function generateUniquePlatformReferralCode()
    {
        do {
            $code = 'AGT-' . strtoupper(Str::random(6));
        } while (self::where('platform_referral_code', $code)->exists());

        return $code;
    }

    /** The platform staff member (super_admin/platform_admin/agent) who
     * registered this account, either directly via the admin "Register
     * Store" tool, or via this user signing up themselves using that
     * platform user's referral link. */
    public function registeredBy()
    {
        return $this->belongsTo(User::class, 'registered_by_id');
    }

    /** Accounts this platform user has registered or been credited for via
     * their referral link. */
    public function registeredAccounts()
    {
        return $this->hasMany(User::class, 'registered_by_id');
    }

    /** The platform staff member shown to this store as its "contact
     * specialist"/account manager. Deliberately separate from
     * registeredBy(): a superadmin reassigning who handles an account must
     * never rewrite registered_by_id, since that also drives referral
     * attribution reporting. Resolution order (see
     * AccountManagerController::resolveFor()) is account_manager_id ->
     * registered_by_id -> the default_account_manager_id system config. */
    public function accountManager()
    {
        return $this->belongsTo(User::class, 'account_manager_id');
    }

    public function creditTransactions()
    {
        return $this->hasMany(ReferralCreditTransaction::class);
    }

    public function addCredits(float $amount, string $description, ?string $referredUserId = null, string $type = 'earned')
    {
        $this->referral_credits += $amount;
        $this->save();

        return $this->creditTransactions()->create([
            'referred_user_id' => $referredUserId,
            'type' => $type,
            'amount' => $amount,
            'description' => $description,
        ]);
    }

    public function deductCredits(float $amount, string $description)
    {
        if ($this->referral_credits < $amount) {
            throw new Exception('Insufficient referral credits.');
        }

        $this->referral_credits -= $amount;
        $this->save();

        return $this->creditTransactions()->create([
            'type' => 'spent',
            'amount' => $amount,
            'description' => $description,
        ]);
    }
}

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

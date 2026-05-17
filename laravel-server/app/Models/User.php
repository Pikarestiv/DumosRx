<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasUuids;

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
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var array
     */
    protected $appends = ['name'];

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

    public function store()
    {
        return $this->hasOne(Store::class);
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
            return ($this->userRole !== null && $this->userRole->slug === $role) || $this->role === $role;
        }

        if (is_array($role)) {
            return ($this->userRole !== null && in_array($this->userRole->slug, $role)) || in_array($this->role, $role);
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
            return $this->userRole->permissions()->where('slug', $permissionSlug)->exists();
        }

        // Fallback to role string column
        if ($this->role) {
            $role = Role::where('slug', $this->role)->first();
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
}

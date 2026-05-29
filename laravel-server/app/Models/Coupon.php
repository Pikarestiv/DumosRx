<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Coupon extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'code',
        'type', // 'discount_percent', 'trial_extension'
        'value',
        'max_uses',
        'max_uses_per_user',
        'assigned_to_user_id',
        'target_plan',
        'target_interval',
        'expires_at',
        'is_active',
        'created_by',
        '_synced_at',
    ];

    protected $casts = [
        'value' => 'integer',
        'max_uses' => 'integer',
        'max_uses_per_user' => 'integer',
        'expires_at' => 'datetime',
        'is_active' => 'boolean',
        '_synced_at' => 'datetime',
    ];

    /**
     * Get the user this coupon is specifically assigned to (if any).
     */
    public function assignedUser()
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    /**
     * Get the usages of this coupon.
     */
    public function usages()
    {
        return $this->hasMany(CouponUsage::class);
    }

    /**
     * Check if the coupon is generally valid.
     */
    public function isGloballyValid(): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->expires_at && $this->expires_at->isPast()) {
            return false;
        }

        if ($this->max_uses !== null && $this->usages()->count() >= $this->max_uses) {
            return false;
        }

        return true;
    }

    /**
     * Check if the coupon is valid for a specific user.
     */
    public function isValidForUser(User $user): bool
    {
        // Must be globally valid first
        if (!$this->isGloballyValid()) {
            return false;
        }

        // Check explicit assignment
        if ($this->assigned_to_user_id && $this->assigned_to_user_id !== $user->id) {
            return false;
        }

        // Check per-user usage limits
        $userUsages = $this->usages()->where('user_id', $user->id)->count();
        if ($userUsages >= $this->max_uses_per_user) {
            return false;
        }

        return true;
    }

    /**
     * Check if the coupon is valid for the specified plan and interval.
     */
    public function isValidForPlan(string $planName, string $interval): bool
    {
        if ($this->target_plan && strtolower($this->target_plan) !== strtolower($planName)) {
            return false;
        }

        if ($this->target_interval && strtolower($this->target_interval) !== strtolower($interval)) {
            return false;
        }

        return true;
    }
}

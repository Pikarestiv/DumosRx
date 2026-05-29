<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CouponUsage extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'coupon_id',
        'user_id',
        'subscription_id',
        'used_at',
        '_synced_at',
    ];

    protected $casts = [
        'used_at' => 'datetime',
        '_synced_at' => 'datetime',
    ];

    /**
     * Get the coupon associated with this usage.
     */
    public function coupon()
    {
        return $this->belongsTo(Coupon::class);
    }

    /**
     * Get the user who used the coupon.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the subscription created/modified by this usage.
     */
    public function subscription()
    {
        return $this->belongsTo(Subscription::class);
    }
}

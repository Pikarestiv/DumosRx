<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
     *
     * @return BelongsTo<Coupon, $this>
     */
    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    /**
     * Get the user who used the coupon.
     *
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the subscription created/modified by this usage.
     *
     * @return BelongsTo<Subscription, $this>
     */
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}

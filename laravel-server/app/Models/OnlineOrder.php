<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperOnlineOrder
 */
class OnlineOrder extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'store_id', 'customer_name', 'customer_phone', 'customer_address',
        'total_amount', 'payment_method', 'payment_status', 'order_status',
        'paystack_reference', 'synced_at'
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'synced_at' => 'datetime',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function items()
    {
        return $this->hasMany(OnlineOrderItem::class);
    }
}

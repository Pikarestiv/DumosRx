<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperLoyaltyTransaction
 */
class LoyaltyTransaction extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'id',
        'store_id',
        'customer_id',
        'points',
        'type',
        'transaction_id',
        '_version',
        '_synced',
        '_synced_at',
        '_deleted',
    ];

    protected $casts = [
        'points' => 'decimal:2',
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}

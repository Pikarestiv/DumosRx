<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperCustomerPayment
 */
class CustomerPayment extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'id',
        'customer_id',
        'store_id',
        'amount',
        'payment_method',
        'notes',
        'payment_date',
        '_version',
        '_synced',
        '_synced_at',
        '_deleted',
    ];

    protected $casts = [
        '_synced' => 'boolean',
        '_deleted' => 'boolean',
        '_synced_at' => 'datetime',
        'payment_date' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}

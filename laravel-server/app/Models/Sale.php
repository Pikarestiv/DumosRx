<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @mixin IdeHelperSale
 */
class Sale extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'transaction_number', 'customer_id', 'cashier_id', 'store_id', 'prescription_id',
        'subtotal', 'discount_total', 'discount_amount', 'discount_percentage', 'discount_type', 'tax_amount',
        'tax_percentage', 'total_amount', 'payment_method', 'payment_status',
        'amount_paid', 'change_given', 'points_earned', 'points_redeemed',
        'transaction_date', 'notes', 'receipt_printed', 'payment_details',
        'is_reseller_sale', 'markup_type', 'reseller_commission_percentage', 'reseller_commission_amount',
        'reseller_markup_amount', 'reseller_commission_redeemed', 'reseller_commission_redeemed_amount',
        'reseller_commission_claim_type', 'reseller_commission_redeemed_at', 'reseller_commission_redeemed_by',
    ];

    protected $casts = [
        'transaction_date' => 'datetime',
        'receipt_printed' => 'boolean',
        'total_amount' => 'decimal:2',
        'payment_details' => 'array',
        'is_reseller_sale' => 'boolean',
        'reseller_commission_redeemed' => 'boolean',
    ];

     protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (!$model->transaction_number) {
                // 'TXN' . date('YmdHis') . rand(100, 999) collided whenever two
                // sales landed in the same second (~1-in-900 odds), failing the
                // whole insert against the UNIQUE constraint. Mirrors the
                // client's own fix for the identical class of bug
                // (generateShortId() in client/lib/db/core.ts): the first two
                // dash-segments of a UUID (~48 bits of randomness) instead of a
                // timestamp + tiny random suffix, kept short enough to still
                // read well on a receipt. The uniqueness re-check is
                // belt-and-braces on top of that already-low collision odds.
                do {
                    $uuid = str_replace('-', '', (string) Str::uuid());
                    $candidate = 'TXN-' . strtoupper(substr($uuid, 0, 12));
                } while (static::withTrashed()->where('transaction_number', $candidate)->exists());

                $model->transaction_number = $candidate;
            }
        });
    }

    public function items()
    {
        return $this->hasMany(SaleItem::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function cashier()
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }
}

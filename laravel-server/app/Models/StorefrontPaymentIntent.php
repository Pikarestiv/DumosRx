<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * "Payment reference R is reserved for cart C on store S."
 *
 * Created by StorefrontController::initializeCheckout() BEFORE the customer
 * is redirected to the provider, and consumed (exactly once) by
 * StorefrontController::checkout(). See the table's migration for why this
 * isn't a `payment_transactions` row.
 *
 * @mixin IdeHelperStorefrontPaymentIntent
 */
class StorefrontPaymentIntent extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'store_id', 'reference', 'provider', 'amount', 'currency',
        'status', 'items', 'customer_email', 'online_order_id', 'consumed_at',
    ];

    protected $casts = [
        'items' => 'array',
        'amount' => 'decimal:2',
        'consumed_at' => 'datetime',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    /**
     * The cart identity this reference was minted for: product_id => quantity,
     * key-sorted so two orderings of the same cart compare equal. Used by
     * checkout() to assert the confirmed order is the one that was paid for.
     */
    public static function cartFingerprint(array $items): array
    {
        $map = [];
        foreach ($items as $item) {
            $productId = (string) ($item['product_id'] ?? '');
            $map[$productId] = ($map[$productId] ?? 0) + (int) ($item['quantity'] ?? 0);
        }
        ksort($map);

        return $map;
    }
}

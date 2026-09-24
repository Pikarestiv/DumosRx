<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A durable, server-side record of "payment reference R was minted by
     * THIS app for cart C on store S", written before the customer is ever
     * handed a checkout URL. StorefrontController::checkout() will only
     * accept a paystack_reference that matches one of these rows, which is
     * what closes the "a reference this app never issued (a dashboard
     * charge, a payment link, another product on the same Paystack account)
     * can be replayed once into a storefront order" gap.
     *
     * Deliberately NOT `payment_transactions`: PaymentController::
     * processSuccessfulPayment() looks a row up in that table by reference
     * on every signed Paystack webhook and hands it straight to
     * SubscriptionController::activateSubscriptionFromTransaction(), which
     * reads `metadata.plan_name`/`metadata.user_id` and mints a Subscription.
     * A storefront charge landing in that table would therefore have its
     * webhook try to activate a subscription from a row that describes a
     * grocery basket. Keeping storefront intents in their own table means
     * that path simply never sees them.
     */
    public function up(): void
    {
        Schema::create('storefront_payment_intents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            // The provider's reference, generated server-side at initialize
            // time. Unique: a reference may back exactly one intent, and the
            // index is the race-proof backstop for the "already consumed"
            // check in checkout().
            $table->string('reference')->unique();
            $table->string('provider'); // paystack | flutterwave
            $table->decimal('amount', 12, 2);
            $table->string('currency')->default('NGN');
            $table->string('status')->default('pending'); // pending | consumed
            // Snapshot of the cart this reference was minted for, as
            // [{product_id, quantity, unit_price, subtotal}, ...]. checkout()
            // requires the confirmed order's product_id/quantity set to match
            // this exactly, so a reference minted for a ₦200 cart can't be
            // redirected onto a different one.
            $table->json('items');
            $table->string('customer_email')->nullable();
            $table->uuid('online_order_id')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('storefront_payment_intents');
    }
};

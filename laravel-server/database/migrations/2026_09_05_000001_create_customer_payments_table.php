<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * customer_payments has existed client-side (client/lib/db/schema.ts) since
 * before this app's smoke-test docs described it as a shipped feature
 * ("Customer payments (`customer_payments` table)") — the server-side table
 * was simply never created. Every push for this table was silently dropped
 * by SyncController::push()'s getModelForTable() returning null (a `continue`
 * with only a server-side log warning, not added to `response.failed`), so
 * the client marked every one of these records as successfully synced and
 * deleted them from its local queue — real store-credit payment records
 * lost with no error, retry, or user-visible signal anywhere. See the
 * accompanying migration and SyncController changes fixing the same root
 * cause for stock_audits/held_transactions/loyalty_transactions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('customer_id');
            $table->uuid('store_id')->nullable()->index();
            $table->decimal('amount', 12, 2);
            $table->string('payment_method')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('payment_date')->nullable();
            $table->integer('_version')->default(1);
            $table->boolean('_synced')->default(false);
            $table->boolean('_deleted')->default(false);
            $table->timestamp('_synced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_payments');
    }
};

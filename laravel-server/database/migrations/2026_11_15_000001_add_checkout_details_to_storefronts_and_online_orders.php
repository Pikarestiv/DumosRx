<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('storefronts', function (Blueprint $table) {
            $table->text('payment_instructions')->nullable()->after('pickup_minutes');
            $table->boolean('delivery_available')->default(false)->after('payment_instructions');
            $table->string('delivery_note')->nullable()->after('delivery_available');
            $table->boolean('pay_on_delivery')->default(false)->after('delivery_note');
        });

        Schema::table('online_orders', function (Blueprint $table) {
            $table->string('customer_email')->nullable()->after('customer_phone');
            $table->string('fulfilment_method', 16)->default('pickup')->after('customer_address');
        });
    }

    public function down(): void
    {
        Schema::table('storefronts', function (Blueprint $table) {
            $table->dropColumn(['payment_instructions', 'delivery_available', 'delivery_note', 'pay_on_delivery']);
        });

        Schema::table('online_orders', function (Blueprint $table) {
            $table->dropColumn(['customer_email', 'fulfilment_method']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('store_type')->default('pharmacy')->after('name');
            $table->string('address')->nullable()->after('store_type');
            $table->string('phone')->nullable()->after('address');
            $table->string('email')->nullable()->after('phone');
            $table->string('currency')->default('NGN')->after('email');
            $table->decimal('vat_percentage', 5, 2)->default(7.5)->after('currency');
            $table->string('pcn_license')->nullable()->after('vat_percentage');
            $table->text('receipt_header')->nullable()->after('pcn_license');
            $table->text('receipt_footer')->nullable()->after('receipt_header');
            $table->boolean('show_logo_on_receipt')->default(true)->after('receipt_footer');
            $table->boolean('show_contact_on_receipt')->default(true)->after('show_logo_on_receipt');
            $table->boolean('low_stock_warning')->default(true)->after('show_contact_on_receipt');
            $table->boolean('expiry_warning')->default(true)->after('low_stock_warning');
            $table->integer('expiry_warning_days')->default(90)->after('expiry_warning');
            $table->integer('_version')->default(1)->after('expiry_warning_days');
            $table->timestamp('_synced_at')->nullable()->after('_version');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn([
                'store_type', 'address', 'phone', 'email', 'currency', 
                'vat_percentage', 'pcn_license', 'receipt_header', 
                'receipt_footer', 'show_logo_on_receipt', 
                'show_contact_on_receipt', 'low_stock_warning', 
                'expiry_warning', 'expiry_warning_days', 
                '_version', '_synced_at'
            ]);
        });
    }
};

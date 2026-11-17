<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('online_order_items', function (Blueprint $table) {
            $table->uuid('product_id')->nullable()->change();
            $table->uuid('service_id')->nullable()->after('product_id')->index();
        });
    }

    public function down(): void
    {
        DB::table('online_order_items')->whereNull('product_id')->delete();

        Schema::table('online_order_items', function (Blueprint $table) {
            $table->dropIndex(['service_id']);
            $table->dropColumn('service_id');
        });

        Schema::table('online_order_items', function (Blueprint $table) {
            $table->uuid('product_id')->nullable(false)->change();
        });
    }
};

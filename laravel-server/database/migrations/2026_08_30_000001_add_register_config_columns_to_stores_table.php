<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->boolean('require_sale_notes')->default(false)->after('custom_units');
            $table->boolean('display_stock_levels')->default(true)->after('require_sale_notes');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['require_sale_notes', 'display_stock_levels']);
        });
    }
};

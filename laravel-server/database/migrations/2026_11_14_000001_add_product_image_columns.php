<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('image_key', 255)->nullable();
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->boolean('pos_show_product_images')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('image_key');
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('pos_show_product_images');
        });
    }
};

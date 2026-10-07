<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A-151, the same class as the fixed A-149: `AppServiceProvider::boot()` sets
 * `Schema::defaultStringLength(191)`, so an unspecified-length `string()`
 * column is VARCHAR(191), not Laravel's native 255. Both of these are indexed
 * and neither has a client-side cap, so a value between 192 and 255
 * characters fails a sync push with "Data too long for column" and the row is
 * stuck forever. Lengths are explicit here so the global default cannot
 * silently move them again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('barcode', 255)->nullable()->change();
        });

        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('correlation_id', 255)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('barcode', 191)->nullable()->change();
        });

        Schema::table('activity_logs', function (Blueprint $table) {
            $table->string('correlation_id', 191)->nullable()->change();
        });
    }
};

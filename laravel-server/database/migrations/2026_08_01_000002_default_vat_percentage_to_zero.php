<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * New stores were silently getting a 7.5% VAT applied to every sale from
 * day one, with no onboarding step or prominent warning explaining it —
 * owners who didn't know to visit Settings > Regional and set it to 0
 * were unknowingly overcharging (or under-reporting, if their prices were
 * meant to be tax-inclusive) customers. Defaulting to 0 means no tax is
 * added until an owner deliberately opts in. Existing stores that never
 * touched this setting keep whatever value they already have — this only
 * changes the default applied to newly created stores.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->decimal('vat_percentage', 5, 2)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->decimal('vat_percentage', 5, 2)->default(7.5)->change();
        });
    }
};

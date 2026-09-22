<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to client/lib/db/queries/loyalty.ts's
 * ensureLoyaltyDefaultsSeeded() one-time-seed gate. Without this column
 * existing server-side, a client's settings push that includes it fails
 * with "Unknown column" the same way loyalty_points_per_currency's own
 * migration comment describes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'loyalty_defaults_seeded_at')) {
                $table->timestamp('loyalty_defaults_seeded_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('loyalty_defaults_seeded_at');
        });
    }
};

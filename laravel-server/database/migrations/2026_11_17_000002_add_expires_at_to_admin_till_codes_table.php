<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add lifetime expiry to admin till access codes (A-208).
 * Existing codes with null expires_at remain active (backward compatibility per §11).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_till_codes', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable()->after('last_used_at');
        });
    }

    public function down(): void
    {
        Schema::table('admin_till_codes', function (Blueprint $table) {
            $table->dropColumn('expires_at');
        });
    }
};

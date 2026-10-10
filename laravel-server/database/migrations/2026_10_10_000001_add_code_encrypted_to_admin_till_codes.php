<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recoverable copy of a till access code, for the super_admin-only reveal.
 * See docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md
 * ("Super-admin visibility") for the trade-off this deliberately makes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_till_codes', function (Blueprint $table) {
            $table->text('code_encrypted')->nullable()->after('code_hash');
        });
    }

    public function down(): void
    {
        Schema::table('admin_till_codes', function (Blueprint $table) {
            $table->dropColumn('code_encrypted');
        });
    }
};

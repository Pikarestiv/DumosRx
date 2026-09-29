<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** PIN-only staff accounts hold no web password at all.
 * Rationale: "Staff credentials" in AGENTS.md; A-11 in docs/FIXED_BUGS.md. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Rows with a null password would block the NOT NULL change; give
        // them an unguessable hash, never a PIN-derived one.
        \Illuminate\Support\Facades\DB::table('users')
            ->whereNull('password')
            ->update(['password' => bcrypt(\Illuminate\Support\Str::random(64))]);

        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable(false)->change();
        });
    }
};

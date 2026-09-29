<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Server-side counterpart to client stores.permission_groups_seeded_at -
// mirrors the existing loyalty_defaults_seeded_at lazy-seed marker pattern.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->timestamp('permission_groups_seeded_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('permission_groups_seeded_at');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Makes the POS/dashboard auto-lock timeout a per-account preference
// (see client's use-auto-lock.ts) instead of only a per-browser
// localStorage value, so it follows a staff member across devices.
// 0 = off, matching the client's AUTO_LOCK_OPTIONS encoding; default 5
// matches the zustand store's own default.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('auto_lock_duration')->default(5)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('auto_lock_duration');
        });
    }
};

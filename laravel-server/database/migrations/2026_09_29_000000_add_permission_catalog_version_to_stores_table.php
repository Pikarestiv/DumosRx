<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-side counterpart to client stores.permission_catalog_version (see
 * client/lib/db/schema.ts). Which revision of DEFAULT_GROUP_PERMISSIONS this
 * store's default groups have been brought up to; NULL on every store that
 * predates the column, which PermissionGroupSeeder reads as catalog
 * version 1 (the 2026-09-27 launch lists).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->unsignedInteger('permission_catalog_version')->nullable()->after('permission_groups_seeded_at');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('permission_catalog_version');
        });
    }
};

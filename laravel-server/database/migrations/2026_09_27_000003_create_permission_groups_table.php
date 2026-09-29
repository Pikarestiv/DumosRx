<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Store-scoped counterpart to the client's `permission_groups` table (see
 * client/lib/db/schema.ts). Deliberately separate from the existing
 * platform-scoped `roles`/`permissions` tables (RolesAndPermissionsSeeder)
 * - those mean the same thing for every store and already carry specific
 * meaning for super_admin/platform_admin/agent. A store-level, owner-
 * editable group is a different concept and must never risk being confused
 * with (or accidentally shared across) the platform-level Role model.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permission_groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id');
            $table->string('name');
            $table->string('based_on_role');
            $table->boolean('is_default')->default(false);
            $table->json('permissions')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->unsignedInteger('_version')->default(1);
            $table->timestamps();

            $table->foreign('store_id')->references('id')->on('stores')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_groups');
    }
};

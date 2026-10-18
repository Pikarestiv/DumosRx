<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A-281. `permission_groups` is the one table in the nine that never got a
 * `deleted_at` column, and the client deletes permission groups for real
 * (`client/lib/hooks/use-permission-groups.ts`), so its DELETE pushes were
 * hard deletes. See laravel-server/AGENTS.md, "Every pulled table
 * soft-deletes".
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('permission_groups', 'deleted_at')) {
            Schema::table('permission_groups', function (Blueprint $table) {
                $table->softDeletes();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('permission_groups', 'deleted_at')) {
            Schema::table('permission_groups', function (Blueprint $table) {
                $table->dropSoftDeletes();
            });
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-only bookkeeping for the storefront static-export rebuild
 * pipeline (see App\Console\Commands\RebuildStorefrontIfDirty and
 * Store::boot()'s saving/saved hooks):
 *
 * - `storefront_dirty_at`: stamped whenever online_store_enabled or
 *   store_slug changes. The scheduled command checks this every 15
 *   minutes, fires one repository_dispatch covering every dirty store
 *   since the last run, then clears the flags - so three toggles in two
 *   minutes trigger one rebuild, not three.
 * - `store_slug_changed_at`: when the slug was last actually changed
 *   (not stamped on the first-ever slug set). Enforces the "once every 6
 *   months, otherwise contact support" cooldown.
 *
 * Neither column is client-fillable/synced - these are pure server
 * bookkeeping, not part of the client's own `stores` schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'storefront_dirty_at')) {
                $table->timestamp('storefront_dirty_at')->nullable();
            }
            if (!Schema::hasColumn('stores', 'store_slug_changed_at')) {
                $table->timestamp('store_slug_changed_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['storefront_dirty_at', 'store_slug_changed_at']);
        });
    }
};

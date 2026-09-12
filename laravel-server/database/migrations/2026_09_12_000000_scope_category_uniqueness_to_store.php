<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * categories.name has been globally UNIQUE since the very first migration
 * (2024_01_20_000004), predating multi-tenancy. SyncController's push
 * handler works around the resulting collisions by treating any push whose
 * name matches an existing row as "already exists" and remapping the
 * client's local id onto that row (see the categories/suppliers blocks
 * around line 400) — but that lookup was never scoped to store_id, so a
 * generic category name (Cosmetics, Drugs, Antibiotics — exactly what the
 * default-categories seed list uses) created independently by two different
 * stores gets silently merged into one shared row. Each store's products
 * then reference a category that only "belongs" to whichever store created
 * it first; if that owning store later renames or deletes it, every other
 * store silently sharing the row gets orphaned products with no action of
 * their own — the exact "categories keep clearing themselves" symptom this
 * migration exists to stop.
 *
 * Moves uniqueness to (store_id, name) so two stores can each have their
 * own "Cosmetics" without colliding. NULL store_id (pre-multi-tenancy rows)
 * is left alone — MySQL treats each NULL in a unique index as distinct, so
 * existing legacy rows are unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Existing cross-store merges may have left MULTIPLE stores sharing
        // one row (fine — one row, no duplicate), but if two rows somehow
        // already carry the same (store_id, name) pair, adding the unique
        // index would fail the deploy outright. Guard instead of crashing:
        // log it for manual cleanup and skip adding the constraint until
        // that's resolved, rather than taking the migration down with it.
        $duplicates = DB::table('categories')
            ->select('store_id', DB::raw('LOWER(name) as lname'), DB::raw('COUNT(*) as c'))
            ->whereNotNull('store_id')
            ->groupBy('store_id', DB::raw('LOWER(name)'))
            ->having('c', '>', 1)
            ->get();

        if ($duplicates->isNotEmpty()) {
            \Log::warning('Skipping (store_id, name) unique constraint on categories: existing duplicates found', [
                'count' => $duplicates->count(),
            ]);
            return;
        }

        Schema::table('categories', function (Blueprint $table) {
            $table->dropUnique('categories_name_unique');
            $table->unique(['store_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropUnique(['store_id', 'name']);
            $table->unique('name');
        });
    }
};

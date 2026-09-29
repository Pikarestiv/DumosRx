<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * update_coupon_type_enum rebuilt the `coupons` table on SQLite by renaming
 * it aside and recreating it. Modern SQLite rewrites references in other
 * tables on a RENAME, so coupon_usages came out of that migration with a
 * foreign key pointing at `coupons_old_enum_migration`, a table that was
 * dropped moments later. Any statement SQLite has to resolve that key for
 * (including an unrelated DELETE on `users`, which coupon_usages also
 * references) then fails with "no such table". MySQL is unaffected, so this
 * only ever bit local/dev/test SQLite databases.
 */
return new class extends Migration
{
    private const STALE = 'coupons_old_enum_migration';

    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite' || !Schema::hasTable('coupon_usages')) {
            return;
        }

        $row = DB::selectOne("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'coupon_usages'");

        if (!$row || !str_contains($row->sql, self::STALE)) {
            return;
        }

        $fixedSql = str_replace(self::STALE, 'coupons', $row->sql);

        DB::statement('PRAGMA legacy_alter_table = ON');
        DB::statement('ALTER TABLE coupon_usages RENAME TO coupon_usages_fk_repair');
        DB::statement($fixedSql);
        DB::statement('INSERT INTO coupon_usages SELECT * FROM coupon_usages_fk_repair');
        DB::statement('DROP TABLE coupon_usages_fk_repair');
        DB::statement('PRAGMA legacy_alter_table = OFF');
    }

    public function down(): void
    {
    }
};

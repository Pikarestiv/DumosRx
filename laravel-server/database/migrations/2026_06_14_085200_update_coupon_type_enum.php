<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const OLD_VALUES = "'discount_percent', 'trial_extension'";

    private const NEW_VALUES = "'discount_percent', 'discount_amount', 'trial_extension'";

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE coupons MODIFY COLUMN type ENUM('discount_percent', 'discount_amount', 'trial_extension') NOT NULL");

            return;
        }

        if (DB::connection()->getDriverName() === 'sqlite') {
            $this->rebuildSqliteCheckConstraint(self::OLD_VALUES, self::NEW_VALUES);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE coupons MODIFY COLUMN type ENUM('discount_percent', 'trial_extension') NOT NULL");

            return;
        }

        if (DB::connection()->getDriverName() === 'sqlite') {
            $this->rebuildSqliteCheckConstraint(self::NEW_VALUES, self::OLD_VALUES);
        }
    }

    /**
     * SQLite has no ALTER TABLE for CHECK constraints (the `enum()` column
     * type is emulated as `varchar check ("type" in (...))`), and this
     * project doesn't install doctrine/dbal, which is what Laravel's
     * Schema::table()->change() would otherwise need on SQLite. So the
     * table is rebuilt from its own captured DDL with only the constraint's
     * value list swapped, rather than via MODIFY COLUMN (mysql-only) or a
     * hand-typed CREATE TABLE that could drift from the real schema.
     */
    private function rebuildSqliteCheckConstraint(string $from, string $to): void
    {
        $row = DB::selectOne(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'coupons'"
        );

        if (! $row || ! str_contains($row->sql, $from)) {
            throw new \RuntimeException(
                "coupons table CHECK constraint did not match the expected value list ({$from}); refusing to rebuild blindly."
            );
        }

        $createSql = str_replace($from, $to, $row->sql);

        DB::statement('ALTER TABLE coupons RENAME TO coupons_old_enum_migration');
        DB::statement($createSql);
        DB::statement('INSERT INTO coupons SELECT * FROM coupons_old_enum_migration');
        DB::statement('DROP TABLE coupons_old_enum_migration');
    }
};

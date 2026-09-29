<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The repair migration rebuilds coupon_usages from its sqlite_master SQL,
 * which does not carry standalone CREATE INDEX statements. Without an
 * explicit replay, the rebuild silently drops the per-user lookup index.
 */
class CouponUsagesForeignKeyRepairTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function the_rebuild_keeps_the_per_user_lookup_index()
    {
        if (DB::getDriverName() !== 'sqlite') {
            $this->markTestSkipped('The repair migration only runs on SQLite.');
        }

        $this->breakTheForeignKey();

        $this->assertTrue($this->hasStaleForeignKey());

        $this->runRepairMigration();

        $this->assertFalse($this->hasStaleForeignKey());
        $this->assertNotNull(
            DB::selectOne("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'coupon_usages_coupon_id_user_id_index'")
        );
    }

    private function breakTheForeignKey(): void
    {
        $sql = DB::selectOne("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'coupon_usages'")->sql;
        $broken = str_replace('"coupons"', '"coupons_old_enum_migration"', $sql);

        DB::statement('PRAGMA legacy_alter_table = ON');
        DB::statement('ALTER TABLE coupon_usages RENAME TO coupon_usages_break');
        DB::statement($broken);
        DB::statement('DROP TABLE coupon_usages_break');
        DB::statement('PRAGMA legacy_alter_table = OFF');
        DB::statement('CREATE INDEX coupon_usages_coupon_id_user_id_index ON coupon_usages ("coupon_id", "user_id")');
    }

    private function hasStaleForeignKey(): bool
    {
        $sql = DB::selectOne("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'coupon_usages'")->sql;

        return str_contains($sql, 'coupons_old_enum_migration');
    }

    private function runRepairMigration(): void
    {
        $migration = require database_path(
            'migrations/2026_09_29_000002_repair_coupon_usages_dangling_foreign_key.php'
        );

        $migration->up();
    }
}

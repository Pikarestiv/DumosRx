<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\ConnectsToRealMysql;
use Tests\TestCase;

/**
 * Regression coverage for A-149: `AppServiceProvider::boot()` sets
 * `Schema::defaultStringLength(191)` globally, so the unspecified-length
 * `$table->string('fingerprint')->index()` in
 * 2026_09_27_000002_add_dedup_columns_to_feedback_table.php silently became
 * VARCHAR(191) instead of Laravel's native 255 - the length the client's
 * `MAX_FINGERPRINT_LENGTH` (client/lib/utils/error-truncation.ts) has
 * always assumed, so any fingerprint between 192 and 255 characters failed
 * a real sync push with "Data too long for column 'fingerprint'".
 *
 * This can't be caught through the normal test suite: phpunit.xml runs
 * everything against SQLite in-memory, and SQLite has no real VARCHAR
 * length enforcement regardless of the declared length (confirmed:
 * `Schema::getColumns()` reports a bare "varchar" there, never "varchar(N)").
 * Only a real MySQL connection actually enforces (and reports) the column
 * width, so this test talks to it directly and skips itself if that
 * connection isn't reachable (e.g. in a CI environment without a MySQL
 * service) - same pattern as SyncPushRowLockTest.
 */
class FeedbackFingerprintColumnWidthTest extends TestCase
{
    use ConnectsToRealMysql;

    protected function setUp(): void
    {
        parent::setUp();

        config(['database.connections.mysql_fingerprint_check' => $this->readRealMysqlCredentialsFromDotEnv()]);

        try {
            DB::connection('mysql_fingerprint_check')->getPdo();
        } catch (\Throwable $e) {
            $this->markTestSkipped('Real MySQL connection not reachable, skipping fingerprint column width test: ' . $e->getMessage());
        }
    }

    public function test_feedback_fingerprint_column_is_at_least_255_characters_wide(): void
    {
        $columns = Schema::connection('mysql_fingerprint_check')->getColumns('feedback');
        $fingerprint = collect($columns)->firstWhere('name', 'fingerprint');

        $this->assertNotNull($fingerprint, 'feedback.fingerprint column not found');

        preg_match('/varchar\((\d+)\)/i', $fingerprint['type'], $matches);
        $this->assertNotEmpty(
            $matches,
            "feedback.fingerprint is not a varchar(N) column: {$fingerprint['type']}",
        );
        $this->assertGreaterThanOrEqual(
            255,
            (int) $matches[1],
            'feedback.fingerprint must be at least 255 characters wide to match the client\'s MAX_FINGERPRINT_LENGTH',
        );
    }

    /**
     * A-151: the same defect in two more indexed columns. Neither has a
     * client-side cap (unlike `fingerprint`, which had MAX_FINGERPRINT_LENGTH
     * all along), so a long value fails the push outright.
     *
     * @dataProvider widenedColumns
     */
    public function test_other_indexed_string_columns_are_at_least_255_wide(string $table, string $column): void
    {
        $columns = Schema::connection('mysql_fingerprint_check')->getColumns($table);
        $found = collect($columns)->firstWhere('name', $column);

        $this->assertNotNull($found, "{$table}.{$column} column not found");

        preg_match('/varchar\\((\\d+)\\)/i', $found['type'], $matches);
        $this->assertNotEmpty($matches, "{$table}.{$column} is not a varchar(N) column: {$found['type']}");
        $this->assertGreaterThanOrEqual(
            255,
            (int) $matches[1],
            "{$table}.{$column} is VARCHAR({$matches[1]}); defaultStringLength(191) silently narrowed it again"
        );
    }

    public static function widenedColumns(): array
    {
        return [
            'products.barcode' => ['products', 'barcode'],
            'activity_logs.correlation_id' => ['activity_logs', 'correlation_id'],
        ];
    }
}

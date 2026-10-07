<?php

namespace Tests\Feature;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SyncHealthSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_failures_table_has_the_forensic_columns(): void
    {
        $this->assertTrue(Schema::hasTable('sync_failures'));

        foreach (['id', 'store_id', 'user_id', 'table_name', 'record_id', 'operation', 'reason', 'created_at'] as $column) {
            $this->assertTrue(
                Schema::hasColumn('sync_failures', $column),
                "sync_failures is missing {$column}"
            );
        }
    }

    public function test_sync_health_daily_table_has_the_tally_columns(): void
    {
        $this->assertTrue(Schema::hasTable('sync_health_daily'));

        foreach (['id', 'store_id', 'date', 'pushes', 'changes_accepted', 'changes_refused'] as $column) {
            $this->assertTrue(
                Schema::hasColumn('sync_health_daily', $column),
                "sync_health_daily is missing {$column}"
            );
        }
    }

    /**
     * A refused change is forensic evidence: archiving a store must not
     * destroy the record of why its data never landed. Passes only if
     * store_id carries no foreign key.
     */
    public function test_a_sync_failure_survives_its_store_being_archived(): void
    {
        $failure = SyncFailure::create([
            'store_id' => '00000000-0000-0000-0000-00000000dead',
            'user_id' => null,
            'table_name' => 'sales',
            'record_id' => 'rec-1',
            'operation' => 'INSERT',
            'reason' => 'permission_denied',
        ]);

        $this->assertDatabaseHas('sync_failures', ['id' => $failure->id]);
    }

    public function test_the_daily_tally_is_unique_per_store_and_date(): void
    {
        $attributes = [
            'store_id' => '00000000-0000-0000-0000-00000000beef',
            'date' => '2026-10-07',
            'pushes' => 1,
            'changes_accepted' => 1,
            'changes_refused' => 0,
        ];

        SyncHealthDaily::create($attributes);

        $this->expectException(\Illuminate\Database\QueryException::class);
        SyncHealthDaily::create($attributes);
    }
}

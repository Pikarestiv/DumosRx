<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A batch of server-side columns that a client-vs-server schema diff (run
 * against the live database, comparing every STORE_SCOPED_TABLES entry and
 * every CREATE TABLE in client/lib/db/schema.ts against Schema::hasColumn())
 * found genuinely missing — each one causes every push for that field to
 * fail permanently (retrying can never fix a missing column), confirmed
 * live via real "stuck sync" Sentry reports for several of these
 * (prescription_items.unit_cost, loyalty_tiers/loyalty_redemption_options
 * .store_id, loyalty_redemption_options.discount_value, audit_logs.store_id).
 * The rest (stock_audits.store_id, held_transactions.store_id/discount/
 * discount_type, loyalty_transactions.store_id, stores.loyalty_program_enabled,
 * stock_batches.cost_price's missing default) hadn't surfaced yet only
 * because no user had happened to push a record touching that exact field,
 * not because they were fine.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['stock_audits', 'held_transactions', 'loyalty_transactions', 'audit_logs', 'loyalty_tiers', 'loyalty_redemption_options'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                if (!Schema::hasColumn($table, 'store_id')) {
                    $blueprint->uuid('store_id')->nullable()->index();
                }
            });
        }

        Schema::table('held_transactions', function (Blueprint $table) {
            if (!Schema::hasColumn('held_transactions', 'discount')) {
                $table->decimal('discount', 12, 2)->default(0);
            }
            if (!Schema::hasColumn('held_transactions', 'discount_type')) {
                $table->string('discount_type')->nullable();
            }
        });

        Schema::table('prescription_items', function (Blueprint $table) {
            if (!Schema::hasColumn('prescription_items', 'unit_cost')) {
                $table->decimal('unit_cost', 10, 2)->default(0);
            }
        });

        Schema::table('loyalty_redemption_options', function (Blueprint $table) {
            if (!Schema::hasColumn('loyalty_redemption_options', 'discount_value')) {
                $table->decimal('discount_value', 10, 2)->default(0);
            }
        });

        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'loyalty_program_enabled')) {
                $table->boolean('loyalty_program_enabled')->default(true);
            }
        });

        // Matches the client's own `cost_price REAL DEFAULT 0` for
        // stock_batches — a batch created with quantity 0 (e.g. a stock
        // audit's zero-quantity adjustment row) never had a real cost to
        // record, and the client's default let that through locally while
        // the server's NOT NULL-no-default column rejected the insert.
        Schema::table('stock_batches', function (Blueprint $table) {
            $table->decimal('cost_price', 10, 2)->default(0)->change();
        });

        // stock_audits, audit_logs, loyalty_tiers, and loyalty_redemption_options
        // already had a working getModelForTable() mapping before this fix, so
        // any rows that predate the store_id column (created via that path, or
        // via a dedicated non-sync endpoint that seeds default loyalty tiers)
        // need it backfilled — otherwise the new store-scoped pull query in
        // SyncController::pull() would silently make them invisible to every
        // device forever. Mirrors User::getDisplayStoreAttribute()'s same
        // "staff use their employer's store_id, an owner uses the store they
        // own" resolution. held_transactions/loyalty_transactions/
        // customer_payments are deliberately excluded: they never had a
        // working insert path at all before this migration (see the
        // SyncController comment above the model map), so there is nothing
        // to backfill for them.
        // MySQL-only: the multi-table UPDATE JOIN syntax isn't portable to
        // sqlite (used for PHPUnit's RefreshDatabase), and there's nothing
        // to backfill in a fresh test database anyway.
        if (DB::getDriverName() !== 'sqlite') {
            foreach (['stock_audits', 'audit_logs', 'loyalty_tiers', 'loyalty_redemption_options'] as $table) {
                DB::statement("
                    UPDATE `{$table}` t
                    JOIN `users` u ON u.id = t.user_id
                    LEFT JOIN `stores` owned ON owned.user_id = u.id
                    SET t.store_id = COALESCE(u.store_id, owned.id)
                    WHERE t.store_id IS NULL
                ");
            }
        }
    }

    public function down(): void
    {
        foreach (['stock_audits', 'held_transactions', 'loyalty_transactions', 'audit_logs', 'loyalty_tiers', 'loyalty_redemption_options'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('store_id');
            });
        }

        Schema::table('held_transactions', function (Blueprint $table) {
            $table->dropColumn(['discount', 'discount_type']);
        });

        Schema::table('prescription_items', function (Blueprint $table) {
            $table->dropColumn('unit_cost');
        });

        Schema::table('loyalty_redemption_options', function (Blueprint $table) {
            $table->dropColumn('discount_value');
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('loyalty_program_enabled');
        });

        Schema::table('stock_batches', function (Blueprint $table) {
            $table->decimal('cost_price', 10, 2)->change();
        });
    }
};

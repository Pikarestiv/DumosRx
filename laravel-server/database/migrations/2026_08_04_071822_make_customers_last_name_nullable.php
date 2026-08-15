<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// The client's customers table has only ever required first_name (see
// lib/db/schema.ts) — last_name has always been optional there. The
// server's original migration made it required and nothing since has
// reconciled the two, so any customer created client-side with no last
// name fails to sync, forever, with an integrity-constraint error. Raw SQL
// (not Schema::table()->change()) since this project doesn't have
// doctrine/dbal installed, which Laravel needs for column-modification via
// the schema builder. SQLite (used by the test suite) doesn't support
// `MODIFY` at all, so it gets a drop+re-add instead, which needs no dbal.
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropColumn('last_name');
                $table->string('last_name')->nullable()->after('first_name');
            });
            return;
        }

        DB::statement('ALTER TABLE customers MODIFY last_name VARCHAR(255) NULL');
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropColumn('last_name');
                $table->string('last_name')->default('')->after('first_name');
            });
            return;
        }

        DB::statement("ALTER TABLE customers MODIFY last_name VARCHAR(255) NOT NULL DEFAULT ''");
    }
};

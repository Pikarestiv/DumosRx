<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// The client's customers table has only ever required first_name (see
// lib/db/schema.ts) — last_name has always been optional there. The
// server's original migration made it required and nothing since has
// reconciled the two, so any customer created client-side with no last
// name fails to sync, forever, with an integrity-constraint error. Raw SQL
// (not Schema::table()->change()) since this project doesn't have
// doctrine/dbal installed, which Laravel needs for column-modification via
// the schema builder.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE customers MODIFY last_name VARCHAR(255) NULL');
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE customers MODIFY last_name VARCHAR(255) NOT NULL DEFAULT ''");
    }
};

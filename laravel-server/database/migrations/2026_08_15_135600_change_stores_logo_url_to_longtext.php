<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// stores.logo_url was added as the default `string()` VARCHAR(255), nowhere
// near enough for the base64 data URI the client actually stores there (up
// to ~1.4MB for a 1MB upload). Every real logo save would have failed or
// truncated silently at the DB layer even once it reached here. doctrine/dbal
// isn't installed, so this uses raw SQL like the project's other in-place
// column-type changes; SQLite has no fixed-length string type so it's a no-op
// there (already unbounded TEXT-backed storage).
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE stores MODIFY logo_url LONGTEXT NULL');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE stores MODIFY logo_url VARCHAR(255) NULL');
        }
    }
};

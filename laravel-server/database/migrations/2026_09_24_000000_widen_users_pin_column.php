<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `users.pin` was created as VARCHAR(4)
 * (2026_05_16_070000_add_sync_fields_to_users_table.php) because the POS
 * unlock PIN was stored in plaintext - exactly 4 digits. PINs are now
 * bcrypt-hashed everywhere they're written (StaffController,
 * ManagesProfile::updatePin, RegistersAccounts::register,
 * AdminStoreService::registerStore, and client-side on the lazy
 * "hash on next successful login" migration path, which arrives here via
 * an ordinary sync push), and a bcrypt hash is ~60 characters. Without
 * this, every hashed PIN would be silently truncated to 4 characters on
 * write - which would lock people out.
 *
 * Purely additive/widening: existing 4-char plaintext values are still
 * valid VARCHAR(255) content and keep working until each device's next
 * successful login rewrites them as a hash.
 */
return new class extends Migration
{
    public function up(): void
    {
        // SQLite (the test suite's driver - see phpunit.xml) ignores
        // VARCHAR length entirely, so the column already holds a hash
        // there and there's nothing to migrate.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE users MODIFY pin VARCHAR(255) NULL');
        }
    }

    public function down(): void
    {
        // Deliberately NOT narrowing back to VARCHAR(4): any PIN hashed
        // while this migration was applied would be truncated to garbage
        // (an unrecoverable lockout), so the reverse is a no-op.
    }
};

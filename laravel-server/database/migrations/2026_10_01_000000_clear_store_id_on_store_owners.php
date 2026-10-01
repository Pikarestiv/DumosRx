<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `users.store_id` marks a STAFF member's employer store; a store owner's
     * own row is supposed to leave it null. Accounts created before commit
     * e15105b1 (2026-09-22) carry a stale value anyway, because the client
     * stamped the owner's own local `users` row with it and the server
     * forceFilled the pushed row verbatim. SyncController no longer trusts
     * that column over real `stores.user_id` ownership, and this clears the
     * historical poisoning behind it — see docs/FIXED_BUGS.md A-127.
     *
     * updated_at is bumped explicitly so every device's next pull picks the
     * correction up; without it, only the server's copy changes.
     *
     * Not reversible: the original per-user value is exactly the data this
     * removes, and restoring it would reintroduce the bug.
     */
    public function up(): void
    {
        DB::table('users')
            ->whereNotNull('store_id')
            ->whereIn('id', DB::table('stores')->whereNull('deleted_at')->select('user_id'))
            ->update([
                'store_id' => null,
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
    }
};

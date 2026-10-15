<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Before this, the client rendered `receipt_footer || "Thank you for your
 * patronage!"`, so the text was hardcoded and an empty footer was impossible
 * to express. The client now treats NULL as "never set" (print the default)
 * and an empty string as "deliberately blank" (print nothing).
 *
 * Every store that saved its receipt settings before today wrote an empty
 * string, because the form initialised to "" — under the new rule those
 * stores would silently stop printing a footer they have always printed. This
 * writes the text they are already getting, so their receipts do not change,
 * and an empty string from here on means the owner cleared it on purpose.
 *
 * Soft-deleted stores are included on purpose: restoreStore() brings one back
 * months later, and a trashed row left holding '' would come back printing no
 * footer - the exact regression this exists to prevent.
 *
 * `updated_at` is set from PHP (UTC), never MySQL's NOW() (root AGENTS.md §7).
 * It is bookkeeping, not the propagation mechanism: `stores` is exempt from
 * the pull cursor (SyncController::applyPullCursor), so every pull returns
 * every owned store row anyway.
 */
return new class extends Migration
{
    private const DEFAULT_FOOTER = 'Thank you for your patronage!';

    public function up(): void
    {
        DB::table('stores')
            ->where(function ($query) {
                $query->whereNull('receipt_footer')->orWhere('receipt_footer', '');
            })
            ->update(['receipt_footer' => self::DEFAULT_FOOTER, 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('stores')
            ->where('receipt_footer', self::DEFAULT_FOOTER)
            ->update(['receipt_footer' => null, 'updated_at' => now()]);
    }
};

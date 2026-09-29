<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Bulk CSV/XLSX import writes a quantity-correcting stock_movements row
     * tagged reference_type "stock_audit" (indistinguishable from a genuine
     * manual cycle count) for every row written before commit 3b7ce8b8. The
     * client's Adjustments ledger now also matches the legacy reason string
     * as a heal-on-read fallback, so this is a display-hygiene cleanup, not
     * a correctness requirement — see docs/FIXED_BUGS.md.
     *
     * updated_at is bumped explicitly so every device's next pull re-sends
     * the corrected reference_type; without it, this only changes the
     * server's copy.
     */
    public function up(): void
    {
        DB::table('stock_movements')
            ->where('movement_type', 'adjustment')
            ->where('reference_type', 'stock_audit')
            ->where('reason', 'like', 'Bulk import stock update%')
            ->update([
                'reference_type' => 'import',
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        DB::table('stock_movements')
            ->where('movement_type', 'adjustment')
            ->where('reference_type', 'import')
            ->where('reason', 'like', 'Bulk import stock update%')
            ->update([
                'reference_type' => 'stock_audit',
                'updated_at' => now(),
            ]);
    }
};

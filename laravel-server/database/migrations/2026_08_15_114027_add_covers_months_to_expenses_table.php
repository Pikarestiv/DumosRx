<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            // Optional reporting hint — a lump-sum expense (e.g. a year's
            // rent) spread over this many months for P&L smoothing, not a
            // real accrual ledger. Null means "recognize entirely in the
            // period it was logged," today's existing behavior.
            $table->unsignedSmallInteger('covers_months')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropColumn('covers_months');
        });
    }
};

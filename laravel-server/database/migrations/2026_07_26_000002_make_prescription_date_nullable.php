<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // prescription_date is a legacy NOT NULL column from the original schema
        // (before the client switched to issued_at). The client never sends it,
        // so every prescription push has failed with a NOT NULL violation.
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->date('prescription_date')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->date('prescription_date')->nullable(false)->change();
        });
    }
};
